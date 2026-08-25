"use client";

// Retailer Hub → Customers: typed-in prospect CRM for new-account chasing.
// Pipeline stages, quick add/edit, and a per-customer drawer showing every
// tracked send (with opens) and any application form submissions.
import { useEffect, useMemo, useState } from "react";
import { HubSendModal, SendRow } from "./HubSendModal";

type Customer = {
  id: string; store_name: string; contact_name: string | null; email: string | null; phone: string | null;
  address: string | null; state: string | null; postcode: string | null; abn: string | null; website: string | null;
  brands: string[]; stage: string; source: string | null; notes: string | null;
  next_action: string | null; next_action_date: string | null; created_at: string;
  activity: { sends: number; opens: number; last_open: string | null; forms: number };
};

const STAGES: { key: string; label: string; cls: string }[] = [
  { key: "lead", label: "Lead", cls: "bg-slate-100 text-slate-600" },
  { key: "contacted", label: "Contacted", cls: "bg-sky-100 text-sky-700" },
  { key: "meeting", label: "Meeting / Samples", cls: "bg-violet-100 text-violet-700" },
  { key: "terms_sent", label: "Terms Sent", cls: "bg-amber-100 text-amber-700" },
  { key: "first_order", label: "First Order", cls: "bg-emerald-100 text-emerald-700" },
  { key: "active", label: "Active", cls: "bg-emerald-500 text-white" },
  { key: "lost", label: "Lost", cls: "bg-rose-100 text-rose-600" },
];
const STATES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2";
const lbl = "block text-[10px] font-semibold text-slate-400 uppercase mb-1";
const dShort = (s?: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";

const EMPTY = { store_name: "", contact_name: "", email: "", phone: "", address: "", state: "", postcode: "", abn: "", website: "", brands: [] as string[], stage: "lead", source: "", notes: "", next_action: "", next_action_date: "" };

export function SalesCustomers({ brandNames, canEdit, admin }: { brandNames: string[]; canEdit: boolean; admin: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "created", dir: -1 });
  const [editing, setEditing] = useState<any | null>(null); // EMPTY-shaped + optional id
  const [detail, setDetail] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const r = await fetch("/api/customers", { cache: "no-store" }).then(x => x.json()).catch(() => ({ ok: false }));
    if (r.needsSetup) { setState("needsSetup"); return; }
    if (!r.ok) { setState("error"); return; }
    setCustomers(r.customers || []); setState("ready");
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => customers.filter(c =>
    (stageFilter === "all" || c.stage === stageFilter) &&
    (!q.trim() || `${c.store_name} ${c.contact_name ?? ""} ${c.email ?? ""} ${c.state ?? ""} ${(c.brands || []).join(" ")} ${(c as any).notes ?? ""} ${(c as any).source ?? ""}`.toLowerCase().includes(q.toLowerCase()))
  ), [customers, q, stageFilter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of customers) m[c.stage] = (m[c.stage] || 0) + 1;
    return m;
  }, [customers]);

  const stageRank = (s: string) => STAGES.findIndex(x => x.key === s);
  const sorted = useMemo(() => {
    const val = (c: Customer): any => {
      switch (sort.key) {
        case "store": return c.store_name.toLowerCase();
        case "contact": return (c.contact_name || c.email || "￿").toLowerCase();
        case "state": return c.state || "￿";
        case "brands": return (c.brands || []).length ? (c.brands || []).join(", ").toLowerCase() : "￿";
        case "stage": return stageRank(c.stage);
        case "engagement": return -(c.activity.opens * 1000 + c.activity.sends);
        case "next": return c.next_action_date || "￿";
        default: return c.created_at;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [filtered, sort]);

  const th = (key: string, label: string, first = false) => (
    <th className={`${first ? "px-4" : "px-2"} py-3`}>
      <button onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className={`uppercase tracking-wide flex items-center gap-1 hover:text-slate-600 ${sort.key === key ? "text-slate-600" : ""}`}>
        {label}{sort.key === key && <span>{sort.dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  async function save() {
    if (!editing.store_name.trim()) { setErr("Store name is required."); return; }
    setBusy(true); setErr("");
    const isNew = !editing.id;
    const body = { ...editing, next_action_date: editing.next_action_date || null };
    const r = await fetch(isNew ? "/api/customers" : `/api/customers?id=${editing.id}`, {
      method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(x => x.json()).catch(() => ({ ok: false, error: "Save failed" }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Save failed"); return; }
    setEditing(null); load();
  }

  async function setStage(c: Customer, stage: string) {
    setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, stage } : x));
    await fetch(`/api/customers?id=${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) }).catch(() => {});
  }
  async function remove(c: Customer) {
    if (!window.confirm(`Delete ${c.store_name}? Their tracked sends stay but lose the link to this record.`)) return;
    await fetch(`/api/customers?id=${c.id}`, { method: "DELETE" }).catch(() => {});
    setDetail(null); load();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_retailer_hub.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load customers.</div>;

  return (
    <div className="space-y-4">
      {/* Pipeline summary */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStageFilter("all")} className={`text-[12px] font-semibold rounded-full px-3 py-1.5 border ${stageFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"}`}>All ({customers.length})</button>
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setStageFilter(stageFilter === s.key ? "all" : s.key)}
            className={`text-[12px] font-semibold rounded-full px-3 py-1.5 border ${stageFilter === s.key ? "border-slate-800" : "border-transparent"} ${s.cls}`}>
            {s.label} ({counts[s.key] || 0})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search stores, contacts, notes — try “Grade A” or “Toy Store”…" className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-80" />
        <span className="text-[11.5px] text-slate-400">{filtered.length} shown</span>
        {canEdit && <button onClick={() => { setErr(""); setEditing({ ...EMPTY }); }} className="ml-auto text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">+ Add customer</button>}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No customers yet — add the accounts you're chasing.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[10.5px] text-slate-400 border-b border-slate-100">
                {th("store", "Store", true)}{th("contact", "Contact")}{th("state", "State")}
                {th("brands", "Brands")}{th("stage", "Stage")}{th("engagement", "Engagement")}{th("next", "Next action")}
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const st = STAGES.find(s => s.key === c.stage) || STAGES[0];
                return (
                  <tr key={c.id} onClick={() => setDetail(c)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer">
                    <td className="px-4 py-3 font-bold text-slate-800">{c.store_name}</td>
                    <td className="px-2 py-3 text-slate-500">{c.contact_name || "—"}<br /><span className="text-[11px] text-slate-400">{c.email || ""}</span></td>
                    <td className="px-2 py-3 text-slate-500">{c.state || "—"}</td>
                    <td className="px-2 py-3 text-[11.5px] text-slate-500 max-w-[160px]">{(c.brands || []).join(", ") || "—"}</td>
                    <td className="px-2 py-3"><span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${st.cls}`}>{st.label}</span></td>
                    <td className="px-2 py-3 text-[11.5px]">
                      {c.activity.sends === 0 ? <span className="text-slate-300">nothing sent</span> : (
                        <span className={c.activity.opens > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                          {c.activity.sends} sent · {c.activity.opens} opens{c.activity.last_open ? ` · last ${dShort(c.activity.last_open)}` : ""}
                        </span>
                      )}
                      {c.activity.forms > 0 && <span className="block text-violet-600 font-semibold">{c.activity.forms} form{c.activity.forms === 1 ? "" : "s"} submitted</span>}
                    </td>
                    <td className="px-2 py-3 text-[11.5px] text-slate-500">{c.next_action ? <>{c.next_action}<br /><span className="text-slate-400">{dShort(c.next_action_date)}</span></> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-slate-900 mb-4">{editing.id ? "Edit customer" : "Add customer"}</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2"><label className={lbl}>Store / trading name *</label><input className={inp} value={editing.store_name} onChange={e => setEditing({ ...editing, store_name: e.target.value })} /></div>
              <div><label className={lbl}>ABN</label><input className={inp} value={editing.abn ?? ""} onChange={e => setEditing({ ...editing, abn: e.target.value })} /></div>
              <div><label className={lbl}>Contact name</label><input className={inp} value={editing.contact_name ?? ""} onChange={e => setEditing({ ...editing, contact_name: e.target.value })} /></div>
              <div><label className={lbl}>Email</label><input type="email" className={inp} value={editing.email ?? ""} onChange={e => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><label className={lbl}>Phone</label><input className={inp} value={editing.phone ?? ""} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={lbl}>Address</label><input className={inp} value={editing.address ?? ""} onChange={e => setEditing({ ...editing, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>State</label><select className={inp} value={editing.state ?? ""} onChange={e => setEditing({ ...editing, state: e.target.value })}><option value="">—</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label className={lbl}>Postcode</label><input className={inp} value={editing.postcode ?? ""} onChange={e => setEditing({ ...editing, postcode: e.target.value })} /></div>
              </div>
              <div className="sm:col-span-2"><label className={lbl}>Website / Instagram</label><input className={inp} value={editing.website ?? ""} onChange={e => setEditing({ ...editing, website: e.target.value })} /></div>
              <div><label className={lbl}>Source</label><input className={inp} placeholder="e.g. expo, rep visit" value={editing.source ?? ""} onChange={e => setEditing({ ...editing, source: e.target.value })} /></div>
              <div className="sm:col-span-3"><label className={lbl}>Brands pitched</label>
                <div className="flex flex-wrap gap-1.5">
                  {brandNames.map(b => (
                    <button type="button" key={b} onClick={() => setEditing({ ...editing, brands: editing.brands.includes(b) ? editing.brands.filter((x: string) => x !== b) : [...editing.brands, b] })}
                      className={`text-[12px] font-semibold rounded-full px-3 py-1 border ${editing.brands.includes(b) ? "bg-sky-500 border-sky-500 text-white" : "bg-white border-slate-200 text-slate-500"}`}>{b}</button>
                  ))}
                </div>
              </div>
              <div><label className={lbl}>Stage</label><select className={inp} value={editing.stage} onChange={e => setEditing({ ...editing, stage: e.target.value })}>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
              <div><label className={lbl}>Next action</label><input className={inp} placeholder="e.g. follow up call" value={editing.next_action ?? ""} onChange={e => setEditing({ ...editing, next_action: e.target.value })} /></div>
              <div><label className={lbl}>Next action date</label><input type="date" className={inp} value={editing.next_action_date ?? ""} onChange={e => setEditing({ ...editing, next_action_date: e.target.value })} /></div>
              <div className="sm:col-span-3"><label className={lbl}>Notes</label><textarea rows={3} className={inp} value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
            {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
              <button onClick={save} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <CustomerDrawer
          customer={customers.find(c => c.id === detail.id) || detail}
          canEdit={canEdit} admin={admin}
          onClose={() => setDetail(null)}
          onEdit={() => { setErr(""); setEditing({ ...EMPTY, ...Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, v ?? ""])), brands: detail.brands || [], id: detail.id }); setDetail(null); }}
          onStage={(stage) => setStage(detail, stage)}
          onDelete={admin ? () => remove(detail) : undefined}
        />
      )}
    </div>
  );
}

function CustomerDrawer({ customer: c, canEdit, admin, onClose, onEdit, onStage, onDelete }: {
  customer: Customer; canEdit: boolean; admin: boolean; onClose: () => void; onEdit: () => void; onStage: (s: string) => void; onDelete?: () => void;
}) {
  const [sends, setSends] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  function loadActivity() {
    fetch(`/api/hub-send?customer_id=${c.id}`).then(r => r.json()).then(d => { if (d.ok) setSends(d.sends || []); }).catch(() => {});
    fetch(`/api/customer-forms?customer_id=${c.id}`).then(r => r.json()).then(d => { if (d.ok) setForms(d.submissions || []); }).catch(() => {});
  }
  useEffect(() => { loadActivity(); /* eslint-disable-next-line */ }, [c.id]);

  async function revoke(id: string) {
    if (!window.confirm("Revoke this link?")) return;
    await fetch(`/api/hub-send?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadActivity();
  }

  const st = STAGES.find(s => s.key === c.stage) || STAGES[0];
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-lg font-extrabold text-slate-900">{c.store_name}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl leading-none">×</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${st.cls}`}>{st.label}</span>
          {canEdit && (
            <select value={c.stage} onChange={e => onStage(e.target.value)} className="text-[11.5px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-500">
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
          {canEdit && <button onClick={onEdit} className="text-[12px] font-semibold text-sky-600 hover:underline ml-auto">Edit details</button>}
          {onDelete && <button onClick={onDelete} className="text-[12px] text-rose-400 hover:underline">Delete</button>}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] mb-4">
          <Field k="Contact" v={c.contact_name} /><Field k="Email" v={c.email} />
          <Field k="Phone" v={c.phone} /><Field k="ABN" v={c.abn} />
          <Field k="Address" v={[c.address, c.state, c.postcode].filter(Boolean).join(", ")} /><Field k="Website" v={c.website} />
          <Field k="Source" v={c.source} /><Field k="Brands" v={(c.brands || []).join(", ")} />
          <Field k="Next action" v={c.next_action ? `${c.next_action} (${dShort(c.next_action_date)})` : null} />
        </div>
        {c.notes && <p className="text-[13px] text-slate-500 bg-slate-50 rounded-lg p-3 mb-4 whitespace-pre-line">{c.notes}</p>}

        <button onClick={() => setSending(true)} className="w-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold rounded-xl py-2.5 mb-5">Send a new customer form →</button>

        <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1">Sent &amp; tracked</h4>
        <div className="mb-5">
          {sends.length === 0 ? <p className="text-sm text-slate-300 py-2">Nothing sent yet — send them a price list, overview, fact sheet or terms from those tabs.</p>
            : sends.map(s => <SendRow key={s.id} s={s} admin={admin} onRevoke={revoke} />)}
        </div>

        <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1">Form submissions</h4>
        {forms.length === 0 ? <p className="text-sm text-slate-300 py-2">No applications submitted yet.</p> : forms.map(f => (
          <div key={f.id} className="border border-slate-100 rounded-lg p-3 mb-2 text-[12.5px]">
            <p className="font-semibold text-slate-700">{f.store_name} · {dShort(f.created_at)} <span className="text-slate-400 font-normal">({f.status})</span></p>
            <p className="text-slate-500">{f.contact_name} · {f.email} · {f.phone || "no phone"}</p>
            {Array.isArray(f.data?.brands) && f.data.brands.length > 0 && <p className="text-slate-400">Brands: {f.data.brands.join(", ")}</p>}
          </div>
        ))}

        {sending && (
          <HubSendModal
            items={[{ kind: "form", title: "Credit Application Form" }]}
            presetCustomerId={c.id}
            onClose={() => setSending(false)}
            onSent={loadActivity}
          />
        )}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><span className="block text-[10px] font-semibold text-slate-400 uppercase">{k}</span><span className="text-slate-700">{v || "—"}</span></div>;
}
