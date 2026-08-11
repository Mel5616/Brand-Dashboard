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
// Ordered steps for the visual stepper (declined/on_hold branch off, shown as a note instead).
const STEPS: { key: Status; label: string }[] = [
  { key: "new", label: "Submitted" },
  { key: "triaged", label: "Triaged" },
  { key: "in_progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "delivered", label: "Delivered" },
];
const dShort = (s?: string | null) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
const baloo = "font-[family-name:var(--font-baloo)]";
const body = "font-[family-name:var(--font-manrope)]";
// filecamp/comms have no dedicated photography yet — omitting `photo` falls
// back to a big centred emoji on the gradient instead of a broken image.
const TILE_ART: Record<ReqType, { grad: string; photo?: string }> = {
  artwork: { grad: "from-[#FFD9CC] to-[#FF9B7A]", photo: "/sales-hub/artwork.jpg" },
  swatch: { grad: "from-[#CDEFF7] to-[#7FD4EA]", photo: "/sales-hub/swatch.jpg" },
  tune_up: { grad: "from-[#DCEBD1] to-[#9FCB84]", photo: "/sales-hub/tune_up.jpg" },
  product: { grad: "from-[#F6DDF2] to-[#E1A6D8]", photo: "/sales-hub/product.jpg" },
  filecamp: { grad: "from-[#D9E4F5] to-[#9EB6E0]" },
  comms: { grad: "from-[#FDE8D2] to-[#F0B26B]" },
};

export function SalesHub({ admin, brands, tradeshows = [], calendarEvents = [] }: { admin: boolean; brands: { name: string; color?: string }[]; tradeshows?: { id: string; name: string; date_start: string }[]; calendarEvents?: { title: string; start_date: string }[] }) {
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
    <div className={`space-y-4 ${body}`}>
      {view !== "landing" && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className={`text-xl font-bold text-slate-800 ${baloo}`}>Sales Hub</h2>
            <p className="text-sm text-gray-400 mt-0.5">Request artwork, swatches, Tune-Up Days and product, plus the rules to check before you ask.</p>
          </div>
        </div>
      )}
      {!detail && (
        <div className="flex gap-2">
          <button onClick={() => { setView("landing"); setDetailId(null); }} className={`text-sm font-semibold rounded-full px-4 py-2 border transition ${view === "landing" ? "bg-[#1E9DC2] text-white border-[#1E9DC2]" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>🏠 Home</button>
          <button onClick={() => { setView("queue"); setDetailId(null); }} className={`text-sm font-semibold rounded-full px-4 py-2 border transition ${view === "queue" ? "bg-[#1E9DC2] text-white border-[#1E9DC2]" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>{admin ? "All requests" : "My requests"} ({items.length})</button>
          <button onClick={() => { setView("guidelines"); setDetailId(null); }} className={`text-sm font-semibold rounded-full px-4 py-2 border transition ${view === "guidelines" ? "bg-[#1E9DC2] text-white border-[#1E9DC2]" : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}>📖 Guidelines</button>
        </div>
      )}

      {detail ? (
        <RequestDetail item={detail} admin={admin} onBack={() => setDetailId(null)} onChanged={load} />
      ) : view === "landing" ? (
        <Landing brands={brands} items={items} mine={mine} tradeshows={tradeshows} calendarEvents={calendarEvents}
          onPick={t => { setNewType(t); setView("new"); }} onOpenRequest={id => setDetailId(id)} onGuide={id => { setGuideId(id); setView("guidelines"); }} />
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

function Landing({ brands, items, mine, tradeshows, calendarEvents, onPick, onOpenRequest, onGuide }: {
  brands: { name: string }[]; items: Req[]; mine: Req[];
  tradeshows: { id: string; name: string; date_start: string }[]; calendarEvents: { title: string; start_date: string }[];
  onPick: (t: ReqType) => void; onOpenRequest: (id: string) => void; onGuide: (id: string) => void;
}) {
  const now = Date.now();
  const lights = useMemo(() => {
    let onTrack = 0, inProgress = 0, overdue = 0;
    for (const r of mine) {
      const isOverdue = r.sla_due_at && new Date(r.sla_due_at).getTime() < now;
      if (isOverdue) overdue++;
      else if (r.status === "in_progress" || r.status === "review") inProgress++;
      else onTrack++;
    }
    return { onTrack, inProgress, overdue };
  }, [mine, now]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const a = tradeshows.filter(t => t.date_start >= today).map(t => ({ date: t.date_start, label: t.name }));
    const b = items
      .filter(i => i.request_type === "tune_up" && i.needed_by && i.needed_by.slice(0, 10) >= today && !["delivered", "declined"].includes(i.status))
      .map(i => ({ date: i.needed_by!.slice(0, 10), label: i.title }));
    return [...a, ...b].sort((x, y) => x.date.localeCompare(y.date)).slice(0, 5);
  }, [tradeshows, items]);

  return (
    <div className="space-y-5">
      {/* Branded hero */}
      <div className="rounded-3xl bg-gradient-to-br from-[#3EC0E4] to-[#1E9DC2] px-6 py-7 sm:px-8 sm:py-9 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/coolkidz-logo.png" alt="Coolkidz" className="h-6 mb-4 brightness-0 invert" />
        <h2 className={`text-2xl sm:text-3xl font-extrabold text-white ${baloo}`}>Marketing Guidelines and Requests</h2>
        <p className="text-white/85 text-sm mt-1 max-w-md">Artwork, swatches, Tune-Up Days &amp; product, in a minute, from your phone.</p>
      </div>

      {/* Traffic light status strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-emerald-50 py-4 text-center">
          <div className={`text-3xl font-extrabold text-emerald-600 ${baloo}`}>{lights.onTrack}</div>
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-emerald-600 mt-0.5">On track</div>
        </div>
        <div className="rounded-2xl bg-amber-50 py-4 text-center">
          <div className={`text-3xl font-extrabold text-amber-600 ${baloo}`}>{lights.inProgress}</div>
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-amber-600 mt-0.5">In progress</div>
        </div>
        <div className="rounded-2xl bg-rose-50 py-4 text-center">
          <div className={`text-3xl font-extrabold text-rose-600 ${baloo}`}>{lights.overdue}</div>
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-rose-600 mt-0.5">Overdue</div>
        </div>
      </div>

      {/* Request-type tiles — big, tappable, photographic */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(TYPE_META) as ReqType[]).map(t => (
          <button key={t} onClick={() => onPick(t)} className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md active:scale-[0.98] transition">
            <div className={`aspect-square bg-gradient-to-br ${TILE_ART[t].grad} relative overflow-hidden flex items-center justify-center`}>
              {TILE_ART[t].photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={TILE_ART[t].photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                : <span className="text-5xl opacity-80">{TYPE_META[t].emoji}</span>}
            </div>
            <div className="px-3.5 py-3">
              <div className={`font-bold text-slate-800 text-[15px] ${baloo}`}>{TYPE_META[t].label.replace(" Request", "").replace("Swatch / Sample", "Swatches").replace(" Nomination", "").replace(" / Gifting", "")}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{t === "product" ? "Routes to Sales leadership" : "Routes to Marketing"}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Coming up */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 px-1">Coming up</h3>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {upcoming.map((u, i) => {
              const d = new Date(u.date + "T00:00:00");
              return (
                <div key={i} className="shrink-0 w-24 bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2.5 text-center">
                  <div className={`text-xl font-extrabold text-[#E85536] ${baloo}`}>{d.getDate()}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{d.toLocaleDateString("en-AU", { month: "short" })}</div>
                  <div className="text-[10.5px] font-semibold text-slate-600 mt-1 leading-tight line-clamp-2">{u.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My open requests */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className={`text-sm font-bold text-slate-700 mb-1 ${baloo}`}>My open requests</h3>
        {mine.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No open requests.</p> : (
          <div className="divide-y divide-gray-100">
            {mine.slice(0, 8).map(r => {
              const isOverdue = r.sla_due_at && new Date(r.sla_due_at).getTime() < now;
              const dot = isOverdue ? "bg-rose-500" : (r.status === "in_progress" || r.status === "review") ? "bg-amber-500" : "bg-emerald-500";
              return (
                <button key={r.id} onClick={() => onOpenRequest(r.id)} className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-700 truncate">{r.title}</div>
                    <div className="text-[11px] text-gray-400">{r.brand ?? "—"} · needed {dShort(r.needed_by)}</div>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <FilecampCard />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className={`text-sm font-bold text-slate-700 mb-2 ${baloo}`}>Rules, read before you ask</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {GUIDELINE_SECTIONS.map(g => (
            <button key={g.id} onClick={() => onGuide(g.id)} className="flex items-center gap-2.5 text-left text-sm text-slate-600 border border-gray-100 rounded-lg px-3 py-3 hover:bg-gray-50 hover:border-[#3EC0E4] transition">
              <span className="w-8 h-8 rounded-lg bg-sky-50 text-[#1E9DC2] flex items-center justify-center shrink-0"><Icon path={g.icon} className="w-4 h-4" /></span>
              {g.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Copies a guideline section's public /g/[id] link. Robust clipboard write with
// an execCommand fallback, same pattern as NewProducts.tsx's copyLink.
async function copyGuideLink(id: string, setMsg: (m: string) => void) {
  const url = `${window.location.origin}/g/${id}`;
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); setMsg("Link copied."); return; }
  } catch { /* fall through to the textarea fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    const done = document.execCommand("copy");
    document.body.removeChild(ta);
    setMsg(done ? "Link copied." : `Couldn't copy automatically — link: ${url}`);
  } catch {
    setMsg(`Couldn't copy automatically — link: ${url}`);
  }
}

function Guidelines({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const g = GUIDELINE_SECTIONS.find(x => x.id === active) ?? GUIDELINE_SECTIONS[0];
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2200); return () => clearTimeout(t); }, [msg]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 h-fit lg:sticky lg:top-4">
        {GUIDELINE_SECTIONS.map(s => (
          <div key={s.id} className={`group flex items-start rounded-lg transition ${s.id === g.id ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
            <button onClick={() => onSelect(s.id)} className={`flex-1 min-w-0 flex items-start gap-2.5 text-left text-sm px-3 py-2.5 ${s.id === g.id ? "text-indigo-700 font-semibold" : "text-slate-600"}`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.id === g.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}><Icon path={s.icon} className="w-4 h-4" /></span>
              <span className="leading-snug pt-1">{s.title}</span>
            </button>
            <button onClick={() => copyGuideLink(s.id, setMsg)} title="Copy a link to this page" className="shrink-0 mr-2 mt-2.5 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-indigo-600 hover:bg-indigo-100 opacity-0 group-hover:opacity-100 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {msg && <div className="mb-4 text-[13px] font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{msg}</div>}
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

function Stepper({ status }: { status: Status }) {
  const curIdx = STEPS.findIndex(s => s.key === status);
  return (
    <div className="mt-5 mb-1 pl-1">
      {STEPS.map((s, i) => {
        const state = i < curIdx ? "done" : i === curIdx ? "active" : "todo";
        return (
          <div key={s.key} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                state === "done" ? "bg-emerald-500 text-white" : state === "active" ? "bg-[#3EC0E4] text-white ring-4 ring-sky-50" : "bg-gray-100 text-gray-400 border-2 border-gray-200"
              }`}>{state === "done" ? "✓" : i + 1}</div>
              {i < STEPS.length - 1 && <div className={`w-[3px] flex-1 min-h-[26px] ${state === "done" ? "bg-emerald-500" : "bg-gray-200"}`} />}
            </div>
            <div className={`pb-6 ${baloo}`}>
              <div className={`text-[14.5px] font-bold ${state === "active" ? "text-[#1E9DC2]" : state === "todo" ? "text-gray-400" : "text-slate-700"}`}>{s.label}</div>
            </div>
          </div>
        );
      })}
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

  const branchedOff = item.status === "declined" || item.status === "on_hold";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 max-w-3xl">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 mb-3">← Back</button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-gray-400">{TYPE_META[item.request_type].emoji} {TYPE_META[item.request_type].label}</div>
          <h3 className={`text-lg font-bold text-slate-800 ${baloo}`}>{item.title}</h3>
          <div className="text-xs text-gray-400 mt-0.5">Requested by {item.requester_email} · {new Date(item.created_at).toLocaleDateString("en-AU")}</div>
        </div>
        {branchedOff && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span>}
      </div>

      {!branchedOff && <Stepper status={item.status} />}

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
