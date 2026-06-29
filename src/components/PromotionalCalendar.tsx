"use client";

import { useEffect, useMemo, useState } from "react";

type Promo = {
  id: number; brand_id: number | null; brand: string; period_start: string; period_end: string;
  channel: string | null; price: string | null; note: string | null; tier: number | null; source: string;
};
type Line = {
  id: number; customer: string | null; brand: string; brand_id: number | null; sku: string | null;
  promo_name: string | null; product: string | null; category: string | null; month: string | null;
  tier: number | null; start_date: string | null; end_date: string | null; days: number | null;
  rrp: number | null; current_price: number | null; promo_price: number | null; discount_rrp: number | null;
};
type D2c = {
  id: number; brand: string; brand_id: number | null; sku: string | null; product: string | null;
  period_start: string; period_end: string; tier: number | null; rrp: number | null;
  promo_price: number | null; discount_rrp: number | null; retailers: string | null;
  status: string; note: string | null;
};
type Brand = { id: number; name: string };

const TIER_COLOR: Record<number, string> = { 1: "#0F9ED5", 2: "#4EA72E" };
const tierColor = (t: number | null) => (t && TIER_COLOR[t]) || "#94a3b8";
const d = (s: string) => new Date(s + "T00:00:00");
const fmt = (s: string | null) => s ? d(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
const money = (n: number | null) => n == null ? "—" : "$" + n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
const pct = (n: number | null) => n == null ? "—" : `-${Math.round(Math.abs(n) * 100)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const norm = (s: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// AU financial year: starts 1 July. July 2026 onward = FY 2026-27.
const fyStartYear = (s: string) => { const dt = d(s); return dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1; };

export function PromotionalCalendar({ canEdit, brands, fy, month }: { canEdit: boolean; brands: Brand[]; fy: string; month: string }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [d2c, setD2c] = useState<D2c[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<"d2c" | "calendar" | "products">("d2c");
  const [brandF, setBrandF] = useState("");
  const [tierF, setTierF] = useState("");
  const [retailerF, setRetailerF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [a, b, c] = await Promise.all([
      fetch("/api/promotions").then(x => x.json()).catch(() => ({ ok: false })),
      fetch("/api/promo-lines").then(x => x.json()).catch(() => ({ ok: false })),
      fetch("/api/d2c").then(x => x.json()).catch(() => ({ ok: false })),
    ]);
    setLoading(false);
    if (!a.ok && a.needsSetup) { setNeedsSetup(true); return; }
    setPromos(a.items || []);
    setLines(b.items || []);
    setD2c(c.items || []);
  }
  useEffect(() => { load(); }, []);

  // Match a calendar promo to its product lines (brand + tier + date overlap + retailer).
  function linesFor(p: Promo): Line[] {
    const overlap = (l: Line) => l.start_date && l.end_date && l.start_date <= p.period_end && l.end_date >= p.period_start;
    const base = lines.filter(l => (l.brand_id === p.brand_id || norm(l.brand) === norm(p.brand)) && (!p.tier || l.tier === p.tier) && overlap(l));
    const chan = norm(p.channel);
    const byRetailer = base.filter(l => chan && l.customer && chan.includes(norm(l.customer)));
    return byRetailer.length ? byRetailer : base;
  }

  // Driven by the sidebar's Financial Year + Month selectors (no duplicate control here).
  const fyStart = Number((fy || "").slice(0, 4)) || null;
  const inScope = (s: string | null) => !!s && (fyStart === null || fyStartYear(s) === fyStart) && (month === "all" || !month || s.slice(0, 7) === month);
  const promosFY = useMemo(() => promos.filter(p => inScope(p.period_start)), [promos, fy, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const linesFY = useMemo(() => lines.filter(l => inScope(l.start_date)), [lines, fy, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const d2cFY = useMemo(() => d2c.filter(r => inScope(r.period_start)), [d2c, fy, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const retailers = useMemo(() => Array.from(new Set(linesFY.map(l => l.customer).filter(Boolean))) as string[], [linesFY]);
  const promoBrands = useMemo(() => Array.from(new Set(promosFY.map(p => p.brand))).sort(), [promosFY]);
  const fp = useMemo(() => promosFY.filter(p => (!brandF || p.brand === brandF) && (!tierF || String(p.tier) === tierF)), [promosFY, brandF, tierF]);

  // timeline span
  const { min, max, monthCols } = useMemo(() => {
    if (!promosFY.length) return { min: new Date(), max: new Date(), monthCols: [] as { label: string; left: number }[] };
    const ss = promosFY.map(p => +d(p.period_start)); const ee = promosFY.map(p => +d(p.period_end));
    const mn = new Date(Math.min(...ss)); const mx = new Date(Math.max(...ee)); mn.setDate(1); mx.setMonth(mx.getMonth() + 1, 0);
    const span = +mx - +mn; const cols: { label: string; left: number }[] = []; const cur = new Date(mn);
    while (cur <= mx) { cols.push({ label: `${MONTHS[cur.getMonth()]}`, left: (+cur - +mn) / span * 100 }); cur.setMonth(cur.getMonth() + 1); }
    return { min: mn, max: mx, monthCols: cols };
  }, [promosFY]);
  const span = +max - +min || 1;
  const pos = (s: string) => (+d(s) - +min) / span * 100;
  const byBrand = useMemo(() => {
    const m = new Map<string, Promo[]>(); for (const p of fp) (m.get(p.brand) || m.set(p.brand, []).get(p.brand)!).push(p);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [fp]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading promotions…</div>;
  if (needsSetup) return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
      No promotions yet. Run <code>add_promotions.sql</code> and <code>add_promo_lines.sql</code> in Supabase, then sync the Promo Tracker.
    </div>
  );

  const Legend = () => (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: TIER_COLOR[1] }} /> Tier 1 (deeper)</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: TIER_COLOR[2] }} /> Tier 2</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button onClick={() => setView("d2c")} className={`px-3 py-1.5 ${view === "d2c" ? "bg-emerald-500 text-white" : "text-slate-600"}`}>D2C plan</button>
          <button onClick={() => setView("calendar")} className={`px-3 py-1.5 border-l border-gray-200 ${view === "calendar" ? "bg-emerald-500 text-white" : "text-slate-600"}`}>Calendar</button>
          <button onClick={() => setView("products")} className={`px-3 py-1.5 border-l border-gray-200 ${view === "products" ? "bg-emerald-500 text-white" : "text-slate-600"}`}>By product</button>
        </div>
        <select value={brandF} onChange={e => setBrandF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All brands</option>{promoBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={tierF} onChange={e => setTierF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">Both tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option>
        </select>
        {view === "products" && (
          <select value={retailerF} onChange={e => setRetailerF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">All retailers</option>{retailers.sort().map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {view === "d2c" && (
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">All statuses</option><option value="todo">To do</option><option value="planned">Planned</option><option value="live">Live</option><option value="done">Done</option><option value="skip">Skip</option>
          </select>
        )}
        <div className="ml-auto"><Legend /></div>
      </div>

      {view === "d2c" ? (
        <D2cPlan d2c={d2cFY} canEdit={canEdit} brandF={brandF} tierF={tierF} statusF={statusF} onChanged={load} />
      ) : view === "calendar" ? (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="relative h-5 ml-32 mb-2 border-b border-gray-100">
                {monthCols.map((m, i) => <span key={i} className="absolute text-[10px] font-semibold text-slate-400 -translate-x-1/2" style={{ left: `${m.left}%` }}>{m.label}</span>)}
              </div>
              {byBrand.map(([brand, ps]) => (
                <div key={brand} className="flex items-center h-9 border-b border-gray-50 last:border-0">
                  <div className="w-32 shrink-0 text-xs font-semibold text-slate-600 truncate pr-2">{brand}</div>
                  <div className="relative flex-1 h-6">
                    {ps.map(p => {
                      const left = pos(p.period_start); const right = pos(p.period_end);
                      return (
                        <button key={p.id} onClick={() => setOpen(open === p.id ? null : p.id)}
                          title={`Tier ${p.tier ?? "?"} · ${p.channel || "Sale"} · ${fmt(p.period_start)}–${fmt(p.period_end)}`}
                          className="absolute top-0.5 h-5 rounded text-[9px] text-white font-medium px-1 truncate flex items-center"
                          style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%`, background: tierColor(p.tier) }}>
                          {p.channel || ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {byBrand.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No promotions match.</div>}
            </div>
          </div>

          {/* list with product drill-down */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Brand</th><th className="text-left font-semibold px-4 py-3">Tier</th>
                  <th className="text-left font-semibold px-4 py-3">Dates</th><th className="text-left font-semibold px-4 py-3">Retailer</th>
                  <th className="text-left font-semibold px-4 py-3">Products</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fp.map(p => {
                  const ls = linesFor(p);
                  return (
                    <PromoRow key={p.id} p={p} lines={ls} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
                  );
                })}
                {fp.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-300">No promotions.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <ProductTable lines={linesFY} brandF={brandF} tierF={tierF} retailerF={retailerF} />
      )}
    </div>
  );
}

