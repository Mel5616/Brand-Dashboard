"use client";

import { useEffect, useState } from "react";
import { fmtFull } from "@/lib/format";
import { currentFY, fyMonthKeys, FY_LABEL } from "@/lib/fy";

type Margin = { knownRevenue: number; knownCost: number; knownMargin: number; coveragePct: number } | null;
type BrandRev = { brand_id: number; name: string; color: string; revenue: number };
type Product = { product: string; bucket: string; revenue: number; units: number };
type Unmatched = { product: string; bucket: string; sku: string | null; revenue: number; units: number; reason: string };
type Show = {
  id: string; name: string; date_start: string; date_end: string; state: string | null; location: string | null;
  revenue: number; expenses: number; staffExpense: number; staffPctOfSales: number | null; visitors: number; orders: number;
  margin: Margin; profit: number; trueProfit: number | null; marginPct: number | null; roiPct: number | null;
  costPerVisitor: number | null; costPerOrder: number | null;
  daily: { day: string; revenue: number }[];
  byBrand: BrandRev[]; topProducts: Product[]; unmatched: Unmatched[];
};
type MonthEntry = { monthKey: string; label: string; total: number; byBrand: BrandRev[] };
type Yoy = {
  id: string; prevId: string; name: string; date_start: string; prevDateStart: string;
  revenue: number; prevRevenue: number; revenueDeltaPct: number | null;
  visitors: number; prevVisitors: number; visitorsDeltaPct: number | null;
  trueProfit: number | null; prevTrueProfit: number | null; trueProfitDeltaPct: number | null;
  daily: { day: string; revenue: number }[]; prevDaily: { day: string; revenue: number }[];
};

// This FY's month keys as "YYYY-MM" — a show's date_start falls in the
// current FY when its "YYYY-MM" prefix is one of these.
function inCurrentFY(dateStart: string): boolean {
  const monthKey = dateStart.slice(0, 7);
  return fyMonthKeys(currentFY()).includes(monthKey);
}

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const fmtK = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`);

function DeltaPill({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[11px] text-gray-300">—</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold rounded-full px-2 py-0.5 ${up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function Sparkline({ daily }: { daily: { day: string; revenue: number }[] }) {
  const max = Math.max(1, ...daily.map(d => d.revenue));
  return (
    <div className="flex items-end gap-1 h-10">
      {daily.map(d => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${dateFmt(d.day)} · ${fmtFull(d.revenue)}`}>
          <div className="w-full rounded-t bg-emerald-400/80" style={{ height: `${Math.max(3, (d.revenue / max) * 36)}px` }} />
          <span className="text-[9px] text-gray-300 uppercase">{new Date(d.day + "T00:00:00").toLocaleDateString("en-AU", { weekday: "narrow" })}</span>
        </div>
      ))}
    </div>
  );
}

