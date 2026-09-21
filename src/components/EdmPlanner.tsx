"use client";

import { useEffect, useMemo, useState } from "react";

// EDM Planner (Email Marketing > EDM Planner) — a forward-looking view over
// the same edm_drafts table Email Writing uses (src/app/api/edm-drafts/route.ts),
// so nothing here duplicates data. Lets Mel see what's scheduled/needs
// writing across all brands at a glance (calendar or pipeline-by-status),
// drop in a quick "planned" placeholder (brand + date + one-line brief, no
// AI call yet — status stays "planned" until she's ready to generate it),
// and jump straight into Email Writing to draft or send it.
type Draft = {
  id: string; brand_id: number; status: "planned" | "draft" | "sent" | "rejected";
  subject: string; preview_text: string | null; brief: string | null;
  scheduled_for: string | null; created_at: string;
};
type Brand = { id: number; name: string; color: string; live: boolean };

const STATUSES = [
  { key: "planned", label: "Planned", dot: "#0ea5e9" },
  { key: "draft", label: "Needs review", dot: "#f59e0b" },
  { key: "sent", label: "Sent", dot: "#10b981" },
  { key: "rejected", label: "Rejected", dot: "#94a3b8" },
] as const;
const statusMeta = (k: string) => STATUSES.find(s => s.key === k) ?? STATUSES[0];
const fmtD = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const todayKey = () => new Date().toISOString().slice(0, 7);

