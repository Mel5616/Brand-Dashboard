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
type Brand = { id: number; name: string };

const TIER_COLOR: Record<number, string> = { 1: "#0F9ED5", 2: "#4EA72E" };
const tierColor = (t: number | null) => (t && TIER_COLOR[t]) || "#94a3b8";
const d = (s: string) => new Date(s + "T00:00:00");
const fmt = (s: string | null) => s ? d(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
const money = (n: number | null) => n == null ? "—" : "$" + n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
const pct = (n: number | null) => n == null ? "—" : `-${Math.round(Math.abs(n) * 100)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const norm = (s: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function PromotionalCalendar({ canEdit, brands }: { canEdit: boolean; brands: Brand[] }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<"calendar" | "products">("calendar");
  const [brandF, setBrandF] = useState("");
  const [tierF, setTierF] = useState("");
  const [retailerF, setRetailerF] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [a, b] = await Promise.all([
      fetch("/api/promotions").then(x => x.json()).catch(() => ({ ok: false })),
      fetch("/api/promo-lines").then(x => x.json()).catch(() => ({ ok: false })),
    ]);
    setLoading(false);
    if (!a.ok && a.needsSetup) { setNeedsSetup(true); return; }
    setPromos(a.items || []);
    setLines(b.items || []);
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

  const retailers = useMemo(() => Array.from(new Set(lines.map(l => l.customer).filter(Boolean))) as string[], [lines]);
  const promoBrands = useMemo(() => Array.from(new Set(promos.map(p => p.brand))).sort(), [promos]);
  const fp = useMemo(() => promos.filter(p => (!brandF || p.brand === brandF) && (!tierF || String(p.tier) === tierF)), [promos, brandF, tierF]);

  // timeline span
  const { min, max, monthCols } = useMemo(() => {
    if (!promos.length) return { min: new Date(), max: new Date(), monthCols: [] as { label: string; left: number }[] };
    const ss = promos.map(p => +d(p.period_start)); const ee = promos.map(p => +d(p.period_end));
    const mn = new Date(Math.min(...ss)); const mx = new Date(Math.max(...ee)); mn.setDate(1); mx.setMonth(mx.getMonth() + 1, 0);
    const span = +mx - +mn; const cols: { label: string; left: number }[] = []; const cur = new Date(mn);
    while (cur <= mx) { cols.push({ label: `${MONTHS[cur.getMonth()]}`, left: (+cur - +mn) / span * 100 }); cur.setMonth(cur.getMonth() + 1); }
    return { min: mn, max: mx, monthCols: cols };
  }, [promos]);
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
          <button onClick={() => setView("calendar")} className={`px-3 py-1.5 ${view === "calendar" ? "bg-emerald-500 text-white" : "text-slate-600"}`}>Calendar</button>
          <button onClick={() => setView("products")} className={`px-3 py-1.5 ${view === "products" ? "bg-emerald-500 text-white" : "text-slate-600"}`}>By product</button>
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
        <div className="ml-auto"><Legend /></div>
      </div>

      {view === "calendar" ? (
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
        <ProductTable lines={lines} brandF={brandF} tierF={tierF} retailerF={retailerF} />
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
