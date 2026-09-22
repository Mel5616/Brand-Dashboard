"use client";

import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement,
  PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandMonthly, BrandTarget } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

interface Props {
  brands: Brand[];
  monthly: BrandMonthly[];
  targets: BrandTarget[];
  monthKeys: string[];
  monthLabels: string[];
  latest: string;
  fyLabel: string;
}

export function SalesTargetTracker({ brands, monthly, targets, monthKeys, monthLabels, latest, fyLabel }: Props) {
  const liveBrands = brands.filter(b => b.live);
  const ids = new Set(liveBrands.map(b => b.id));

  const targetFor = (bid: number, mk: string) => targets.find(t => t.brand_id === bid && t.month_key === mk)?.revenue_target ?? 0;
  const salesFor  = (bid: number, mk: string) => monthly.find(m => m.brand_id === bid && m.month_key === mk)?.revenue ?? 0;

  // Expected-to-date, per brand = full target for completed months + the
  // current month pro-rated by days elapsed (so day 1 of a month isn't
  // judged against the whole month's plan). Same formula the portfolio
  // "Pace vs plan" KPI already uses, just applied per brand_id.
  const latestIdx = Math.max(0, monthKeys.indexOf(latest));
  const now = new Date();
  const curMk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFraction = latest === curMk ? Math.min(1, now.getDate() / daysInMonth) : 1;
  const priorMonths = monthKeys.slice(0, latestIdx);
  const expectedFor = (bid: number) => priorMonths.reduce((s, mk) => s + targetFor(bid, mk), 0) + targetFor(bid, latest) * monthFraction;

  // Per-brand FY totals
  const rows = liveBrands.map(b => {
    const target = monthKeys.reduce((s, mk) => s + targetFor(b.id, mk), 0);
    const actual = monthKeys.reduce((s, mk) => s + salesFor(b.id, mk), 0);
    const expected = expectedFor(b.id);
    return { brand: b, target, actual, expected, pct: target > 0 ? (actual / target) * 100 : 0, pctExpected: target > 0 ? (expected / target) * 100 : 0, paceDelta: actual - expected };
  }).filter(r => r.target > 0 || r.actual > 0)
    .sort((a, b) => b.target - a.target);

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const pct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

  // Cumulative monthly actual vs target (portfolio across shown brands)
  let cumA = 0, cumT = 0;
  const cumActual: (number | null)[] = [];
  const cumTarget: number[] = [];
  monthKeys.forEach((mk, i) => {
    const monthActual = [...ids].reduce((s, id) => s + salesFor(id, mk), 0);
    const monthTarget = [...ids].reduce((s, id) => s + targetFor(id, mk), 0);
    cumA += monthActual; cumT += monthTarget;
    cumActual.push(i <= latestIdx ? cumA : null);
    cumTarget.push(cumT);
  });

  const expectedToDate = rows.reduce((s, r) => s + r.expected, 0);
  const pctExpected = totalTarget > 0 ? (expectedToDate / totalTarget) * 100 : 0;
  const paceDelta = totalActual - expectedToDate;
  const onPace = paceDelta >= 0;
  // Marker for the chart: where the plan says we should be today.
  const expectedPoint = monthKeys.map((_, i) => (i === latestIdx ? expectedToDate : null));
  const proNote = monthFraction < 1 ? ` · plan pro-rated to day ${now.getDate()}/${daysInMonth}` : "";

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
        No sales targets set for {fyLabel}.
      </div>
    );
  }

  const single = liveBrands.length === 1;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `${fyLabel} Target`, value: fmt(totalTarget), sub: single ? liveBrands[0].name : "all brands" },
          { label: "Actual Sales", value: fmt(totalActual), sub: "ex-GST, FY to date" },
          { label: "% to Target", value: `${pct.toFixed(0)}%`, sub: `of ${fmt(totalTarget)}` },
          { label: "Pace vs plan", value: `${onPace ? "+" : ""}${fmt(paceDelta)}`, sub: (onPace ? "ahead of plan to date" : "behind plan to date") + proNote, red: !onPace },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${(k as any).red ? "text-red-500" : "text-slate-800"}`}>{k.value}</p>
            <p className="text-[11px] text-gray-400">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cumulative pacing chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Cumulative Sales vs Target</h3>
          <p className="text-xs text-gray-400 mb-4">{fyLabel} · are we tracking ahead or behind?</p>
          <div className="h-60">
            <Line
              data={{
                labels: monthLabels,
                datasets: [
                  { label: "Target (cumulative)", data: cumTarget, borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.2 },
                  { label: "Actual (cumulative)", data: cumActual, borderColor: "#2dc8a5", backgroundColor: "#2dc8a520", borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: "#2dc8a5", fill: true, tension: 0.2, spanGaps: false },
                  { label: "Plan to date", data: expectedPoint, borderColor: "#f59e0b", backgroundColor: "#f59e0b", pointRadius: 5, pointHoverRadius: 6, pointBackgroundColor: "#f59e0b", showLine: false, fill: false },
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
                  tooltip: { callbacks: { label: (ctx: any) => ctx.parsed.y == null ? "" : ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y)}` } },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } },
                  y: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
                },
              }}
            />
          </div>
        </div>

        {/* Per-brand progress */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">By Brand · % to Target</h3>
          <p className="text-xs text-gray-400 mb-4">Actual sales against {fyLabel} target{proNote ? <span className="text-gray-300"> · pacing marker shows where plan says we should be today</span> : null}</p>
          <div className="mb-3 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-800">Total D2C</span>
              <span className="text-gray-400">
                <span className="font-bold text-slate-800">{fmt(totalActual)}</span> / {fmt(totalTarget)}
                <span className={`ml-1.5 font-bold ${pct >= 100 ? "text-emerald-500" : pct >= 60 ? "text-amber-500" : "text-slate-400"}`}>{pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#10b981" : "#334155" }} />
              {totalTarget > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-slate-500/70" title="Where plan says we should be today" style={{ left: `${Math.min(pctExpected, 100)}%` }} />}
            </div>
            {totalTarget > 0 && (
              <p className={`text-[10px] font-semibold mt-1 ${onPace ? "text-emerald-500" : "text-amber-500"}`}>
                {onPace ? `${fmt(paceDelta)} ahead of pace` : `${fmt(Math.abs(paceDelta))} behind pace`}
              </p>
            )}
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {rows.map(r => {
              const onPaceRow = r.paceDelta >= 0;
              return (
                <div key={r.brand.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: r.brand.color }} />
                      {r.brand.name}
                    </span>
                    <span className="text-gray-400">
                      <span className="font-semibold text-slate-700">{fmt(r.actual)}</span> / {fmt(r.target)}
                      <span className={`ml-1.5 font-bold ${r.pct >= 100 ? "text-emerald-500" : r.pct >= 60 ? "text-amber-500" : "text-slate-400"}`}>{r.pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%`, background: r.pct >= 100 ? "#10b981" : r.brand.color }} />
                    {r.target > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-slate-500/70" title="Where plan says we should be today" style={{ left: `${Math.min(r.pctExpected, 100)}%` }} />}
                  </div>
                  {r.target > 0 && (
                    <p className={`text-[10px] mt-0.5 font-medium ${onPaceRow ? "text-emerald-500" : "text-amber-500"}`}>
                      {onPaceRow ? `${fmt(r.paceDelta)} ahead of pace` : `${fmt(Math.abs(r.paceDelta))} behind pace`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
