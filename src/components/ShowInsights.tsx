"use client";

import { useEffect, useState } from "react";
import { fmtFull } from "@/lib/format";

type Margin = { knownRevenue: number; knownCost: number; knownMargin: number; coveragePct: number } | null;
type Show = {
  id: string; name: string; date_start: string; date_end: string; state: string | null; location: string | null;
  revenue: number; expenses: number; staffExpense: number; staffPctOfSales: number | null; visitors: number; orders: number;
  margin: Margin; profit: number; trueProfit: number | null; marginPct: number | null; roiPct: number | null;
  costPerVisitor: number | null; costPerOrder: number | null;
  daily: { day: string; revenue: number }[];
};
type Yoy = {
  id: string; name: string; date_start: string; prevDateStart: string;
  revenue: number; prevRevenue: number; revenueDeltaPct: number | null;
  visitors: number; prevVisitors: number; visitorsDeltaPct: number | null;
  trueProfit: number | null; prevTrueProfit: number | null; trueProfitDeltaPct: number | null;
};

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

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

export function ShowInsights() {
  const [data, setData] = useState<{ shows: Show[]; yoy: Yoy[] } | null>(null);
  useEffect(() => { fetch("/api/tradeshows/insights").then(r => r.json()).then(d => { if (d.ok) setData(d); }).catch(() => {}); }, []);

  if (!data) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;
  const { shows, yoy } = data;
  if (shows.length === 0) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No past shows with sales or expenses yet.</div>;

  const ranked = [...shows].filter(s => s.marginPct != null).sort((a, b) => (b.marginPct! - a.marginPct!));
  const best = ranked.slice(0, 5);
  const worst = ranked.length > 5 ? [...ranked].reverse().slice(0, 5) : [];

  const staffFlags = shows.filter(s => s.staffPctOfSales != null && s.staffPctOfSales > 15).sort((a, b) => (b.staffPctOfSales! - a.staffPctOfSales!));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Show Insights</h1>
        <p className="text-sm text-gray-400">Cross-show analytics built on the Tradeshows figures — every dollar ex GST.</p>
      </div>

      {/* ── Year on year ── */}
      {yoy.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Year on year</h2>
          <p className="text-xs text-gray-400 mb-3">Each show vs. its previous instance</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2 pr-3">Show</th>
                  <th className="text-right font-semibold py-2 pr-3">Sales</th>
                  <th className="text-right font-semibold py-2 pr-3">Visitors</th>
                  <th className="text-right font-semibold py-2">True profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {yoy.map(y => (
                  <tr key={y.id}>
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-slate-700 whitespace-nowrap">{y.name}</p>
                      <p className="text-[11px] text-gray-400 whitespace-nowrap">{dateFmt(y.date_start)} vs {dateFmt(y.prevDateStart)}</p>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-slate-800 tabular-nums">{fmtFull(y.revenue)}</span>
                        <DeltaPill pct={y.revenueDeltaPct} />
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-slate-700 tabular-nums">{y.visitors > 0 ? y.visitors.toLocaleString() : "—"}</span>
                        <DeltaPill pct={y.visitorsDeltaPct} />
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-slate-700 tabular-nums">{y.trueProfit != null ? fmtFull(y.trueProfit) : "—"}</span>
                        <DeltaPill pct={y.trueProfitDeltaPct} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
