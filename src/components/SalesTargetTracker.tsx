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

  // Per-brand FY totals
  const rows = liveBrands.map(b => {
    const target = monthKeys.reduce((s, mk) => s + targetFor(b.id, mk), 0);
    const actual = monthKeys.reduce((s, mk) => s + salesFor(b.id, mk), 0);
    return { brand: b, target, actual, pct: target > 0 ? (actual / target) * 100 : 0 };
  }).filter(r => r.target > 0 || r.actual > 0)
    .sort((a, b) => b.target - a.target);

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const pct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

  // Cumulative monthly actual vs target (portfolio across shown brands)
  const latestIdx = Math.max(0, monthKeys.indexOf(latest));
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

  // Expected-to-date = cumulative target through the latest month → are we on pace?
  const expectedToDate = cumTarget[latestIdx] ?? 0;
  const paceDelta = totalActual - expectedToDate;
  const onPace = paceDelta >= 0;

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
          { label: "Pace vs plan", value: `${onPace ? "+" : ""}${fmt(paceDelta)}`, sub: onPace ? "ahead of target" : "behind target", red: !onPace },
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
          <p className="text-xs text-gray-400 mb-4">Actual sales against {fyLabel} target</p>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {rows.map(r => (
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
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%`, background: r.pct >= 100 ? "#10b981" : r.brand.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