function TierBadge({ t }: { t: number | null }) {
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: tierColor(t) }}>{t ? `T${t}` : "?"}</span>;
}

function PromoRow({ p, lines, open, onToggle }: { p: Promo; lines: Line[]; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50/50" onClick={onToggle}>
        <td className="px-4 py-2.5 font-medium text-slate-700">{p.brand}</td>
        <td className="px-4 py-2.5"><TierBadge t={p.tier} /></td>
        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmt(p.period_start)} – {fmt(p.period_end)}</td>
        <td className="px-4 py-2.5 text-slate-500">{p.channel || "—"}</td>
        <td className="px-4 py-2.5 text-slate-500">{lines.length ? `${lines.length} SKU${lines.length > 1 ? "s" : ""}` : <span className="text-slate-300">—</span>}</td>
        <td className="px-4 py-2.5 text-right text-xs text-emerald-600">{open ? "Hide" : "View"}</td>
      </tr>
      {open && (
        <tr><td colSpan={6} className="px-4 pb-3 bg-slate-50/60">
          {lines.length === 0 ? <p className="text-xs text-slate-400 py-2">No matching product lines in Promo Details.</p> : (
            <table className="w-full text-xs mt-1">
              <thead className="text-slate-400"><tr>
                <th className="text-left font-semibold py-1.5">SKU</th><th className="text-left font-semibold py-1.5">Product</th>
                <th className="text-left font-semibold py-1.5">Retailer</th><th className="text-right font-semibold py-1.5">RRP</th>
                <th className="text-right font-semibold py-1.5">Promo</th><th className="text-right font-semibold py-1.5">Disc.</th>
              </tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-slate-500 font-mono text-[11px]">{l.sku || "—"}</td>
                    <td className="py-1.5 text-slate-700 pr-3">{l.product || "—"}{l.promo_name && <span className="text-slate-300"> · {l.promo_name}</span>}</td>
                    <td className="py-1.5 text-slate-500">{l.customer || "—"}</td>
                    <td className="py-1.5 text-right text-slate-400 line-through">{money(l.rrp)}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-800">{money(l.promo_price)}</td>
                    <td className="py-1.5 text-right text-rose-500 font-medium">{pct(l.discount_rrp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </td></tr>
      )}
    </>
  );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  todo: { label: "To do", cls: "bg-slate-100 text-slate-500" },
  planned: { label: "Planned", cls: "bg-sky-100 text-sky-700" },
  live: { label: "Live", cls: "bg-emerald-100 text-emerald-700" },
  done: { label: "Done", cls: "bg-violet-100 text-violet-700" },
  skip: { label: "Skip", cls: "bg-rose-50 text-rose-400" },
};

function D2cPlan({ d2c, canEdit, brandF, tierF, statusF, onChanged }: { d2c: D2c[]; canEdit: boolean; brandF: string; tierF: string; statusF: string; onChanged: () => void }) {
  const rows = d2c.filter(r => (!brandF || r.brand === brandF) && (!tierF || String(r.tier) === tierF) && (!statusF || r.status === statusF));
  const counts = d2c.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {} as Record<string, number>);

  // Group by month (of the sale start), then by brand inside each month.
  const monthsOrder: string[] = [];
  const months = new Map<string, D2c[]>();
  for (const r of [...rows].sort((a, b) => a.period_start.localeCompare(b.period_start) || a.brand.localeCompare(b.brand))) {
    const key = r.period_start.slice(0, 7);
    if (!months.has(key)) { months.set(key, []); monthsOrder.push(key); }
    months.get(key)!.push(r);
  }
  const monthLabel = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set(monthsOrder.slice(0, 1)));
  const toggle = (k: string) => setOpenMonths(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  async function setStatus(id: number, status: string) {
    await fetch("/api/d2c", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => {});
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {["todo", "planned", "live", "done", "skip"].map(s => (
          <span key={s} className={`px-2.5 py-1 rounded-full font-semibold ${STATUS_META[s].cls}`}>{STATUS_META[s].label}: {counts[s] || 0}</span>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setOpenMonths(new Set(monthsOrder))} className="text-emerald-600 hover:underline">Expand all</button>
          <button onClick={() => setOpenMonths(new Set())} className="text-slate-400 hover:underline">Collapse all</button>
        </div>
      </div>
      <p className="text-xs text-slate-400">Promos by month — open a month to see every sale, grouped by brand. Run the same on D2C for the same dates and set each status.</p>

      {monthsOrder.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-8 text-center text-slate-300 text-sm">No D2C promos.</div>}

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
              <table className="w-full text-sm border-t border-gray-100">
                <thead className="bg-slate-50/60 text-slate-400 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Product</th><th className="text-left font-semibold px-3 py-2">Tier</th>
                    <th className="text-left font-semibold px-3 py-2">Dates</th><th className="text-right font-semibold px-3 py-2">RRP</th>
                    <th className="text-right font-semibold px-3 py-2">Promo</th><th className="text-right font-semibold px-3 py-2">Disc.</th>
                    <th className="text-left font-semibold px-3 py-2">Retailers</th><th className="text-left font-semibold px-3 py-2">D2C status</th>
                  </tr>
                </thead>
                <tbody>
                  {brandsIn.map(brand => (
                    <BrandGroup key={brand} brand={brand} rows={list.filter(r => r.brand === brand)} canEdit={canEdit} setStatus={setStatus} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BrandGroup({ brand, rows, canEdit, setStatus }: { brand: string; rows: D2c[]; canEdit: boolean; setStatus: (id: number, s: string) => void }) {
  return (
    <>
      <tr className="bg-slate-50/40"><td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{brand}</td></tr>
      {rows.map(r => (
        <tr key={r.id} className={`border-t border-gray-50 ${r.status === "skip" ? "opacity-50" : ""}`}>
          <td className="px-3 py-2 text-slate-700">{r.product || r.sku || "—"}</td>
          <td className="px-3 py-2"><TierBadge t={r.tier} /></td>
          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmt(r.period_start)} – {fmt(r.period_end)}</td>
          <td className="px-3 py-2 text-right text-slate-400 line-through">{money(r.rrp)}</td>
          <td className="px-3 py-2 text-right font-semibold text-slate-800">{money(r.promo_price)}</td>
          <td className="px-3 py-2 text-right text-rose-500 font-medium">{pct(r.discount_rrp)}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.retailers || "—"}</td>
          <td className="px-3 py-2">
            {canEdit ? (
              <select value={r.status} onChange={e => setStatus(r.id, e.target.value)}
                className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer ${STATUS_META[r.status]?.cls || ""}`}>
                {["todo", "planned", "live", "done", "skip"].map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            ) : <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_META[r.status]?.cls || ""}`}>{STATUS_META[r.status]?.label}</span>}
          </td>
        </tr>
      ))}
    </>
  );
}

function ProductTable({ lines, brandF, tierF, retailerF }: { lines: Line[]; brandF: string; tierF: string; retailerF: string }) {
  const rows = lines.filter(l =>
    (!brandF || l.brand === brandF) && (!tierF || String(l.tier) === tierF) && (!retailerF || l.customer === retailerF));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left font-semibold px-3 py-3">Brand</th><th className="text-left font-semibold px-3 py-3">SKU</th>
            <th className="text-left font-semibold px-3 py-3">Product</th><th className="text-left font-semibold px-3 py-3">Retailer</th>
            <th className="text-left font-semibold px-3 py-3">Tier</th><th className="text-left font-semibold px-3 py-3">Dates</th>
            <th className="text-right font-semibold px-3 py-3">RRP</th><th className="text-right font-semibold px-3 py-3">Promo</th>
            <th className="text-right font-semibold px-3 py-3">Disc.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(l => (
            <tr key={l.id}>
              <td className="px-3 py-2 font-medium text-slate-700">{l.brand}</td>
              <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{l.sku || "—"}</td>
              <td className="px-3 py-2 text-slate-700">{l.product || "—"}</td>
              <td className="px-3 py-2 text-slate-500">{l.customer || "—"}</td>
              <td className="px-3 py-2"><TierBadge t={l.tier} /></td>
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmt(l.start_date)} – {fmt(l.end_date)}</td>
              <td className="px-3 py-2 text-right text-slate-400 line-through">{money(l.rrp)}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">{money(l.promo_price)}</td>
              <td className="px-3 py-2 text-right text-rose-500 font-medium">{pct(l.discount_rrp)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-300">No product promos match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
