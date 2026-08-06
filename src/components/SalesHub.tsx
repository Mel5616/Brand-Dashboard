"use client";

import { useEffect, useMemo, useState } from "react";
import { GUIDELINE_SECTIONS } from "./salesHubGuidelines";

type ReqType = "artwork" | "swatch" | "tune_up" | "product";
type Status = "new" | "triaged" | "in_progress" | "review" | "delivered" | "on_hold" | "declined";
type Req = {
  id: string; request_type: ReqType; status: Status; requester_email: string; requester_name: string | null;
  assignee_email: string | null; brand: string | null; retailer: string | null; store: string | null; state: string | null;
  title: string; end_use: string; needed_by: string | null; brief: any; sla_due_at: string | null;
  decline_reason: string | null; created_at: string; updated_at: string;
};
type FileRow = { id: number; storage_path: string; file_name: string | null; kind: string | null; uploaded_by: string | null; created_at: string };
type EventRow = { id: number; actor: string | null; from_status: string | null; to_status: string | null; note: string | null; created_at: string };

const TYPE_META: Record<ReqType, { label: string; emoji: string; guide: string }> = {
  artwork: { label: "Artwork Request", emoji: "🎨", guide: "images" },
  swatch: { label: "Swatch / Sample", emoji: "🧵", guide: "images" },
  tune_up: { label: "Tune-Up Nomination", emoji: "🔧", guide: "tune-up-days" },
  product: { label: "Product / Gifting", emoji: "🎁", guide: "product-and-gifting" },
};
const STATUS_META: Record<Status, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-slate-100 text-slate-600" },
  triaged: { label: "Triaged", cls: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  review: { label: "Review", cls: "bg-violet-100 text-violet-700" },
  delivered: { label: "Delivered", cls: "bg-emerald-100 text-emerald-700" },
  on_hold: { label: "On hold", cls: "bg-gray-100 text-gray-500" },
  declined: { label: "Declined", cls: "bg-rose-100 text-rose-700" },
};
const STATES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full";
const lbl = "text-xs font-semibold text-slate-500 mb-1 block";
const dShort = (s?: string | null) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";

function RuleCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-[13px] text-indigo-900 leading-relaxed mb-4">{children}</div>;
}
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <div><span className={lbl}>{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</div>;
}

