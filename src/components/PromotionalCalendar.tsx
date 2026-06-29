"use client";

import { useEffect, useMemo, useState } from "react";

type Promo = {
  id: number; brand_id: number | null; brand: string; period_start: string; period_end: string;
  channel: string | null; tier: number | null;
};
type D2c = {
  id: number; brand: string; brand_id: number | null; sku: string | null; product: string | null;
  period_start: string; period_end: string; tier: number | null; rrp: number | null;
  promo_price: number | null; discount_rrp: number | null; retailers: string | null; status: string; note: string | null;
};
type Brand = { id: number; name: string };

const TIER_COLOR: Record<number, string> = { 1: "#0F9ED5", 2: "#4EA72E" };
const tierColor = (t: number | null) => (t && TIER_COLOR[t]) || "#94a3b8";
const d = (s: string) => new Date(s + "T00:00:00");
const fmt = (s: string | null) => s ? d(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
const money = (n: number | null) => n == null ? "—" : "$" + n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
const pct = (n: number | null) => n == null ? "—" : `-${Math.round(Math.abs(n) * 100)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fyStartYear = (s: string) => { const dt = d(s); return dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1; };

// Split a product name into base + colour, so colour variants can be grouped.
// Handles "… Gift Tube - Beige" and "Boat Set (Blue)".
function splitColour(name: string | null): { base: string; colour: string | null } {
  const s = (name || "").trim();
  if (!s) return { base: s, colour: null };
  const par = s.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (par) return { base: par[1].trim(), colour: par[2].trim() };
  const i = s.lastIndexOf(" - ");
  if (i > 0) {
    const tail = s.slice(i + 3).trim();
    if (tail && tail.split(/\s+/).length <= 3) return { base: s.slice(0, i).trim(), colour: tail };
  }
  return { base: s, colour: null };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  todo: { label: "To do", cls: "bg-slate-100 text-slate-500" },
  action: { label: "Action → Campaign", cls: "bg-amber-100 text-amber-700" },
  planned: { label: "Planned", cls: "bg-sky-100 text-sky-700" },
  live: { label: "Live", cls: "bg-emerald-100 text-emerald-700" },
  done: { label: "Done", cls: "bg-violet-100 text-violet-700" },
  skip: { label: "Skip", cls: "bg-rose-50 text-rose-400" },
};
const STATUS_LIST = ["todo", "action", "planned", "live", "done", "skip"];

export function PromotionalCalendar({ canEdit, fy, month }: { canEdit: boolean; brands: Brand[]; fy: string; month: string }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [d2c, setD2c] = useState<D2c[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandF, setBrandF] = useState("");
  const [tierF, setTierF] = useState("");
  const [statusF, setStatusF] = useState("");

  async function load() {
    setLoading(true);
    const [a, c] = await Promise.all([
      fetch("/api/promotions").then(x => x.json()).catch(() => ({ ok: false })),
      fetch("/api/d2c").then(x => x.json()).catch(() => ({ ok: false })),
    ]);
    setLoading(false);
    if (!a.ok && a.needsSetup) { setNeedsSetup(true); return; }
    setPromos(a.items || []);
    setD2c(c.items || []);
  }
  useEffect(() => { load(); }, []);

  // Sidebar Financial Year + Month drive the scope.
  const fyStart = Number((fy || "").slice(0, 4)) || null;
  const inScope = (s: string | null) => !!s && (fyStart === null || fyStartYear(s) === fyStart) && (month === "all" || !month || s.slice(0, 7) === month);
  const promosFY = useMemo(() => promos.filter(p => inScope(p.period_start) && (!brandF || p.brand === brandF) && (!tierF || String(p.tier) === tierF)), [promos, fy, month, brandF, tierF]); // eslint-disable-line react-hooks/exhaustive-deps
  const d2cFY = useMemo(() => d2c.filter(r => inScope(r.period_start)), [d2c, fy, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const promoBrands = useMemo(() => Array.from(new Set(promos.filter(p => inScope(p.period_start)).map(p => p.brand))).sort(), [promos, fy, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timeline span + month columns
  const { min, max, monthCols } = useMemo(() => {
    if (!promosFY.length) return { min: new Date(), max: new Date(), monthCols: [] as { label: string; left: number }[] };
    const ss = promosFY.map(p => +d(p.period_start)); const ee = promosFY.map(p => +d(p.period_end));
    const mn = new Date(Math.min(...ss)); const mx = new Date(Math.max(...ee)); mn.setDate(1); mx.setMonth(mx.getMonth() + 1, 0);
    const span = +mx - +mn; const cols: { label: string; left: number }[] = []; const cur = new Date(mn);
    while (cur <= mx) { cols.push({ label: MONTHS[cur.getMonth()], left: (+cur - +mn) / span * 100 }); cur.setMonth(cur.getMonth() + 1); }
    return { min: mn, max: mx, monthCols: cols };
  }, [promosFY]);
  const span = +max - +min || 1;
  const pos = (s: string) => (+d(s) - +min) / span * 100;
  const byBrand = useMemo(() => {
    const m = new Map<string, Promo[]>(); for (const p of promosFY) (m.get(p.brand) || m.set(p.brand, []).get(p.brand)!).push(p);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [promosFY]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading promotions…</div>;
  if (needsSetup) return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
      No promotions yet. Run <code>add_promotions.sql</code> and <code>add_promo_lines.sql</code> in Supabase, then sync the Promo Tracker.
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={brandF} onChange={e => setBrandF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All brands</option>{promoBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={tierF} onChange={e => setTierF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">Both tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option>
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All statuses</option>{STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: TIER_COLOR[1] }} /> Tier 1 (deeper)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: TIER_COLOR[2] }} /> Tier 2</span>
        </div>
      </div>

      {/* Timeline overview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Promotion timeline</h3>
        <div className="min-w-[760px]">
          <div className="relative ml-36 h-5 mb-1">
            {monthCols.map((m, i) => <span key={i} className="absolute text-[11px] font-semibold text-slate-400" style={{ left: `${m.left}%` }}>{m.label}</span>)}
          </div>
          <div className="relative">
            {/* vertical month gridlines */}
            <div className="absolute inset-0 ml-36 pointer-events-none">
              {monthCols.map((m, i) => <span key={i} className="absolute top-0 bottom-0 w-px bg-slate-100" style={{ left: `${m.left}%` }} />)}
            </div>
            {byBrand.map(([brand, ps], idx) => (
              <div key={brand} className={`flex items-center h-10 rounded-lg ${idx % 2 ? "bg-slate-50/40" : ""}`}>
                <div className="w-36 shrink-0 text-sm font-semibold text-slate-700 truncate pr-3">{brand}</div>
                <div className="relative flex-1 h-7">
                  {ps.map(p => {
                    const left = pos(p.period_start); const right = pos(p.period_end);
                    const w = Math.max(right - left, 1.5);
                    return (
                      <div key={p.id} title={`Tier ${p.tier ?? "?"} · ${p.channel || "Sale"} · ${fmt(p.period_start)}–${fmt(p.period_end)}`}
                        className="absolute top-1 h-5 rounded-md text-[10px] text-white font-medium px-1.5 truncate flex items-center shadow-sm transition-transform hover:scale-[1.02] hover:z-10"
                        style={{ left: `${left}%`, width: `${w}%`, background: tierColor(p.tier) }}>
                        {w > 6 ? (p.channel || "") : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {byBrand.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No promotions in this period.</div>}
          </div>
        </div>
      </div>

      {/* D2C plan */}
      <D2cPlan d2c={d2cFY} canEdit={canEdit} brandF={brandF} tierF={tierF} statusF={statusF} onChanged={load} />
    </div>
  );
}

function TierBadge({ t }: { t: number | null }) {
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: tierColor(t) }}>{t ? `T${t}` : "?"}</span>;
}

function D2cPlan({ d2c, canEdit, brandF, tierF, statusF, onChanged }: { d2c: D2c[]; canEdit: boolean; brandF: string; tierF: string; statusF: string; onChanged: () => void }) {
  const rows = d2c.filter(r => (!brandF || r.brand === brandF) && (!tierF || String(r.tier) === tierF) && (!statusF || r.status === statusF));
  const counts = d2c.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {} as Record<string, number>);

  const monthsOrder: string[] = [];
  const months = new Map<string, D2c[]>();
  for (const r of [...rows].sort((a, b) => a.period_start.localeCompare(b.period_start) || a.brand.localeCompare(b.brand))) {
    const key = r.period_start.slice(0, 7);
    if (!months.has(key)) { months.set(key, []); monthsOrder.push(key); }
    months.get(key)!.push(r);
  }
  const monthLabel = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set(monthsOrder.slice(0, 1)));
  const [groupColours, setGroupColours] = useState(true);
  const toggle = (k: string) => setOpenMonths(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  async function setStatus(ids: number[], status: string) {
    await Promise.all(ids.map(id => fetch("/api/d2c", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => {})));
    onChanged();
  }

  // "Action" → create a Campaign from the promo (shows in Campaigns + on the Calendar
  // via its start-date key_date), then mark the product's colours as actioned.
  async function action(g: VGroup) {
    const r = g.rep;
    const days = (+d(r.period_start) - Date.now()) / 86400000;
    const horizon = days <= 42 ? "now" : days <= 120 ? "next" : "later";
    const note = `D2C mirror of ${r.retailers || "retailer"} promo · ${fmt(r.period_start)}–${fmt(r.period_end)} · ${money(r.promo_price)}${r.rrp ? ` (was ${money(r.rrp)}, ${pct(r.discount_rrp)})` : ""}`;
    await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        horizon, campaign: g.base, brand: r.brand, channel: "D2C", status: "Planned", owner: "TBC",
        key_date: r.period_start, end_date: r.period_end, note, brief: { oneLiner: note },
      }),
    }).catch(() => {});
    await setStatus(g.ids, "action");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {STATUS_LIST.map(s => (
          <span key={s} className={`px-2.5 py-1 rounded-full font-semibold ${STATUS_META[s].cls}`}>{STATUS_META[s].label}: {counts[s] || 0}</span>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer"><input type="checkbox" checked={groupColours} onChange={e => setGroupColours(e.target.checked)} className="accent-emerald-500" /> Group colours</label>
          <button onClick={() => setOpenMonths(new Set(monthsOrder))} className="text-emerald-600 hover:underline">Expand all</button>
          <button onClick={() => setOpenMonths(new Set())} className="text-slate-400 hover:underline">Collapse all</button>
        </div>
      </div>
      <p className="text-xs text-slate-400">Open a month, then a brand, to see its sales. Run the same on D2C for the same dates and set each status.</p>

      {monthsOrder.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-8 text-center text-slate-300 text-sm">No D2C promos in this period.</div>}

      {monthsOrder.map(mk => {
        const list = months.get(mk)!;
        const isOpen = openMonths.has(mk);
        const brandsIn = Array.from(new Set(list.map(r => r.brand)));
        return (
          <div key={mk} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => toggle(mk)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="flex items-center gap-2">
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="font-semibold text-slate-700">{monthLabel(mk)}</span>
              </span>
              <span className="text-xs text-slate-400">{list.length} sale{list.length === 1 ? "" : "s"} · {brandsIn.length} brand{brandsIn.length === 1 ? "" : "s"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {brandsIn.map(brand => (
                  <BrandGroup key={brand} brand={brand} rows={list.filter(r => r.brand === brand)} canEdit={canEdit} setStatus={setStatus} action={action} groupColours={groupColours} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type VGroup = { base: string; colours: string[]; ids: number[]; rows: D2c[]; rep: D2c };

function buildGroups(rows: D2c[]): VGroup[] {
  const map = new Map<string, VGroup>();
  const order: string[] = [];
  for (const r of rows) {
    const { base, colour } = splitColour(r.product || r.sku);
    const key = `${base}|${r.period_start}|${r.period_end}|${r.tier}|${r.promo_price}`;
    let g = map.get(key);
    if (!g) { g = { base, colours: [], ids: [], rows: [], rep: r }; map.set(key, g); order.push(key); }
    g.rows.push(r); g.ids.push(r.id); if (colour) g.colours.push(colour);
  }
  return order.map(k => map.get(k)!);
}

function BrandGroup({ brand, rows, canEdit, setStatus, action, groupColours }: { brand: string; rows: D2c[]; canEdit: boolean; setStatus: (ids: number[], s: string) => void; action: (g: VGroup) => void; groupColours: boolean }) {
  const [open, setOpen] = useState(false);
  const groups = groupColours ? buildGroups(rows) : rows.map(r => ({ base: r.product || r.sku || "—", colours: [], ids: [r.id], rows: [r], rep: r } as VGroup));
  const statusSummary = Array.from(new Set(rows.map(r => r.status)));
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2 bg-slate-50/50 hover:bg-slate-100/60">
        <span className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{brand}</span>
        </span>
        <span className="text-[11px] text-slate-400">{groups.length} product{groups.length === 1 ? "" : "s"}{statusSummary.length === 1 && statusSummary[0] !== "todo" ? ` · ${STATUS_META[statusSummary[0]]?.label}` : ""}</span>
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead className="bg-white text-slate-400 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Product</th><th className="text-left font-semibold px-3 py-2">Tier</th>
              <th className="text-left font-semibold px-3 py-2">Dates</th><th className="text-right font-semibold px-3 py-2">RRP</th>
              <th className="text-right font-semibold px-3 py-2">Promo</th><th className="text-right font-semibold px-3 py-2">Disc.</th>
              <th className="text-left font-semibold px-3 py-2">Retailers</th><th className="text-left font-semibold px-3 py-2">D2C status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {groups.map(g => {
              const r = g.rep;
              const statuses = Array.from(new Set(g.rows.map(x => x.status)));
              const unified = statuses.length === 1 ? statuses[0] : "";
              const grouped = g.rows.length > 1;
              return (
                <tr key={g.ids[0]} className={unified === "skip" ? "opacity-50" : ""}>
                  <td className="px-4 py-2 text-slate-700">
                    {g.base}
                    {grouped && <span className="ml-2 text-[10px] font-semibold text-slate-400">{g.colours.length || g.rows.length} colours</span>}
                    {grouped && g.colours.length > 0 && <div className="text-[11px] text-slate-400">{g.colours.join(", ")}</div>}
                  </td>
                  <td className="px-3 py-2"><TierBadge t={r.tier} /></td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmt(r.period_start)} – {fmt(r.period_end)}</td>
                  <td className="px-3 py-2 text-right text-slate-400 line-through">{money(r.rrp)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{money(r.promo_price)}</td>
                  <td className="px-3 py-2 text-right text-rose-500 font-medium">{pct(r.discount_rrp)}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{r.retailers || "—"}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={unified} onChange={e => e.target.value === "action" ? action(g) : setStatus(g.ids, e.target.value)}
                        className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer ${STATUS_META[unified]?.cls || "bg-slate-100 text-slate-400"}`}>
                        {unified === "" && <option value="">Mixed</option>}
                        {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    ) : <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_META[unified]?.cls || "bg-slate-100 text-slate-400"}`}>{unified ? STATUS_META[unified].label : "Mixed"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