export function EdmPlanner({ brands, onOpenInStudio }: { brands: Brand[]; onOpenInStudio: (id: string) => void }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<"calendar" | "pipeline">("calendar");
  const [monthKey, setMonthKey] = useState(todayKey());
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");
  const [plan, setPlan] = useState<Partial<{ brand_id: number; scheduled_for: string; brief: string }> | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planErr, setPlanErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const liveBrands = useMemo(() => brands.filter(b => b.live), [brands]);
  const brandOf = (id: number) => brands.find(b => b.id === id);
  const colorOf = (id: number) => brandOf(id)?.color ?? "#6366f1";

  function load() {
    fetch("/api/edm-drafts").then(r => r.json()).then(d => {
      setNeedsSetup(!!d.needsSetup); setItems(d.items ?? []); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const visible = items.filter(i => brandFilter === "all" || i.brand_id === brandFilter);
  const inMonth = (d: string | null) => !!d && d.slice(0, 7) === monthKey;
  const monthItems = visible.filter(i => inMonth(i.scheduled_for));
  const open = items.find(i => i.id === openId) ?? null;

  async function submitPlan() {
    if (!plan?.brand_id || !plan.brief?.trim()) return;
    setPlanning(true); setPlanErr("");
    const res = await fetch("/api/edm-drafts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_only: true, brand_id: plan.brand_id, scheduled_for: plan.scheduled_for || null, brief: plan.brief.trim() }),
    }).then(r => r.json()).catch(() => null);
    setPlanning(false);
    if (res?.ok) { setPlan(null); load(); }
    else if (res?.needsSetup) { setNeedsSetup(true); setPlan(null); }
    else setPlanErr(res?.error || "Couldn't save that — try again.");
  }
  async function moveDate(id: string, scheduled_for: string | null) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, scheduled_for } : p)); // optimistic
    await fetch("/api/edm-drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "edit", scheduled_for }) });
  }
  async function remove(id: string) {
    await fetch(`/api/edm-drafts?id=${id}`, { method: "DELETE" });
    setOpenId(null); load();
  }

  const monthLabel = new Date(monthKey + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  function shiftMonth(delta: number) {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Live brands with nothing scheduled this month — a gentle nudge, not a rule.
  const scheduledBrandIds = new Set(monthItems.filter(i => i.status !== "rejected").map(i => i.brand_id));
  const gapBrands = (brandFilter === "all" ? liveBrands : liveBrands.filter(b => b.id === brandFilter)).filter(b => !scheduledBrandIds.has(b.id));

  if (needsSetup) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-2xl">
        <h2 className="font-semibold text-gray-800">Email Writing needs setting up first</h2>
        <p className="text-sm text-gray-500 mt-1">The EDM Planner reads from the same table as Email Writing — run that table's setup SQL there first, then reload here.</p>
        <button onClick={() => { setLoading(true); setNeedsSetup(false); load(); }} className="mt-4 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">I've run it — reload</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">EDM Planner</h2>
          <p className="text-xs text-gray-400 mt-0.5">What's scheduled and what needs writing, across every brand.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-2 text-slate-600 focus:outline-none">
            <option value="all">All brands</option>
            {liveBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            {(["calendar", "pipeline"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${view === v ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => setPlan({ brand_id: brandFilter === "all" ? liveBrands[0]?.id : (brandFilter as number), scheduled_for: `${monthKey}-15` })}
            className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2 shrink-0">+ Plan EDM</button>
        </div>
      </div>

      {view === "calendar" && (
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="text-gray-400 hover:text-gray-600 text-sm px-2">←</button>
          <p className="text-sm font-semibold text-slate-700 w-40 text-center">{monthLabel}</p>
          <button onClick={() => shiftMonth(1)} className="text-gray-400 hover:text-gray-600 text-sm px-2">→</button>
        </div>
      )}

      {!loading && gapBrands.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Nothing scheduled for {monthLabel}:</span>{" "}
            {gapBrands.map((b, i) => (
              <button key={b.id} onClick={() => setPlan({ brand_id: b.id, scheduled_for: `${monthKey}-15` })} className="underline decoration-amber-300 hover:decoration-amber-600">
                {b.name}{i < gapBrands.length - 1 ? "," : ""}
              </button>
            )).reduce((a, b) => [a, " ", b] as any)}
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : view === "pipeline" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUSES.map(s => {
            const col = visible.filter(i => i.status === s.key).sort((a, b) => (a.scheduled_for ?? "9999").localeCompare(b.scheduled_for ?? "9999"));
            return (
              <div key={s.key} className="bg-gray-50/70 rounded-xl p-2.5 min-h-[120px]">
                <div className="flex items-center gap-1.5 px-1 pb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{s.label}</span>
                  <span className="text-[11px] text-gray-400">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map(it => <DraftCard key={it.id} it={it} colorOf={colorOf} brandOf={brandOf} onClick={() => setOpenId(it.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CalendarGrid monthKey={monthKey} items={visible} colorOf={colorOf}
          onAdd={d => setPlan({ brand_id: brandFilter === "all" ? liveBrands[0]?.id : (brandFilter as number), scheduled_for: d })}
          onOpen={id => setOpenId(id)} onMove={moveDate} />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpenId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(open.brand_id) }} />
              <span className="text-xs text-gray-400">{brandOf(open.brand_id)?.name}</span>
              <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full`} style={{ color: statusMeta(open.status).dot, background: `${statusMeta(open.status).dot}18` }}>{statusMeta(open.status).label}</span>
            </div>
            <h3 className="font-semibold text-gray-800 leading-snug">{open.subject || open.brief || "Untitled"}</h3>
            {open.preview_text && <p className="text-xs text-gray-400 mt-1">{open.preview_text}</p>}
            {open.brief && open.subject && <p className="text-xs text-gray-400 mt-2">Brief: {open.brief}</p>}
            <div className="mt-3">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Scheduled for</label>
              <input type="date" value={open.scheduled_for ?? ""} onChange={e => moveDate(open.id, e.target.value || null)}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => onOpenInStudio(open.id)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">
                {open.status === "planned" ? "Write this in Email Writing →" : "Open in Email Writing →"}
              </button>
              <button onClick={() => setOpenId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Close</button>
              <button onClick={() => remove(open.id)} className="ml-auto text-sm text-rose-500 hover:text-rose-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPlan(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">Plan an EDM</h3>
            <p className="text-xs text-gray-400 -mt-3 mb-4">Just a placeholder — this doesn't generate anything yet. Write it whenever you're ready in Email Writing.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</label>
                  <select value={plan.brand_id ?? ""} onChange={e => setPlan(p => ({ ...p, brand_id: Number(e.target.value) }))}
                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                    {liveBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Send date</label>
                  <input type="date" value={plan.scheduled_for ?? ""} onChange={e => setPlan(p => ({ ...p, scheduled_for: e.target.value }))}
                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">One-line brief</label>
                <textarea autoFocus value={plan.brief ?? ""} onChange={e => setPlan(p => ({ ...p, brief: e.target.value }))} rows={2}
                  placeholder="e.g. Father's Day gift guide — Wonder max as the hero"
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none" />
              </div>
              {planErr && <p className="text-[11px] text-rose-500">{planErr}</p>}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button disabled={!plan.brand_id || !plan.brief?.trim() || planning} onClick={submitPlan}
                className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">{planning ? "Saving…" : "Save"}</button>
              <button onClick={() => setPlan(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftCard({ it, colorOf, brandOf, onClick }: { it: Draft; colorOf: (id: number) => string; brandOf: (id: number) => Brand | undefined; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-lg border border-gray-100 shadow-sm p-2.5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(it.brand_id) }} />
        <span className="text-[10px] text-gray-400 truncate">{brandOf(it.brand_id)?.name}</span>
      </div>
      <p className="text-xs text-slate-700 font-medium leading-snug">{it.subject || it.brief || "Untitled"}</p>
      {it.scheduled_for && <span className="text-[10px] text-gray-400 mt-1 block">{fmtD(it.scheduled_for)}</span>}
    </button>
  );
}

function CalendarGrid({ monthKey, items, colorOf, onAdd, onOpen, onMove }: {
  monthKey: string; items: Draft[]; colorOf: (id: number) => string;
  onAdd: (d: string) => void; onOpen: (id: string) => void; onMove: (id: string, d: string) => void;
}) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthKey}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const byDay = new Map<string, Draft[]>();
  for (const it of items) if (it.scheduled_for) { const k = it.scheduled_for; byDay.set(k, [...(byDay.get(k) ?? []), it]); }
  const today = new Date().toISOString().slice(0, 10);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d} className="text-[10px] font-semibold text-gray-400 text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => (
          <div key={i}
            onDragOver={e => date && e.preventDefault()}
            onDrop={() => { if (date && dragId) { onMove(dragId, date); setDragId(null); } }}
            className={`min-h-[84px] rounded-lg border p-1 ${date ? "border-gray-100" : "border-transparent bg-gray-50/40"} ${date === today ? "ring-1 ring-emerald-300" : ""}`}>
            {date && (
              <>
                <button onClick={() => onAdd(date)} className="w-full text-left text-[10px] text-gray-400 hover:text-emerald-500 px-0.5">{Number(date.slice(-2))}</button>
                <div className="space-y-1 mt-0.5">
                  {(byDay.get(date) ?? []).map(it => (
                    <button key={it.id} draggable onDragStart={() => setDragId(it.id)} onClick={() => onOpen(it.id)}
                      className="w-full text-left flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-50" style={{ background: `${colorOf(it.brand_id)}14` }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colorOf(it.brand_id) }} />
                      <span className="text-[9px] text-slate-600 truncate">{it.subject || it.brief || "Untitled"}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