export function SalesHub({ admin, brands }: { admin: boolean; brands: { name: string; color?: string }[] }) {
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<"landing" | "queue" | "new" | "guidelines">("landing");
  const [newType, setNewType] = useState<ReqType>("artwork");
  const [guideId, setGuideId] = useState<string>(GUIDELINE_SECTIONS[0]?.id ?? "");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  function load() {
    setLoading(true);
    fetch("/api/sales-requests").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) setItems(d.items ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const mine = useMemo(() => items.filter(i => !["delivered", "declined"].includes(i.status)), [items]);
  const filtered = useMemo(() => items.filter(i =>
    (statusFilter === "all" || i.status === statusFilter) &&
    (!q.trim() || `${i.title} ${i.brand ?? ""} ${i.retailer ?? ""} ${i.requester_email}`.toLowerCase().includes(q.toLowerCase()))
  ), [items, statusFilter, q]);

  const analytics = useMemo(() => {
    if (!admin) return null;
    const now = Date.now();
    const byType: Record<string, number> = {};
    let overdue = 0, unassigned = 0;
    const declinedThisMonth: Req[] = [];
    const mk = new Date().toISOString().slice(0, 7);
    for (const r of items) {
      if (!["delivered", "declined"].includes(r.status)) {
        byType[r.request_type] = (byType[r.request_type] ?? 0) + 1;
        if (r.sla_due_at && new Date(r.sla_due_at).getTime() < now) overdue++;
        if (!r.assignee_email) unassigned++;
      }
      if (r.status === "declined" && r.updated_at.slice(0, 7) === mk) declinedThisMonth.push(r);
    }
    return { byType, overdue, unassigned, declinedThisMonth };
  }, [items, admin]);

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_sales_hub.sql</code> to set up the Sales Hub.</div>;
  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  const detail = detailId ? items.find(i => i.id === detailId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Sales Hub</h2>
          <p className="text-sm text-gray-400 mt-0.5">Request artwork, swatches, Tune-Up Days and product — plus the rules to check before you ask.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView("landing"); setDetailId(null); }} className={`text-sm font-medium rounded-lg px-3 py-1.5 border transition ${view === "landing" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>Home</button>
          <button onClick={() => { setView("queue"); setDetailId(null); }} className={`text-sm font-medium rounded-lg px-3 py-1.5 border transition ${view === "queue" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>{admin ? "All requests" : "My requests"} ({items.length})</button>
          <button onClick={() => { setView("guidelines"); setDetailId(null); }} className={`text-sm font-medium rounded-lg px-3 py-1.5 border transition ${view === "guidelines" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>Guidelines</button>
        </div>
      </div>

      {detail ? (
        <RequestDetail item={detail} admin={admin} onBack={() => setDetailId(null)} onChanged={load} />
      ) : view === "landing" ? (
        <Landing brands={brands} mine={mine} onPick={t => { setNewType(t); setView("new"); }} onOpenRequest={id => setDetailId(id)} onGuide={id => { setGuideId(id); setView("guidelines"); }} />
      ) : view === "guidelines" ? (
        <Guidelines active={guideId} onSelect={setGuideId} />
      ) : view === "new" ? (
        <NewRequest type={newType} setType={setNewType} brands={brands} onCreated={id => { load(); setDetailId(id); setView("queue"); }} onCancel={() => setView("landing")} />
      ) : (
        <QueueView items={filtered} admin={admin} analytics={analytics} q={q} setQ={setQ} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onOpen={id => setDetailId(id)} onNew={() => setView("new")} />
      )}
    </div>
  );
}

function Landing({ brands, mine, onPick, onOpenRequest, onGuide }: { brands: { name: string }[]; mine: Req[]; onPick: (t: ReqType) => void; onOpenRequest: (id: string) => void; onGuide: (id: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(TYPE_META) as ReqType[]).map(t => (
          <button key={t} onClick={() => onPick(t)} className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-indigo-200 transition">
            <div className="text-2xl">{TYPE_META[t].emoji}</div>
            <div className="font-semibold text-slate-800 mt-2">{TYPE_META[t].label}</div>
            <div className="text-xs text-gray-400 mt-1">{t === "product" ? "Routes to Sales leadership" : "Routes to Marketing"}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-700">My open requests</h3>
        </div>
        {mine.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No open requests.</p> : (
          <div className="divide-y divide-gray-100">
            {mine.slice(0, 8).map(r => (
              <button key={r.id} onClick={() => onOpenRequest(r.id)} className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{TYPE_META[r.request_type].emoji} {r.title}</div>
                  <div className="text-[11px] text-gray-400">{r.brand ?? "—"} · needed {dShort(r.needed_by)}</div>
                </div>
                <span className={`text-[10.5px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Rules — read before you ask</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {GUIDELINE_SECTIONS.map(g => (
            <button key={g.id} onClick={() => onGuide(g.id)} className="text-left text-sm text-slate-600 border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 hover:border-indigo-200 transition">{g.title}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Guidelines({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const g = GUIDELINE_SECTIONS.find(x => x.id === active) ?? GUIDELINE_SECTIONS[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 h-fit lg:sticky lg:top-4">
        {GUIDELINE_SECTIONS.map(s => (
          <button key={s.id} onClick={() => onSelect(s.id)} className={`w-full text-left text-sm rounded-lg px-3 py-2 transition ${s.id === g.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-gray-50"}`}>{s.title}</button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="prose-sm max-w-none text-slate-700">{g.body}</div>
        <div className="mt-6 pt-3 border-t border-gray-100 text-[11px] text-gray-400">Owner: {g.owner} · v{g.version} · last reviewed {g.lastReviewed}</div>
      </div>
    </div>
  );
}

function QueueView({ items, admin, analytics, q, setQ, statusFilter, setStatusFilter, onOpen, onNew }: {
  items: Req[]; admin: boolean; analytics: { byType: Record<string, number>; overdue: number; unassigned: number; declinedThisMonth: Req[] } | null;
  q: string; setQ: (s: string) => void; statusFilter: "all" | Status; setStatusFilter: (s: "all" | Status) => void; onOpen: (id: string) => void; onNew: () => void;
}) {
  return (
    <div className="space-y-3">
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(TYPE_META) as ReqType[]).map(t => (
            <div key={t} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <div className="text-[10.5px] uppercase tracking-wide text-gray-400 font-semibold">{TYPE_META[t].emoji} {TYPE_META[t].label}</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{analytics.byType[t] ?? 0}</div>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className="text-[10.5px] uppercase tracking-wide text-gray-400 font-semibold">Overdue vs SLA</div>
            <div className={`text-xl font-bold mt-1 ${analytics.overdue > 0 ? "text-rose-600" : "text-slate-800"}`}>{analytics.overdue}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className="text-[10.5px] uppercase tracking-wide text-gray-400 font-semibold">Unassigned</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{analytics.unassigned}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 col-span-2">
            <div className="text-[10.5px] uppercase tracking-wide text-gray-400 font-semibold">Declined this month</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{analytics.declinedThisMonth.length}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStatusFilter("all")} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${statusFilter === "all" ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>All</button>
          {(Object.keys(STATUS_META) as Status[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${statusFilter === s ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{STATUS_META[s].label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className={`${inp} w-56`} />
          <button onClick={onNew} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 whitespace-nowrap">+ New request</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-[10.5px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="text-left py-2 pl-4">Request</th><th className="text-left py-2">Type</th><th className="text-left py-2">Brand</th>
            <th className="text-left py-2">Requester</th><th className="text-left py-2">Needed by</th><th className="text-left py-2">Status</th><th className="text-left py-2 pr-4">Assignee</th>
          </tr></thead>
          <tbody>
            {items.map(r => {
              const overdue = r.sla_due_at && !["delivered", "declined"].includes(r.status) && new Date(r.sla_due_at).getTime() < Date.now();
              return (
                <tr key={r.id} onClick={() => onOpen(r.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <td className="py-2.5 pl-4 font-medium text-slate-700">{TYPE_META[r.request_type].emoji} {r.title}</td>
                  <td className="py-2.5 text-gray-500">{TYPE_META[r.request_type].label}</td>
                  <td className="py-2.5 text-gray-500">{r.brand ?? "—"}</td>
                  <td className="py-2.5 text-gray-500">{r.requester_email}</td>
                  <td className={`py-2.5 ${overdue ? "text-rose-600 font-bold" : "text-gray-500"}`}>{dShort(r.needed_by)}</td>
                  <td className="py-2.5"><span className={`text-[10.5px] font-bold px-2 py-1 rounded-full ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span></td>
                  <td className="py-2.5 pr-4 text-gray-400">{r.assignee_email ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No requests match.</p>}
      </div>
    </div>
  );
}

function AckBox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-600 mt-4">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}

function NewRequest({ type, setType, brands, onCreated, onCancel }: { type: ReqType; setType: (t: ReqType) => void; brands: { name: string }[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState<any>({});
  useEffect(() => { setF({}); setAck(false); setErr(""); setFile(null); }, [type]);

  async function submit(payload: { title: string; brand?: string; retailer?: string; store?: string; state?: string; end_use: string; needed_by?: string; brief: any }) {
    if (!ack) { setErr("Please confirm you've read the rules first."); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/sales-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_type: type, requester_name: f.requester_name, ...payload }) }).then(r => r.json()).catch(() => ({ ok: false }));
    if (!res.ok) { setBusy(false); setErr(res.error || "Couldn't submit."); return; }
    if (file) {
      const fd = new FormData(); fd.append("request_id", res.item.id); fd.append("kind", "attachment"); fd.append("file", file);
      await fetch("/api/sales-requests/upload", { method: "POST", body: fd }).catch(() => {});
    }
    setBusy(false);
    onCreated(res.item.id);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5">
          {(Object.keys(TYPE_META) as ReqType[]).map(t => (
            <button key={t} onClick={() => setType(t)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${type === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{TYPE_META[t].emoji} {TYPE_META[t].label}</button>
          ))}
        </div>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      {type === "artwork" && <ArtworkForm brands={brands} f={f} setF={setF} file={file} setFile={setFile} ack={ack} setAck={setAck} onSubmit={submit} />}
      {type === "swatch" && <SwatchForm brands={brands} f={f} setF={setF} ack={ack} setAck={setAck} onSubmit={submit} />}
      {type === "tune_up" && <TuneUpForm f={f} setF={setF} file={file} setFile={setFile} ack={ack} setAck={setAck} onSubmit={submit} />}
      {type === "product" && <ProductForm brands={brands} f={f} setF={setF} ack={ack} setAck={setAck} onSubmit={submit} />}

      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      <div className="mt-4 flex justify-end">
        <button disabled={busy} onClick={() => (document.getElementById(`submit-${type}`) as HTMLButtonElement)?.click()} className="hidden" />
      </div>
    </div>
  );
}

function ArtworkForm({ brands, f, setF, file, setFile, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  const isResize = f.artworkRequestType === "resize";
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Artwork · ${f.brand ?? "brand TBC"} · ${f.artworkRequestType === "resize" ? "resize" : f.artworkRequestType === "copy_update" ? "copy update" : "new asset"}`,
      brand: f.brand, retailer: f.retailer, end_use: f.whereAppears || "Not specified",
      needed_by: f.live_date,
      brief: { artworkRequestType: f.artworkRequestType, whereAppears: f.whereAppears, specs: f.specs, copy: f.copy, hasPrice: f.hasPrice, rrp: f.rrp, promoApprovedBy: f.promoApprovedBy, promoStart: f.promoStart, promoEnd: f.promoEnd, liveDate: f.live_date, inMarketUntil: f.inMarketUntil },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>Lead time depends on the type of request below — a resize of existing approved artwork is fastest. Artwork showing a price needs an approved promotion (confirmed RRP + sign-off + dates). We cannot turn artwork around same day.</RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Brand" required><select className={inp} value={f.brand ?? ""} onChange={e => setF({ ...f, brand: e.target.value })}><option value="">Select…</option>{brands.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></Field>
        <Field label="Retailer / store" required><input className={inp} value={f.retailer ?? ""} onChange={e => setF({ ...f, retailer: e.target.value })} /></Field>
      </div>
      <Field label="Request type" required>
        <div className="flex gap-3 text-sm">
          {[["new", "New artwork"], ["resize", "Resize of existing approved artwork"], ["copy_update", "Copy update only"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5"><input type="radio" name="artworkRequestType" checked={f.artworkRequestType === v} onChange={() => setF({ ...f, artworkRequestType: v })} />{l}</label>
          ))}
        </div>
      </Field>
      <Field label="Where will it appear" required>
        <select className={inp} value={f.whereAppears ?? ""} onChange={e => setF({ ...f, whereAppears: e.target.value })}>
          <option value="">Select…</option>
          {["In-store POS", "Retailer EDM", "Retailer social", "Catalogue or brochure", "Event", "Other"].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      {!isResize && <Field label="Specs required" required><textarea className={inp} rows={2} placeholder="Format, width x height, unit (mm/px), file type — one per line" value={f.specs ?? ""} onChange={e => setF({ ...f, specs: e.target.value })} /></Field>}
      {isResize && <Field label="Which existing artwork + new size" required><textarea className={inp} rows={2} value={f.specs ?? ""} onChange={e => setF({ ...f, specs: e.target.value })} /></Field>}
      {!isResize && <Field label="Copy required"><textarea className={inp} rows={2} value={f.copy ?? ""} onChange={e => setF({ ...f, copy: e.target.value })} /></Field>}
      <Field label="Does it include a price?" required>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="hasPrice" checked={f.hasPrice === true} onChange={() => setF({ ...f, hasPrice: true })} />Yes</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="hasPrice" checked={f.hasPrice === false} onChange={() => setF({ ...f, hasPrice: false })} />No</label>
        </div>
      </Field>
      {f.hasPrice && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
          <Field label="RRP" required><input className={inp} value={f.rrp ?? ""} onChange={e => setF({ ...f, rrp: e.target.value })} /></Field>
          <Field label="Who approved this promotion" required><input className={inp} value={f.promoApprovedBy ?? ""} onChange={e => setF({ ...f, promoApprovedBy: e.target.value })} /></Field>
          <Field label="Promo start / end" required><div className="flex gap-1"><input type="date" className={inp} value={f.promoStart ?? ""} onChange={e => setF({ ...f, promoStart: e.target.value })} /><input type="date" className={inp} value={f.promoEnd ?? ""} onChange={e => setF({ ...f, promoEnd: e.target.value })} /></div></Field>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Live date" required><input type="date" className={inp} value={f.live_date ?? ""} onChange={e => setF({ ...f, live_date: e.target.value })} /></Field>
        <Field label="In-market until"><input type="date" className={inp} value={f.inMarketUntil ?? ""} onChange={e => setF({ ...f, inMarketUntil: e.target.value })} /></Field>
      </div>
      <Field label="Retailer spec sheet"><input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
      <AckBox label="I have read the Artwork and Image rules." checked={ack} onChange={setAck} />
      <button id="submit-artwork" disabled={busy || !f.brand || !f.artworkRequestType || !f.whereAppears || f.hasPrice === undefined || !f.live_date} onClick={go} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-4 py-2 mt-2">{busy ? "Submitting…" : "Submit request"}</button>
    </div>
  );
}

function SwatchForm({ brands, f, setF, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Swatch · ${f.brand ?? "brand TBC"} · ${f.range ?? ""}`, brand: f.brand,
      end_use: f.purpose || "Not specified", needed_by: f.needed_by,
      brief: { range: f.range, colourways: f.colourways, quantity: f.quantity, purpose: f.purpose, shipName: f.shipName, shipPhone: f.shipPhone, shipAddress: f.shipAddress },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>Swatches are stock dependent and not guaranteed. If you need full product, use the Product Request form instead — this one is for swatches and fabric samples only.</RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Brand" required><select className={inp} value={f.brand ?? ""} onChange={e => setF({ ...f, brand: e.target.value })}><option value="">Select…</option>{brands.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></Field>
        <Field label="Range" required><input className={inp} value={f.range ?? ""} onChange={e => setF({ ...f, range: e.target.value })} /></Field>
      </div>
      <Field label="Colourways required" required><input className={inp} placeholder="Comma separated" value={f.colourways ?? ""} onChange={e => setF({ ...f, colourways: e.target.value })} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quantity" required><input className={inp} value={f.quantity ?? ""} onChange={e => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Purpose" required><select className={inp} value={f.purpose ?? ""} onChange={e => setF({ ...f, purpose: e.target.value })}><option value="">Select…</option>{["Store display", "Retailer sample", "Photography", "Other"].map(o => <option key={o}>{o}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Ship to — contact" required><input className={inp} value={f.shipName ?? ""} onChange={e => setF({ ...f, shipName: e.target.value })} /></Field>
        <Field label="Phone" required><input className={inp} value={f.shipPhone ?? ""} onChange={e => setF({ ...f, shipPhone: e.target.value })} /></Field>
        <Field label="Needed by" required><input type="date" className={inp} value={f.needed_by ?? ""} onChange={e => setF({ ...f, needed_by: e.target.value })} /></Field>
      </div>
      <Field label="Address" required><input className={inp} value={f.shipAddress ?? ""} onChange={e => setF({ ...f, shipAddress: e.target.value })} /></Field>
      <AckBox label="I have read the Artwork and Image rules." checked={ack} onChange={setAck} />
      <button id="submit-swatch" disabled={busy || !f.brand || !f.range || !f.colourways || !f.quantity || !f.purpose || !f.shipName || !f.shipPhone || !f.shipAddress || !f.needed_by} onClick={go} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-4 py-2 mt-2">{busy ? "Submitting…" : "Submit request"}</button>
    </div>
  );
}

function TuneUpForm({ f, setF, file, setFile, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i + 1); return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" }); }), []);
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Tune-Up nomination · ${f.retailer ?? ""} ${f.store ?? ""}`, retailer: f.retailer, store: f.store, state: f.state,
      end_use: "Tune-Up Day at store", needed_by: undefined,
      brief: { storeContact: f.storeContact, storeMobile: f.storeMobile, whyStore: f.whyStore, spaceAvailable: f.spaceAvailable, preferredMonth: f.preferredMonth, storeConfirmed: f.storeConfirmed },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>
        Non-negotiables: once an event is published on Eventbrite and promoted, times cannot be changed — stores must confirm timing before go-live. The $20 refundable booking fee stays. Stores must be approved by Baby Bunting or the independent retailer before publishing.
        Nominations are reviewed in a batch when the next six-month schedule is built.
      </RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="State" required><select className={inp} value={f.state ?? ""} onChange={e => setF({ ...f, state: e.target.value })}><option value="">Select…</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Retailer" required><input className={inp} value={f.retailer ?? ""} onChange={e => setF({ ...f, retailer: e.target.value })} /></Field>
        <Field label="Store" required><input className={inp} value={f.store ?? ""} onChange={e => setF({ ...f, store: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Store contact name" required><input className={inp} value={f.storeContact ?? ""} onChange={e => setF({ ...f, storeContact: e.target.value })} /></Field>
        <Field label="Store contact mobile" required><input className={inp} value={f.storeMobile ?? ""} onChange={e => setF({ ...f, storeMobile: e.target.value })} /></Field>
      </div>
      <Field label="Why this store" required><textarea className={inp} rows={2} placeholder="Customer requests received, pram sales last 12 months, prior Tune-Up attendance if any" value={f.whyStore ?? ""} onChange={e => setF({ ...f, whyStore: e.target.value })} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Space for a 2.4m folding table + service area?" required>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" name="spaceAvailable" checked={f.spaceAvailable === true} onChange={() => setF({ ...f, spaceAvailable: true })} />Yes</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="spaceAvailable" checked={f.spaceAvailable === false} onChange={() => setF({ ...f, spaceAvailable: false })} />No</label>
          </div>
        </Field>
        <Field label="Photo of the space"><input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Preferred month" required><select className={inp} value={f.preferredMonth ?? ""} onChange={e => setF({ ...f, preferredMonth: e.target.value })}><option value="">Select…</option>{months.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Store has confirmed date and time availability" required>
          <div className="flex gap-3 text-sm pt-2">
            <label className="flex items-center gap-1.5"><input type="radio" name="storeConfirmed" checked={f.storeConfirmed === true} onChange={() => setF({ ...f, storeConfirmed: true })} />Yes</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="storeConfirmed" checked={f.storeConfirmed === false} onChange={() => setF({ ...f, storeConfirmed: false })} />No</label>
          </div>
        </Field>
      </div>
      <p className="text-xs text-gray-400">Nominations are reviewed when the next six-month schedule is built (per the manual, the second-half schedule is built toward the end of May) — you won't hear back immediately.</p>
      <AckBox label="I have read the Tune-Up Day non-negotiables." checked={ack} onChange={setAck} />
      <button id="submit-tune_up" disabled={busy || !f.state || !f.retailer || !f.store || !f.storeContact || !f.storeMobile || !f.whyStore || f.spaceAvailable === undefined || !f.preferredMonth || f.storeConfirmed === undefined} onClick={go} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-4 py-2 mt-2">{busy ? "Submitting…" : "Submit nomination"}</button>
    </div>
  );
}

function ProductForm({ brands, f, setF, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Product/gifting · ${f.brand ?? ""} · ${f.sku ?? ""}`, brand: f.brand,
      end_use: f.purpose || "Not specified", needed_by: f.needed_by,
      brief: { sku: f.sku, quantity: f.quantity, approxRrpValue: f.approxRrpValue, purpose: f.purpose, fundedBy: f.fundedBy, whatWeGet: f.whatWeGet },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>
        Free product for giveaways, competitions, retailer incentives and staff seeding is a <strong>sales and trade spend decision, not a marketing budget line</strong>. This request goes to your Sales Manager. Marketing is notified for awareness only.
      </RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Brand" required><select className={inp} value={f.brand ?? ""} onChange={e => setF({ ...f, brand: e.target.value })}><option value="">Select…</option>{brands.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></Field>
        <Field label="SKU or product" required><input className={inp} value={f.sku ?? ""} onChange={e => setF({ ...f, sku: e.target.value })} /></Field>
        <Field label="Quantity" required><input className={inp} value={f.quantity ?? ""} onChange={e => setF({ ...f, quantity: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Approx. RRP value" required><input className={inp} value={f.approxRrpValue ?? ""} onChange={e => setF({ ...f, approxRrpValue: e.target.value })} /></Field>
        <Field label="Purpose" required><select className={inp} value={f.purpose ?? ""} onChange={e => setF({ ...f, purpose: e.target.value })}><option value="">Select…</option>{["Retailer competition", "Store staff incentive", "Customer giveaway", "Display", "Other"].map(o => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Who is funding it" required><select className={inp} value={f.fundedBy ?? ""} onChange={e => setF({ ...f, fundedBy: e.target.value })}><option value="">Select…</option>{["Retailer", "Coolkidz trade spend", "To be discussed"].map(o => <option key={o}>{o}</option>)}</select></Field>
      </div>
      <Field label="What Coolkidz gets in return" required><textarea className={inp} rows={2} placeholder="Placement, posts, staff training, sell-through commitment…" value={f.whatWeGet ?? ""} onChange={e => setF({ ...f, whatWeGet: e.target.value })} /></Field>
      <Field label="Needed by" required><input type="date" className={inp} value={f.needed_by ?? ""} onChange={e => setF({ ...f, needed_by: e.target.value })} /></Field>
      <AckBox label="I have read the Free Product, Samples & Gifting rules." checked={ack} onChange={setAck} />
      <button id="submit-product" disabled={busy || !f.brand || !f.sku || !f.quantity || !f.approxRrpValue || !f.purpose || !f.fundedBy || !f.whatWeGet || !f.needed_by} onClick={go} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-4 py-2 mt-2">{busy ? "Submitting…" : "Submit request"}</button>
    </div>
  );
}

function RequestDetail({ item, admin, onBack, onChanged }: { item: Req; admin: boolean; onBack: () => void; onChanged: () => void }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [assignee, setAssignee] = useState(item.assignee_email ?? "");

  useEffect(() => {
    fetch(`/api/sales-requests?id=${item.id}`).then(r => r.json()).then(d => { if (d.ok) { setFiles(d.files ?? []); setEvents(d.events ?? []); } });
  }, [item.id]);

  async function patch(body: any) {
    setBusy(true);
    await fetch("/api/sales-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, ...body }) }).catch(() => {});
    setBusy(false); onChanged();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 max-w-3xl">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 mb-3">← Back</button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-gray-400">{TYPE_META[item.request_type].emoji} {TYPE_META[item.request_type].label}</div>
          <h3 className="text-lg font-bold text-slate-800">{item.title}</h3>
          <div className="text-xs text-gray-400 mt-0.5">Requested by {item.requester_email} · {new Date(item.created_at).toLocaleDateString("en-AU")}</div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
        {item.brand && <div><div className={lbl}>Brand</div>{item.brand}</div>}
        {item.retailer && <div><div className={lbl}>Retailer</div>{item.retailer}</div>}
        {item.store && <div><div className={lbl}>Store</div>{item.store}</div>}
        {item.state && <div><div className={lbl}>State</div>{item.state}</div>}
        {item.needed_by && <div><div className={lbl}>Needed by</div>{dShort(item.needed_by)}</div>}
        {item.sla_due_at && <div><div className={lbl}>SLA due</div>{dShort(item.sla_due_at.slice(0, 10))}</div>}
      </div>
      <div className="mt-3 text-sm"><div className={lbl}>Where it's used</div>{item.end_use}</div>
      {item.brief && Object.keys(item.brief).length > 0 && (
        <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-slate-600 space-y-1">
          {Object.entries(item.brief).map(([k, v]) => v != null && v !== "" ? <div key={k}><strong className="text-slate-500">{k}:</strong> {String(v)}</div> : null)}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-3">
          <div className={lbl}>Files</div>
          <div className="flex flex-wrap gap-2">{files.map(f => <a key={f.id} href={f.storage_path} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 border border-indigo-100 rounded-lg px-2.5 py-1 hover:bg-indigo-50">{f.file_name ?? "file"}</a>)}</div>
        </div>
      )}
      {item.decline_reason && <div className="mt-3 bg-rose-50 border border-rose-100 rounded-lg p-3 text-sm text-rose-700"><strong>Declined:</strong> {item.decline_reason}</div>}

      {events.length > 0 && (
        <div className="mt-4">
          <div className={lbl}>History</div>
          <div className="space-y-1.5">
            {events.map(e => <div key={e.id} className="text-xs text-gray-500">{new Date(e.created_at).toLocaleDateString("en-AU")} · {e.actor} → {e.to_status ? STATUS_META[e.to_status as Status]?.label ?? e.to_status : ""}{e.note ? ` — ${e.note}` : ""}</div>)}
          </div>
        </div>
      )}

      {admin && (
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Move to:</span>
            {(["triaged", "in_progress", "review", "delivered", "on_hold"] as Status[]).map(s => (
              <button key={s} disabled={busy} onClick={() => patch({ status: s })} className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${item.status === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>{STATUS_META[s].label}</button>
            ))}
            <button disabled={busy} onClick={() => setShowDecline(v => !v)} className="text-xs font-semibold rounded-full px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50">Decline</button>
          </div>
          {showDecline && (
            <div className="flex gap-2">
              <input value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Reason (required)" className={inp} />
              <button disabled={busy || !declineReason.trim()} onClick={() => patch({ status: "declined", decline_reason: declineReason })} className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg px-3 py-2 whitespace-nowrap">Confirm decline</button>
            </div>
          )}
          <div className="flex gap-2 items-center">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Assignee:</span>
            <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="email" className={`${inp} max-w-xs`} />
            <button disabled={busy} onClick={() => patch({ assignee_email: assignee })} className="text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
