"use client";

import { useEffect, useMemo, useState } from "react";
import { GUIDELINE_SECTIONS, FilecampCard, Icon } from "./salesHubGuidelines";
import { TYPE_META, STATES, inp, lbl, type ReqType, RequestFormPicker } from "./salesRequestForms";

type Status = "new" | "triaged" | "in_progress" | "review" | "delivered" | "on_hold" | "declined";
type Req = {
  id: string; request_type: ReqType; status: Status; requester_email: string; requester_name: string | null;
  assignee_email: string | null; brand: string | null; retailer: string | null; store: string | null; state: string | null;
  title: string; end_use: string; needed_by: string | null; brief: any; sla_due_at: string | null;
  decline_reason: string | null; created_at: string; updated_at: string;
};
type FileRow = { id: number; storage_path: string; file_name: string | null; kind: string | null; uploaded_by: string | null; created_at: string };
type EventRow = { id: number; actor: string | null; from_status: string | null; to_status: string | null; note: string | null; created_at: string };

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-slate-100 text-slate-600" },
  triaged: { label: "Triaged", cls: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  review: { label: "Review", cls: "bg-violet-100 text-violet-700" },
  delivered: { label: "Delivered", cls: "bg-emerald-100 text-emerald-700" },
  on_hold: { label: "On hold", cls: "bg-gray-100 text-gray-500" },
  declined: { label: "Declined", cls: "bg-rose-100 text-rose-700" },
};
const dShort = (s?: string | null) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";

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
          <p className="text-sm text-gray-400 mt-0.5">Request artwork, swatches, Tune-Up Days and product, plus the rules to check before you ask.</p>
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
        <RequestFormPicker type={newType} setType={setNewType} brands={brands} onCreated={id => { load(); setDetailId(id); setView("queue"); }} onCancel={() => setView("landing")} />
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

      <FilecampCard />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Rules, read before you ask</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {GUIDELINE_SECTIONS.map(g => (
            <button key={g.id} onClick={() => onGuide(g.id)} className="flex items-center gap-2.5 text-left text-sm text-slate-600 border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:border-indigo-200 transition">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Icon path={g.icon} className="w-4 h-4" /></span>
              {g.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Guidelines({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const g = GUIDELINE_SECTIONS.find(x => x.id === active) ?? GUIDELINE_SECTIONS[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 h-fit lg:sticky lg:top-4">
        {GUIDELINE_SECTIONS.map(s => (
          <button key={s.id} onClick={() => onSelect(s.id)} className={`w-full flex items-center gap-2.5 text-left text-sm rounded-lg px-3 py-2.5 transition ${s.id === g.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-gray-50"}`}>
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.id === g.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}><Icon path={s.icon} className="w-4 h-4" /></span>
            {s.title}
          </button>
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
            {events.map(e => <div key={e.id} className="text-xs text-gray-500">{new Date(e.created_at).toLocaleDateString("en-AU")} · {e.actor} → {e.to_status ? STATUS_META[e.to_status as Status]?.label ?? e.to_status : ""}{e.note ? `, ${e.note}` : ""}</div>)}
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
