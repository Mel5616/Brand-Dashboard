"use client";

import { useEffect, useMemo, useState } from "react";

// Portfolio-wide, highly visual timeline of what's physically landing:
// stock arrivals, product launches, coming-soon teasers, plus events, trade
// moments and campaign windows. Two views — a Gantt-style swimlane per
// brand, and a flat month-grouped list — with locked-vs-working date
// status, and a tray for real work that has no date yet. Tradeshow dates,
// confirmed campaigns and new-product launches are pulled in automatically
// (read-only, edited from their own tabs); anything typed here directly is
// a native timeline entry that admins can edit or remove.

type Brand = { id: number; name: string; live?: boolean; color?: string };
type EventType = "stock" | "launch" | "coming" | "retail" | "event" | "trade" | "campaign";
type Status = "locked" | "working";
type Source = "tradeshows" | "campaigns" | "new_products";
type TimelineEvent = {
  id: number | string; brand_id: number; event_type: EventType; title: string; date: string | null; end_date: string | null;
  product_name: string | null; quantity: number | null; status: string | null; note: string | null; image_url: string | null;
  source?: Source;
};

const TYPE_META: Record<EventType, { label: string; short: string; color: string; bg: string; key: boolean }> = {
  stock:    { label: "Stock & freight",     short: "Stock",       color: "#0f766e", bg: "#ecfdf5", key: true },
  launch:   { label: "Launch & on sale",    short: "Launch",      color: "#b8342a", bg: "#fef2f0", key: true },
  coming:   { label: "Coming soon",         short: "Coming soon", color: "#a9680a", bg: "#fff8ec", key: true },
  retail:   { label: "Key shopping period", short: "Retail",      color: "#a21caf", bg: "#fdf2fb", key: true },
  event:    { label: "Events",              short: "Event",       color: "#6d28d9", bg: "#f5f0ff", key: false },
  trade:    { label: "Trade shows",         short: "Trade",       color: "#1a5893", bg: "#eff6fc", key: false },
  campaign: { label: "Campaign & content",  short: "Campaign",    color: "#9e2f72", bg: "#fdf1f8", key: false },
};
const TYPES = Object.keys(TYPE_META) as EventType[];
const KEY_TYPES = TYPES.filter(t => TYPE_META[t].key);
const OTHER_TYPES = TYPES.filter(t => !TYPE_META[t].key);
const SOURCE_META: Record<Source, string> = { tradeshows: "Synced from Tradeshows", campaigns: "Synced from Campaign Calendar", new_products: "Synced from New Products" };

// Tradeshows and the Australian retail calendar are portfolio-wide, not
// brand-specific — pulled/added once under this pseudo "brand" row instead
// of duplicating across every brand. Matches COOLKIDZ_TIMELINE_BRAND in
// src/app/api/timeline-events/route.ts.
const COOLKIDZ_BRAND: Brand = { id: -1, name: "Coolkidz calendar", color: "#0f172a" };

const DAY = 86400000;
const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const toMs = (s: string) => new Date(s + "T00:00:00Z").getTime();
const fmtD = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const fmtLong = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const monthOf = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
function dueLabel(ms: number, today: number) {
  const d = Math.round((ms - today) / DAY);
  if (d < 0) return "Past";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 7) return `In ${d} days`;
  if (d <= 30) return `In ${Math.round(d / 7)} weeks`;
  return `In ${Math.round(d / 30)} months`;
}

// soft pill: pastel fill + coloured text when active, quiet outline when not
function Pill({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="text-xs font-semibold rounded-full px-3 py-1.5 border transition flex items-center gap-1.5 whitespace-nowrap"
      style={active
        ? { background: `color-mix(in srgb, ${color} 14%, #fff)`, borderColor: `color-mix(in srgb, ${color} 35%, #fff)`, color }
        : { background: "#fff", borderColor: "#e8eaed", color: "#9aa1ab" }}>
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: active ? color : "#d1d5db" }} />
      {children}
    </button>
  );
}