// This year's daily sales (emerald) against the previous instance's (grey),
// aligned by day-of-show (Day 1, Day 2…) rather than calendar date, since the
// same show recurs on different weekdays year to year.
function DualSparkline({ daily, prevDaily }: { daily: { day: string; revenue: number }[]; prevDaily: { day: string; revenue: number }[] }) {
  const len = Math.max(daily.length, prevDaily.length);
  const max = Math.max(1, ...daily.map(d => d.revenue), ...prevDaily.map(d => d.revenue));
  const days = Array.from({ length: len }, (_, i) => i);
  return (
    <div>
      <div className="flex items-end gap-2 h-12">
        {days.map(i => {
          const cur = daily[i]; const prev = prevDaily[i];
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center gap-0.5 h-10">
                <div className="flex-1 max-w-[10px] rounded-t bg-gray-200" style={{ height: `${prev ? Math.max(3, (prev.revenue / max) * 40) : 2}px` }} title={prev ? `Last time · ${dateFmt(prev.day)} · ${fmtFull(prev.revenue)}` : undefined} />
                <div className="flex-1 max-w-[10px] rounded-t bg-emerald-400" style={{ height: `${cur ? Math.max(3, (cur.revenue / max) * 40) : 2}px` }} title={cur ? `This time · ${dateFmt(cur.day)} · ${fmtFull(cur.revenue)}` : undefined} />
              </div>
              <span className="text-[9px] text-gray-300 uppercase">Day {i + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" />Last time</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />This time</span>
      </div>
    </div>
  );
}

// Where every dollar of sales actually went: a 100%-stacked composition bar
// (COGS / Expenses / True profit, as a share of Sales) — the "super clear"
// single glance a season/show summary needs, instead of reading five separate
// numbers and doing the subtraction in your head.
function RevenueSplitBar({ revenue, cogs, expenses, trueProfit }: { revenue: number; cogs: number | null; expenses: number; trueProfit: number | null }) {
  if (revenue <= 0) return null;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / revenue) * 100));
  const cogsPct = cogs != null ? pct(cogs) : 0;
  const expPct = pct(expenses);
  const profitPct = trueProfit != null ? Math.max(0, pct(trueProfit)) : Math.max(0, 100 - cogsPct - expPct);
  const lossPct = trueProfit != null && trueProfit < 0 ? pct(Math.abs(trueProfit)) : 0;
  return (
    <div>
      <div className="flex w-full h-5 rounded-md overflow-hidden bg-gray-50">
        {cogsPct > 0 && <div style={{ width: `${cogsPct}%` }} className="bg-amber-400" title={`COGS · ${Math.round(cogsPct)}%`} />}
        {expPct > 0 && <div style={{ width: `${expPct}%` }} className="bg-slate-300" title={`Expenses · ${Math.round(expPct)}%`} />}
        {profitPct > 0 && <div style={{ width: `${profitPct}%` }} className="bg-violet-500" title={`True profit · ${Math.round(profitPct)}%`} />}
        {lossPct > 0 && <div style={{ width: `${lossPct}%` }} className="bg-rose-500" title={`Loss · ${Math.round(lossPct)}%`} />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10.5px] text-gray-500">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />COGS {cogs != null ? <><span className="font-semibold text-slate-600">{fmtFull(cogs)}</span> ({Math.round(cogsPct)}%)</> : "n/a"}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300 inline-block" />Expenses <span className="font-semibold text-slate-600">{fmtFull(expenses)}</span> ({Math.round(expPct)}%)</span>
        <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-sm inline-block ${trueProfit != null && trueProfit < 0 ? "bg-rose-500" : "bg-violet-500"}`} />{trueProfit != null && trueProfit < 0 ? "Loss" : "True profit"} {trueProfit != null && <span className="font-semibold text-slate-600">{fmtFull(Math.abs(trueProfit))}</span>} ({Math.round(trueProfit != null && trueProfit < 0 ? lossPct : profitPct)}%)</span>
      </div>
    </div>
  );
}

// Quick "who was at this show" overview — a segmented bar by brand's share of
// the show's revenue, plus a coloured-dot legend so it reads at a glance.
function BrandSplit({ byBrand }: { byBrand: BrandRev[] }) {
  const total = byBrand.reduce((s, b) => s + b.revenue, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-gray-50">
        {byBrand.map(b => (
          <div key={b.brand_id} style={{ width: `${Math.max(1, (b.revenue / total) * 100)}%`, background: b.color }} title={`${b.name} · ${fmtFull(b.revenue)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5">
        {byBrand.slice(0, 5).map(b => (
          <span key={b.brand_id} className="inline-flex items-center gap-1 text-[10.5px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: b.color }} />{b.name} <span className="font-semibold text-slate-600">{fmtFull(b.revenue)}</span> <span className="text-gray-400">({Math.round((b.revenue / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Sales by month, stacked by brand — a continuous 12-month FY view (every
// month gets a slot even at $0) so a quiet month reads as quiet, not missing.
function MonthlyBrandChart({ months }: { months: MonthEntry[] }) {
  const max = Math.max(1, ...months.map(m => m.total));
  const legend = new Map<number, { name: string; color: string; total: number }>();
  for (const m of months) for (const b of m.byBrand) {
    const cur = legend.get(b.brand_id) ?? { name: b.name, color: b.color, total: 0 };
    cur.total += b.revenue;
    legend.set(b.brand_id, cur);
  }
  const brands = [...legend.values()].sort((a, b) => b.total - a.total);
  if (brands.length === 0) return <p className="text-sm text-gray-400 text-center py-6">No tradeshow sales yet this FY.</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-5">
        {brands.map(b => (
          <span key={b.name} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: b.color }} />{b.name} <span className="font-semibold text-slate-600">{fmtK(b.total)}</span>
          </span>
        ))}
      </div>
      <div className="flex items-end gap-2 sm:gap-3 h-48">
        {months.map(m => (
          <div key={m.monthKey} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            {m.total > 0 && <span className="text-[10px] font-semibold text-slate-500 mb-1 tabular-nums">{fmtK(m.total)}</span>}
            <div className="w-full flex flex-col-reverse rounded-t overflow-hidden bg-gray-50" style={{ height: `${Math.max(2, (m.total / max) * 168)}px` }}>
              {m.byBrand.map(b => (
                <div key={b.brand_id} style={{ height: `${(b.revenue / (m.total || 1)) * 100}%`, background: b.color }}
                  title={`${b.name} · ${m.label} · ${fmtFull(b.revenue)}`} />
              ))}
            </div>
            <span className="text-[10px] text-gray-400 uppercase mt-1.5">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value, color = "text-slate-800" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function ShowResultCard({ s }: { s: Show }) {
  const cogs = s.margin?.knownCost ?? null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col">
      <div className="mb-3">
        <p className="text-sm font-bold text-slate-800">{s.name}</p>
        <p className="text-[11px] text-gray-400">{dateFmt(s.date_start)}{s.location ? ` · ${s.location}` : ""}</p>
      </div>
      {s.marginPct != null && (
        <span className={`self-start text-[10px] font-bold rounded-full px-2 py-0.5 mb-3 ${s.marginPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>{s.marginPct}% true margin</span>
      )}
      {s.byBrand.length > 0 && <div className="mb-3"><BrandSplit byBrand={s.byBrand} /></div>}
      <div className="grid grid-cols-2 gap-y-2.5 gap-x-2 mb-3">
        <StatTile label="Sales" value={fmtFull(s.revenue)} />
        <StatTile label="Expenses" value={fmtFull(s.expenses)} color="text-slate-600" />
        <StatTile label="True profit" value={s.trueProfit != null ? `${s.trueProfit < 0 ? "-" : ""}${fmtFull(Math.abs(s.trueProfit))}` : "n/a"} color={s.trueProfit == null ? "text-gray-300" : s.trueProfit >= 0 ? "text-violet-700" : "text-rose-500"} />
        <StatTile label="Visitors" value={s.visitors > 0 ? s.visitors.toLocaleString() : "n/a"} color="text-sky-700" />
      </div>
      <div className="mt-auto">
        <RevenueSplitBar revenue={s.revenue} cogs={cogs} expenses={s.expenses} trueProfit={s.trueProfit} />
        {s.margin && s.margin.coveragePct < 100 && (
          <p className="text-[10px] text-gray-400 mt-2">COGS matched on {s.margin.coveragePct}% of sales.</p>
        )}
        {s.topProducts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Top products</p>
            <div className="space-y-1">
              {s.topProducts.slice(0, 3).map(p => (
                <div key={`${p.bucket}-${p.product}`} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-slate-600 truncate">{p.product}</span>
                  <span className="font-semibold text-slate-700 tabular-nums shrink-0">{fmtFull(p.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ShowInsights() {
  const [data, setData] = useState<{ shows: Show[]; yoy: Yoy[]; topProductsSeason: Product[]; unmatchedSeason: Unmatched[]; salesByMonth: MonthEntry[] } | null>(null);
  useEffect(() => { fetch("/api/tradeshows/insights").then(r => r.json()).then(d => { if (d.ok) setData(d); }).catch(() => {}); }, []);

  if (!data) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;
  const allShows = data.shows;
  const yoy = data.yoy;
  const topProductsSeason = data.topProductsSeason ?? [];
  const unmatchedSeason = data.unmatchedSeason ?? [];
  const salesByMonth = data.salesByMonth ?? [];
  // Everything on this tab is scoped to the current FY — last year's shows
  // stay on the record via Year on Year's "vs previous instance" comparison,
  // but the headline numbers here are always what's happening right now.
  const shows = allShows.filter(s => inCurrentFY(s.date_start));
  const fyLabel = FY_LABEL[currentFY()];
  if (allShows.length === 0) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No past shows with sales or expenses yet.</div>;
  if (shows.length === 0) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No shows in {fyLabel} yet.</div>;

  const ranked = [...shows].filter(s => s.marginPct != null).sort((a, b) => (b.marginPct! - a.marginPct!));
  const best = ranked.slice(0, 5);
  const worst = ranked.length > 5 ? [...ranked].reverse().slice(0, 5) : [];

  const staffFlags = shows.filter(s => s.staffPctOfSales != null && s.staffPctOfSales > 15).sort((a, b) => (b.staffPctOfSales! - a.staffPctOfSales!));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Show Insights</h1>
        <p className="text-sm text-gray-400">Cross-show analytics built on the Tradeshows figures — {fyLabel}, every dollar ex GST.</p>
      </div>

      {/* ── Season results: totals + every past show, laid out clearly ── */}
      {(() => {
        const totals = shows.reduce((a, s) => {
          a.rev += s.revenue; a.exp += s.expenses; a.vis += s.visitors;
          if (s.margin) { a.knownRev += s.margin.knownRevenue; a.cogs += s.margin.knownCost; a.hasMargin = true; }
          return a;
        }, { rev: 0, exp: 0, vis: 0, cogs: 0, knownRev: 0, hasMargin: false });
        const profit = totals.rev - totals.exp;
        const trueProfit = totals.hasMargin ? (totals.knownRev - totals.cogs) - totals.exp : null;
        const coveragePct = totals.rev > 0 ? Math.round((totals.knownRev / totals.rev) * 100) : 0;
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Season results · {shows.length} show{shows.length === 1 ? "" : "s"} · {fyLabel}</h2>
              <p className="text-[10px] text-gray-300">All figures ex GST</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
              <StatTile label="Sales" value={fmtFull(totals.rev)} />
              <StatTile label="Expenses" value={fmtFull(totals.exp)} color="text-slate-600" />
              <StatTile label={`Cost of goods${totals.hasMargin ? ` (${coveragePct}% matched)` : ""}`} value={totals.hasMargin ? fmtFull(totals.cogs) : "n/a"} color="text-amber-600" />
              <StatTile label="Profit (ex COGS)" value={`${profit < 0 ? "-" : ""}${fmtFull(Math.abs(profit))}`} color={profit >= 0 ? "text-emerald-600" : "text-rose-500"} />
              <StatTile label="True profit" value={trueProfit != null ? `${trueProfit < 0 ? "-" : ""}${fmtFull(Math.abs(trueProfit))}` : "n/a"} color={trueProfit == null ? "text-gray-300" : trueProfit >= 0 ? "text-violet-700" : "text-rose-500"} />
              <StatTile label="Visitors" value={totals.vis > 0 ? `${totals.vis.toLocaleString()}${totals.rev > 0 ? ` · $${Math.round(totals.rev / totals.vis)}/visitor` : ""}` : "n/a"} color="text-sky-700" />
            </div>
            <RevenueSplitBar revenue={totals.rev} cogs={totals.hasMargin ? totals.cogs : null} expenses={totals.exp} trueProfit={trueProfit} />
          </div>
        );
      })()}

      {/* ── Sales by month, by brand ── */}
      {salesByMonth.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Sales by month · {fyLabel}</h2>
          <p className="text-xs text-gray-400 mb-1">Tradeshow revenue every month, split by brand</p>
          <MonthlyBrandChart months={salesByMonth} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...shows].sort((a, b) => b.date_start.localeCompare(a.date_start)).map(s => <ShowResultCard key={s.id} s={s} />)}
      </div>

      {/* ── Top products this season ── */}
      {topProductsSeason.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Top products · {fyLabel}</h2>
          <p className="text-xs text-gray-400 mb-4">Revenue by product across every {fyLabel} show</p>
          <div className="space-y-2.5">
            {(() => {
              const max = Math.max(1, ...topProductsSeason.map(p => p.revenue));
              return topProductsSeason.map((p, i) => (
                <div key={p.product} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                  <span className="text-sm text-slate-700 w-48 shrink-0 truncate">{p.product}</span>
                  <div className="flex-1 h-3 rounded bg-gray-50 overflow-hidden">
                    <div className="h-full rounded bg-violet-400" style={{ width: `${Math.max(2, (p.revenue / max) * 100)}%` }} />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 tabular-nums w-24 text-right shrink-0">{fmtFull(p.revenue)}</span>
                  <span className="text-[11px] text-gray-400 w-20 text-right shrink-0">{p.units.toLocaleString()} units</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Products not mapping to the Cost Sheet ── */}
      {unmatchedSeason.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 mb-1">Not mapping to Cost Sheet · {fyLabel}</h2>
          <p className="text-xs text-gray-400 mb-4">Every product line that couldn't be matched to a Cost Sheet cost — fix these to lift COGS coverage. Ranked by revenue, biggest gaps first.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2 pr-3">Product</th>
                  <th className="text-left font-semibold py-2 pr-3">Brand</th>
                  <th className="text-left font-semibold py-2 pr-3">SKU</th>
                  <th className="text-left font-semibold py-2 pr-3">Why it's not matching</th>
                  <th className="text-right font-semibold py-2">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {unmatchedSeason.map(u => (
                  <tr key={`${u.bucket}-${u.product}-${u.sku ?? ""}`}>
                    <td className="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">{u.product}</td>
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{u.bucket}</td>
                    <td className="py-2 pr-3 font-mono text-[12px] text-slate-500 whitespace-nowrap">{u.sku ?? "—"}</td>
                    <td className="py-2 pr-3 text-amber-700 text-[12px]">{u.reason}</td>
                    <td className="py-2 text-right font-semibold text-slate-700 tabular-nums whitespace-nowrap">{fmtFull(u.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Year on year ── */}
      {(() => {
        const yoyFY = yoy.filter(y => inCurrentFY(y.date_start));
        if (yoyFY.length === 0) return null;
        return (
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Year on year</h2>
              <p className="text-[10px] text-gray-300">This FY only · each show vs. its previous instance</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              {yoyFY.map(y => (
                <div key={y.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-sm font-bold text-slate-800">{y.name}</p>
                  <p className="text-[11px] text-gray-400 mb-3">{dateFmt(y.date_start)} <span className="text-gray-300">vs</span> {dateFmt(y.prevDateStart)}</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Sales</p>
                      <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtFull(y.revenue)}</p>
                      <DeltaPill pct={y.revenueDeltaPct} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Visitors</p>
                      <p className="text-sm font-bold text-slate-700 tabular-nums">{y.visitors > 0 ? y.visitors.toLocaleString() : "—"}</p>
                      <DeltaPill pct={y.visitorsDeltaPct} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">True profit</p>
                      <p className="text-sm font-bold text-slate-700 tabular-nums">{y.trueProfit != null ? fmtFull(y.trueProfit) : "—"}</p>
                      <DeltaPill pct={y.trueProfitDeltaPct} />
                    </div>
                  </div>
                  <DualSparkline daily={y.daily} prevDaily={y.prevDaily} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Best / worst leaderboard ── */}
      {ranked.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-3">Best performing shows</h2>
            <p className="text-xs text-gray-400 mb-3 -mt-2">By true margin (true profit ÷ sales)</p>
            <div className="space-y-2">
              {best.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-gray-300 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{dateFmt(s.date_start)}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 tabular-nums shrink-0">{s.marginPct}%</span>
                </div>
              ))}
            </div>
          </div>
          {worst.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500 mb-3">Worst performing shows</h2>
              <p className="text-xs text-gray-400 mb-3 -mt-2">By true margin (true profit ÷ sales)</p>
              <div className="space-y-2">
                {worst.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-gray-300 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{s.name}</p>
                      <p className="text-[11px] text-gray-400">{dateFmt(s.date_start)}</p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${s.marginPct! >= 0 ? "text-amber-600" : "text-rose-500"}`}>{s.marginPct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Cost efficiency + staff cost flag ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Cost efficiency</h2>
        <p className="text-xs text-gray-400 mb-3">What it costs to run each show, relative to who shows up and who buys</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="text-left font-semibold py-2 pr-3">Show</th>
                <th className="text-right font-semibold py-2 pr-3">Expenses</th>
                <th className="text-right font-semibold py-2 pr-3">$/visitor</th>
                <th className="text-right font-semibold py-2 pr-3">$/order</th>
                <th className="text-right font-semibold py-2">Staff % of sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shows.filter(s => s.expenses > 0).map(s => (
                <tr key={s.id}>
                  <td className="py-2 pr-3"><p className="font-semibold text-slate-700 whitespace-nowrap">{s.name}</p><p className="text-[11px] text-gray-400 whitespace-nowrap">{dateFmt(s.date_start)}</p></td>
                  <td className="py-2 pr-3 text-right text-slate-600 tabular-nums">{fmtFull(s.expenses)}</td>
                  <td className="py-2 pr-3 text-right text-slate-600 tabular-nums">{s.costPerVisitor != null ? `$${s.costPerVisitor}` : "—"}</td>
                  <td className="py-2 pr-3 text-right text-slate-600 tabular-nums">{s.costPerOrder != null ? `$${s.costPerOrder}` : "—"}</td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${s.staffPctOfSales != null && s.staffPctOfSales > 15 ? "text-amber-600" : "text-slate-600"}`}>{s.staffPctOfSales != null ? `${s.staffPctOfSales}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {staffFlags.length > 0 && (
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
            Staff cost is over 15% of sales for {staffFlags.map(s => s.name).join(", ")} — worth checking rostering against foot traffic for these shows.
          </p>
        )}
      </div>

      {/* ── Sales trajectory ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Sales trajectory</h2>
        <p className="text-xs text-gray-400 mb-4">Daily sales through each show — spot whether it builds through the weekend or fades</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shows.filter(s => s.daily.some(d => d.revenue > 0)).slice(0, 12).map(s => (
            <div key={s.id} className="border border-gray-100 rounded-lg p-3">
              <p className="text-[12px] font-semibold text-slate-700 truncate">{s.name}</p>
              <p className="text-[10px] text-gray-400 mb-2">{dateFmt(s.date_start)}</p>
              <Sparkline daily={s.daily} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