export function Timeline({ brands, admin = false }: { brands: Brand[]; admin?: boolean }) {
  const live = [...brands.filter(b => b.live !== false), COOLKIDZ_BRAND];
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetupBase, setNeedsSetupBase] = useState(false);
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<"gantt" | "list">("gantt");
  const [brandFilter, setBrandFilter] = useState<Set<number>>(new Set(live.map(b => b.id)));
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set(TYPES));
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [q, setQ] = useState("");
  const [showPast, setShowPast] = useState(false);

  function reload() {
    setLoading(true);
    fetch("/api/timeline-events").then(r => r.json()).then(d => {
      if (d.needsSetup) { setNeedsSetupBase(true); return; }
      setEvents(d.events ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const today = useMemo(() => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }, []);
  const brandOf = (id: number) => id === COOLKIDZ_BRAND.id ? COOLKIDZ_BRAND : brands.find(b => b.id === id);
  const statusOf = (e: TimelineEvent): Status => (e.status === "working" ? "working" : "locked");

  const matches = (e: TimelineEvent) =>
    brandFilter.has(e.brand_id) &&
    typeFilter.has(e.event_type) &&
    (statusFilter === "all" || statusFilter === statusOf(e)) &&
    (!q || (e.title + " " + (e.note || "") + " " + (brandOf(e.brand_id)?.name || "")).toLowerCase().includes(q));

  const dated = useMemo(() => events.filter(e => !!e.date), [events]);
  const tray = useMemo(() => events.filter(e => !e.date && matches(e)), [events, brandFilter, typeFilter, statusFilter, q]);
  const filtered = useMemo(() => dated.filter(matches)
    .filter(e => showPast || toMs(e.end_date || e.date!) >= today)
    .sort((a, b) => toMs(a.date!) - toMs(b.date!)), [dated, brandFilter, typeFilter, statusFilter, q, showPast, today]);

  const counts = useMemo(() => {
    const visible = dated.filter(matches);
    return {
      all: visible.length,
      locked: visible.filter(e => statusOf(e) === "locked").length,
      working: visible.filter(e => statusOf(e) === "working").length,
      next30: visible.filter(e => toMs(e.date!) >= today && toMs(e.date!) <= today + 30 * DAY).length,
    };
  }, [dated, brandFilter, typeFilter, statusFilter, q, today]);

  function toggleSet<T>(set: Set<T>, key: T, universe: T[]) {
    const next = new Set(set);
    if (next.size === universe.length) { next.clear(); next.add(key); }
    else if (next.has(key)) { next.delete(key); if (!next.size) universe.forEach(k => next.add(k)); }
    else next.add(key);
    return next;
  }

  // ---------- gantt layout ----------
  const gantt = useMemo(() => {
    if (!filtered.length) return null;
    const px = 6;
    const nameW = 190;
    const minMs = Math.min(today, ...filtered.map(e => toMs(e.date!)));
    const maxMs = Math.max(today, ...filtered.map(e => toMs(e.end_date || e.date!)));
    const a = new Date(minMs), b = new Date(maxMs);
    const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1);
    const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 2, 0);
    const x = (ms: number) => Math.round(((ms - start) / DAY) * px);
    const total = x(end) + px;

    const months: { left: number; w: number; label: string; yr: string }[] = [];
    let c = new Date(start);
    while (Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1) <= end) {
      const ms = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1);
      const me = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0);
      months.push({ left: x(ms), w: x(me) - x(ms) + px, label: c.toLocaleDateString("en-AU", { month: "short" }), yr: String(c.getUTCFullYear()).slice(2) });
      c = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1));
    }

    const rows = live.filter(br => brandFilter.has(br.id)).map(br => {
      const items = filtered.filter(e => e.brand_id === br.id);
      const lanes: number[] = [];
      const placed = items.map(e => {
        const isBar = (e.end_date && e.end_date !== e.date);
        const barW = isBar ? Math.max(24, x(toMs(e.end_date!)) - x(toMs(e.date!)) + px) : 0;
        const lblW = e.title.length * (TYPE_META[e.event_type].key ? 7.1 : 6) + 28;
        const w = isBar ? Math.max(barW, lblW) : lblW;
        const left = Math.max(0, x(toMs(e.date!)) - (isBar ? 0 : 5));
        let lane = 0;
        while (lanes[lane] !== undefined && lanes[lane] > left - 6) lane++;
        lanes[lane] = left + w;
        return { e, left, w, bar: !!isBar, lane };
      });
      const laneCount = Math.max(1, lanes.length);
      return { brand: br, items: placed, h: laneCount * 27 + 13 };
    });

    const todayX = (today >= start && today <= end) ? x(today) : null;
    return { px, nameW, total, months, rows, todayX };
  }, [filtered, live, brandFilter, today]);

  // ---------- add / edit (native rows only) ----------
  const emptyForm = { brand_id: "", event_type: "stock" as EventType, title: "", date: "", end_date: "", product_name: "", quantity: "", status: "locked" as Status, note: "" };
  const [form, setForm] = useState(emptyForm);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerId, setDrawerId] = useState<number | string | null>(null);

  function startEdit(e: TimelineEvent) {
    if (typeof e.id !== "number") return;
    setEditingId(e.id);
    setForm({
      brand_id: String(e.brand_id), event_type: e.event_type, title: e.title, date: e.date || "", end_date: e.end_date || "",
      product_name: e.product_name || "", quantity: e.quantity != null ? String(e.quantity) : "", status: statusOf(e), note: e.note || "",
    });
    setShowAdd(true);
    setDrawerId(null);
  }

  async function submit() {
    if (!form.brand_id || !form.title) return;
    const body = { ...form, brand_id: Number(form.brand_id), quantity: form.quantity ? Number(form.quantity) : null, date: form.date || null, end_date: form.end_date || null };
    if (editingId) {
      const d = await fetch("/api/timeline-events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...body }) }).then(r => r.json());
      if (d.ok) { setEvents(prev => prev.map(e => e.id === editingId ? { ...e, ...body } as TimelineEvent : e)); resetForm(); }
      else setMsg(d.error || "Couldn't save.");
    } else {
      const d = await fetch("/api/timeline-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
      if (d.ok) { setEvents(prev => [...prev, d.event]); resetForm(); }
      else setMsg(d.error || "Couldn't add.");
    }
  }
  function resetForm() { setForm(emptyForm); setEditingId(null); setShowAdd(false); }
  async function removeEvent(id: number | string) {
    if (typeof id !== "number") return;
    if (!confirm("Remove this event?")) return;
    const d = await fetch(`/api/timeline-events?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) { setEvents(prev => prev.filter(e => e.id !== id)); setDrawerId(null); }
  }
  const [uploadingId, setUploadingId] = useState<number | string | null>(null);
  async function uploadImage(id: number | string, file: File) {
    if (typeof id !== "number") return;
    setUploadingId(id);
    const fd = new FormData(); fd.append("file", file); fd.append("id", String(id));
    const d = await fetch("/api/timeline-events/image", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setUploadingId(null);
    if (d?.ok) setEvents(prev => prev.map(e => e.id === id ? { ...e, image_url: d.url } : e));
    else setMsg(d?.error || "Couldn't upload the photo.");
  }

  const grouped = useMemo(() => {
    const g: { month: string; items: TimelineEvent[] }[] = [];
    for (const e of filtered) {
      const m = monthOf(toMs(e.date!));
      let bucket = g.find(x => x.month === m);
      if (!bucket) { bucket = { month: m, items: [] }; g.push(bucket); }
      bucket.items.push(e);
    }
    return g;
  }, [filtered]);

  const drawerEv = drawerId != null ? events.find(e => e.id === drawerId) : null;

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (needsSetupBase) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_timeline_events.sql</code> to enable the Timeline.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* counts + view toggle */}
        <div className="flex flex-wrap items-center gap-6 px-6 py-4">
          {[["On calendar", counts.all], ["Locked", counts.locked], ["Working", counts.working], ["Next 30 days", counts.next30]].map(([label, n]) => (
            <div key={label as string}>
              <p className="text-2xl font-extrabold text-slate-800 leading-none tabular-nums">{n}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">{label}</p>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1 bg-gray-50 rounded-full p-1">
            {(["gantt", "list"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`text-xs font-semibold rounded-full px-3.5 py-1.5 transition ${view === v ? "bg-slate-800 text-white" : "text-gray-500 hover:text-slate-700"}`}>
                {v === "gantt" ? "Timeline" : "List"}
              </button>
            ))}
          </div>
        </div>

        {/* filters */}
        <div className="border-t border-gray-50 px-6 py-4 space-y-3 bg-gray-50/40">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1.5 shrink-0">Key dates</span>
            {KEY_TYPES.map(t => (
              <button key={t} onClick={() => setTypeFilter(s => toggleSet(s, t, TYPES))}
                className="text-[13px] font-bold rounded-full pl-2.5 pr-3.5 py-2 border-2 transition flex items-center gap-2 whitespace-nowrap"
                style={typeFilter.has(t) ? { background: TYPE_META[t].color, borderColor: TYPE_META[t].color, color: "#fff" } : { background: "#fff", borderColor: "#e2e5ea", color: "#9aa1ab" }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: typeFilter.has(t) ? "#fff" : TYPE_META[t].color }} />
                {TYPE_META[t].short}
              </button>
            ))}
            <span className="ml-2 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full p-0.5">
              {(["all", "locked", "working"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`text-[11px] font-semibold rounded-full px-2.5 py-1 transition ${statusFilter === s ? "bg-slate-800 text-white" : "text-gray-400 hover:text-slate-600"}`}>
                  {s === "all" ? "All dates" : s === "locked" ? "Locked" : "Working"}
                </button>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1.5 shrink-0">Other activity</span>
            {OTHER_TYPES.map(t => (
              <Pill key={t} active={typeFilter.has(t)} color={TYPE_META[t].color} onClick={() => setTypeFilter(s => toggleSet(s, t, TYPES))}>{TYPE_META[t].short}</Pill>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1.5 shrink-0">Brand</span>
            {live.map(b => (
              <Pill key={b.id} active={brandFilter.has(b.id)} color={b.color || "#334155"} onClick={() => setBrandFilter(s => toggleSet(s, b.id, live.map(x => x.id)))}>{b.name}</Pill>
            ))}
            <button onClick={() => { setBrandFilter(new Set(live.map(b => b.id))); setTypeFilter(new Set(TYPES)); setStatusFilter("all"); setQ(""); }} className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-600 ml-1">Reset</button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
            <input value={q} onChange={e => setQ(e.target.value.toLowerCase())} placeholder="Search titles and notes…" className={inp + " min-w-[220px] bg-white"} />
            <label className="text-xs text-gray-400 flex items-center gap-1.5"><input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />Show past</label>
            {admin && <button onClick={() => { resetForm(); setShowAdd(v => !v); }} className="ml-auto text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">{showAdd ? "Close" : "+ Add event"}</button>}
          </div>
        </div>
      </div>
      {msg && <p className="text-xs text-rose-500">{msg}</p>}

      {/* ---------- coming up ---------- */}
      {filtered.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Coming up</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {filtered.slice(0, 12).map(e => {
              const meta = TYPE_META[e.event_type];
              const brand = brandOf(e.brand_id);
              const working = statusOf(e) === "working";
              const key = meta.key;
              return (
                <button key={e.id} onClick={() => setDrawerId(e.id)}
                  className={`text-left bg-white rounded-2xl shrink-0 overflow-hidden flex flex-col hover:-translate-y-0.5 transition ${key ? "w-[228px] shadow-md" : "w-[190px] shadow-sm opacity-80 hover:opacity-100"}`}
                  style={key ? { border: `2px solid ${meta.color}` } : { border: "1px solid #edeef0" }}>
                  {e.image_url ? (
                    <img src={e.image_url} alt={e.title} className={key ? "w-full h-32 object-cover" : "w-full h-16 object-cover"} />
                  ) : (
                    <div className={key ? "w-full h-16 flex items-center justify-center" : "w-full h-10 flex items-center justify-center"} style={{ background: meta.bg }}>
                      <span className={key ? "text-[12px] font-extrabold uppercase tracking-widest" : "text-[9px] font-bold uppercase tracking-wide"} style={{ color: meta.color }}>{meta.short}</span>
                    </div>
                  )}
                  <div className={key ? "p-3.5 flex flex-col gap-2 flex-1" : "p-2.5 flex flex-col gap-1 flex-1"}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {e.image_url && <span className={`font-bold uppercase tracking-wide rounded-full ${key ? "text-[10px] px-2 py-0.5" : "text-[8px] px-1.5 py-0.5"}`} style={{ background: meta.bg, color: meta.color }}>{meta.short}</span>}
                      {brand && <span className={`font-semibold ${key ? "text-[11px]" : "text-[9px]"}`} style={{ color: brand.color ?? "#64748b" }}>{brand.name}</span>}
                    </div>
                    <p className={key ? "text-[15px] font-extrabold text-slate-800 leading-snug" : "text-[12px] font-semibold text-slate-600 leading-snug"}>{e.title}</p>
                    <div className="mt-auto pt-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">{fmtD(toMs(e.date!))}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: working ? "#fffbeb" : "#f0fdf4", color: working ? "#b45309" : "#15803d" }}>{dueLabel(toMs(e.date!), today)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && admin && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 space-y-2.5">
          <div className="grid sm:grid-cols-2 gap-2.5">
            <select value={form.brand_id} onChange={e => setForm(p => ({ ...p, brand_id: e.target.value }))} className={inp}>
              <option value="">Select brand…</option>
              {live.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={form.event_type} onChange={e => setForm(p => ({ ...p, event_type: e.target.value as EventType }))} className={inp}>
              {TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
          </div>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Title (e.g. Kona launch)" className={inp + " w-full"} />
          <div className="grid sm:grid-cols-5 gap-2.5">
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={inp} />
            <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} placeholder="End (optional)" className={inp} />
            <input value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} placeholder="Qty (optional)" inputMode="numeric" className={inp} />
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Status }))} className={inp}>
              <option value="locked">Locked</option>
              <option value="working">Working, not signed off</option>
            </select>
            <input value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} placeholder="Product (optional)" className={inp} />
          </div>
          <textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} rows={2} placeholder="Note — who owns it, what it depends on, what's still unconfirmed" className={inp + " w-full"} />
          <p className="text-[11px] text-gray-400">No date yet? Leave the date blank — it'll land in the "waiting on a date" tray below instead.</p>
          <div className="flex items-center gap-2">
            <button onClick={submit} disabled={!form.brand_id || !form.title} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">{editingId ? "Save changes" : "Add to timeline"}</button>
            {editingId && <button onClick={resetForm} className="text-sm font-semibold text-gray-500 hover:text-gray-700">Cancel</button>}
          </div>
        </div>
      )}

      {/* ---------- gantt view ---------- */}
      {view === "gantt" && (
        gantt ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto max-h-[70vh]">
            <div style={{ width: gantt.nameW + gantt.total, minWidth: "100%" }}>
              <div className="flex sticky top-0 z-20 bg-white border-b border-gray-100" style={{ height: 40 }}>
                <div className="sticky left-0 z-30 bg-white border-r border-gray-100 flex items-end px-3 pb-2" style={{ width: gantt.nameW, flex: "0 0 auto" }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Brand</span>
                </div>
                <div style={{ position: "relative", width: gantt.total, flex: "0 0 auto" }}>
                  {gantt.months.map((m, i) => (
                    <div key={i} className="absolute bottom-0 pb-2 pl-2 border-l border-gray-100" style={{ left: m.left, width: m.w, top: 0 }}>
                      <span className="text-[12px] font-bold text-slate-700">{m.label}</span>
                      <span className="text-[9px] text-gray-400 ml-1">&rsquo;{m.yr}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                {gantt.todayX != null && (
                  <div className="absolute z-10 pointer-events-none" style={{ left: gantt.nameW + gantt.todayX, top: 0, bottom: 0, width: 1, background: "#b8342a" }}>
                    <div className="absolute -translate-x-1/2 text-white text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 whitespace-nowrap shadow-sm" style={{ top: -1, background: "#b8342a" }}>Today</div>
                  </div>
                )}
                {gantt.rows.map(row => (
                  <div key={row.brand.id} className="flex border-b border-gray-50" style={{ height: row.h }}>
                    <div className="sticky left-0 z-10 bg-white border-r border-gray-100 flex items-center gap-2 px-3" style={{ width: gantt.nameW, flex: "0 0 auto" }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: row.brand.color || "#94a3b8" }} />
                      <b className="text-[13px] font-semibold text-slate-800 leading-tight truncate">{row.brand.name}</b>
                    </div>
                    <div style={{ position: "relative", width: gantt.total, flex: "0 0 auto" }}>
                      {gantt.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-gray-50" style={{ left: m.left }} />)}
                      {row.items.length === 0 && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] italic text-gray-300 z-0">—</span>}
                      {row.items.map(({ e, left, w, bar, lane }) => {
                        const meta = TYPE_META[e.event_type];
                        const working = statusOf(e) === "working";
                        const past = toMs(e.end_date || e.date!) < today;
                        const key = meta.key;
                        // Key dates (stock/launch/coming soon) get a bold solid pill;
                        // other activity (events/trade/campaigns) stays quiet and outlined.
                        return (
                          <button key={e.id} onClick={() => setDrawerId(e.id)} title={e.title}
                            className={`absolute rounded-full flex items-center gap-1.5 whitespace-nowrap hover:shadow-md hover:-translate-y-px transition z-[1] ${key ? "h-[24px] text-[12px] font-bold" : "h-[19px] text-[10.5px] font-medium"}`}
                            style={{
                              left, top: (key ? 5 : 8) + lane * 27, width: bar ? w : undefined,
                              padding: bar ? (key ? "0 11px 0 12px" : "0 8px 0 9px") : (key ? "0 11px 0 8px" : "0 8px 0 6px"),
                              border: key ? `1.5px solid ${meta.color}` : `1px solid color-mix(in srgb, ${meta.color} 40%, #fff)`,
                              borderStyle: working ? "dashed" : "solid",
                              background: key ? (working ? "#fff" : meta.color) : (bar ? `color-mix(in srgb, ${meta.color} 6%, #fff)` : "#fff"),
                              color: key ? (working ? meta.color : "#fff") : `color-mix(in srgb, ${meta.color} 75%, #6b7280)`,
                              opacity: past ? 0.4 : 1,
                              boxShadow: key && !working ? `0 1px 3px color-mix(in srgb, ${meta.color} 35%, transparent)` : undefined,
                            }}>
                            {!bar && <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: key ? (working ? meta.color : "#fff") : meta.color, border: key && working ? `1.5px solid ${meta.color}` : undefined }} />}
                            {bar && <span className="absolute left-0 top-0 bottom-0 rounded-l-full" style={{ width: key ? 4 : 3, background: meta.color }} />}
                            <span className={bar ? "pl-1" : ""}>{e.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">Nothing matches those filters.</div>
        )
      )}

      {/* ---------- list view ---------- */}
      {view === "list" && (
        grouped.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">Nothing on the timeline yet.</div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-100" />
            {grouped.map(group => (
              <div key={group.month} className="mb-8 last:mb-0">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 -ml-6 pl-0">{group.month}</p>
                <div className="space-y-3">
                  {group.items.map(e => {
                    const meta = TYPE_META[e.event_type];
                    const brand = brandOf(e.brand_id);
                    const working = statusOf(e) === "working";
                    const isPast = toMs(e.end_date || e.date!) < today;
                    return (
                      <div key={e.id} className="relative">
                        <span className="absolute -left-6 top-4 w-4 h-4 rounded-full border-4 border-white shadow" style={{ background: meta.color }} />
                        <button onClick={() => setDrawerId(e.id)} className={`w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex ${isPast ? "opacity-60" : ""}`}>
                          {e.image_url && <img src={e.image_url} alt={e.title} className="w-28 h-28 object-cover shrink-0" />}
                          <div className="flex-1 min-w-0 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.short}</span>
                                  {brand && <span className="text-[11px] font-semibold" style={{ color: brand.color ?? "#64748b" }}>{brand.name}</span>}
                                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${working ? "text-amber-600 bg-amber-50" : "text-gray-500 bg-gray-100"}`}>{working ? "Working" : "Locked"}</span>
                                  {e.source && <span className="text-[10px] font-semibold text-gray-400">· {SOURCE_META[e.source]}</span>}
                                </div>
                                <p className="font-semibold text-slate-800 mt-1.5">{e.title}</p>
                                {e.product_name && <p className="text-xs text-gray-500 mt-0.5">{e.product_name}{e.quantity != null ? ` · ${e.quantity.toLocaleString()} units` : ""}</p>}
                                {e.note && <p className="text-xs text-gray-400 mt-1 whitespace-pre-line line-clamp-2">{e.note}</p>}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-slate-800 leading-none">{fmtD(toMs(e.date!))}</p>
                                {e.end_date && e.end_date !== e.date && <p className="text-[11px] text-gray-400 mt-1">– {fmtD(toMs(e.end_date))}</p>}
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ---------- tray ---------- */}
      {tray.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-1">Waiting on a date</h2>
          <p className="text-xs text-gray-400 mb-3 max-w-prose">Real work with no date attached yet — the chase list before the timeline is complete.</p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
            {tray.map(e => {
              const meta = TYPE_META[e.event_type];
              const brand = brandOf(e.brand_id);
              return (
                <div key={e.id} className="bg-white rounded-xl border border-dashed border-gray-200 p-3.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.short}</span>
                    {brand && <span className="text-[11px] font-semibold" style={{ color: brand.color ?? "#64748b" }}>{brand.name}</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                  {e.note && <p className="text-xs text-gray-400 line-clamp-2">{e.note}</p>}
                  {admin && typeof e.id === "number" && <button onClick={() => startEdit(e)} className="text-[11px] font-semibold text-emerald-600 hover:underline self-start mt-1">Set a date →</button>}
                  {e.source && <span className="text-[10px] text-gray-400">{SOURCE_META[e.source]}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- legend ---------- */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {TYPES.map(t => (
          <span key={t} className="inline-flex items-center gap-1.5 text-xs text-gray-500"><i className="w-4 h-2.5 rounded-full border" style={{ background: TYPE_META[t].color, borderColor: TYPE_META[t].color }} />{TYPE_META[t].label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><i className="w-4 h-2.5 rounded-full border border-dashed border-gray-400" /> Working, needs sign off</span>
      </div>

      {/* ---------- drawer ---------- */}
      {drawerEv && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 z-[70]" onClick={() => setDrawerId(null)} />
          <aside className="fixed top-0 right-0 bottom-0 w-full max-w-[420px] bg-white z-[71] shadow-2xl overflow-y-auto p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{brandOf(drawerEv.brand_id)?.name}</p>
                <h2 className="text-xl font-extrabold text-slate-800 mt-1">{drawerEv.title}</h2>
              </div>
              <button onClick={() => setDrawerId(null)} className="w-8 h-8 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 shrink-0">×</button>
            </div>
            {drawerEv.image_url && <img src={drawerEv.image_url} alt="" className="w-full rounded-xl mt-4 object-cover max-h-56" />}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: TYPE_META[drawerEv.event_type].bg, color: TYPE_META[drawerEv.event_type].color }}>{TYPE_META[drawerEv.event_type].label}</span>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${statusOf(drawerEv) === "working" ? "text-amber-600 bg-amber-50" : "text-gray-500 bg-gray-100"}`}>{statusOf(drawerEv) === "working" ? "Working, not signed off" : "Locked date"}</span>
            </div>
            <p className="text-sm font-semibold text-slate-700 mt-4">{drawerEv.date ? fmtLong(toMs(drawerEv.date)) : "No date set"}{drawerEv.end_date && drawerEv.end_date !== drawerEv.date ? ` – ${fmtD(toMs(drawerEv.end_date))}` : ""}</p>
            {drawerEv.product_name && <p className="text-xs text-gray-500 mt-1">{drawerEv.product_name}{drawerEv.quantity != null ? ` · ${drawerEv.quantity.toLocaleString()} units` : ""}</p>}
            {drawerEv.note && <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100 whitespace-pre-line">{drawerEv.note}</p>}
            {drawerEv.source ? (
              <p className="text-xs text-gray-400 mt-5 pt-4 border-t border-gray-100">{SOURCE_META[drawerEv.source]} — edit it from that tab.</p>
            ) : admin && (
              <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100">
                <button onClick={() => startEdit(drawerEv)} className="text-xs font-semibold text-emerald-600 hover:underline">Edit</button>
                <label className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer">
                  {uploadingId === drawerEv.id ? "Uploading…" : drawerEv.image_url ? "Change photo" : "+ Add photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) uploadImage(drawerEv.id, f); ev.currentTarget.value = ""; }} />
                </label>
                <button onClick={() => removeEvent(drawerEv.id)} className="text-xs font-semibold text-rose-500 hover:underline">Remove</button>
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
