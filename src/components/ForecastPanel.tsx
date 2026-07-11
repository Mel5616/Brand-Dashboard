"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import { forecastFY } from "@/lib/forecast";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type Monthly = { brand_id: number; month_key: string; revenue: number };
type Target = { brand_id: number; month_key: string; revenue_target?: number };
type Brand = { id: number; name: string };

export function ForecastPanel({ brands, monthly, targets }: { brands: Brand[]; monthly: Monthly[]; targets: Target[] }) {
  const [scope, setScope] = React.useState<"all" | number>("all");

  const f = React.useMemo(() => {
    const rows = scope === "all" ? monthly : monthly.filter(m => m.brand_id === scope);
    const series: Record<string, number> = {};
    for (const m of rows) series[m.month_key] = (series[m.month_key] || 0) + (Number(m.revenue) || 0);

    const tRows = scope === "all" ? targets : targets.filter(t => t.brand_id === scope);
    const tMap: Record<string, number> = {};
    let anyTarget = false;
    for (const t of tRows) { const v = Number(t.revenue_target) || 0; if (v) anyTarget = true; tMap[t.month_key] = (tMap[t.month_key] || 0) + v; }
    return forecastFY(series, anyTarget ? tMap : null);
  }, [scope, monthly, targets]);

  const accent = "#0e7490", forecastCol = "#38bdf8", targetCol = "#94a3b8", ghost = "#e2e8f0";
  const data = {
    labels: f.labels,
    datasets: [
      { label: "Forecast", data: f.cumForecast, borderColor: forecastCol, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.25, fill: false },
      { label: "Actual", data: f.cumActual, borderColor: accent, borderWidth: 2.5, pointRadius: 2, tension: 0.25,
        fill: { target: "origin", above: "rgba(14,116,144,0.06)" } },
      ...(f.cumTarget ? [{ label: "Target", data: f.cumTarget, borderColor: targetCol, borderDash: [2, 3], borderWidth: 1.5, pointRadius: 0, tension: 0 }] : []),
      { label: "Last FY", data: f.cumLastFY, borderColor: ghost, borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
    ],
  };

  const growthPct = ((f.growth - 1) * 100);
  const kpis = [
    { label: "D2C forecast", value: fmtFull(f.full), sub: `${fmt(f.low)} – ${fmt(f.high)} range`, big: true },
    ...(f.pacePct !== null ? [{ label: "vs target", value: `${f.pacePct.toFixed(0)}%`, sub: f.target ? `of ${fmt(f.target)}` : "", good: f.pacePct >= 100 }] : []),
    { label: "Banked so far", value: fmtFull(f.bankedToDate), sub: `${Math.round(f.elapsedFraction * 100)}% of year elapsed` },
    { label: "Applied growth", value: `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(0)}%`, sub: "vs last FY, so far" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">D2C full-year forecast <span className="font-normal text-gray-400 normal-case tracking-normal">· own-store revenue, seasonal</span></p>
          <p className="text-[11px] text-gray-400 mt-0.5">Website &amp; own-store (D2C) revenue only — excludes Amazon, wholesale and Baby Bunting. Last year&apos;s monthly shape, scaled by this year&apos;s pace.</p>
        </div>
        <select value={scope === "all" ? "all" : String(scope)} onChange={e => setScope(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
          <option value="all">All brands</option>
          {brands.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-gray-50/70 rounded-xl px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">{k.label}</p>
            <p className={`font-bold leading-none mt-1 ${k.big ? "text-2xl" : "text-lg"} ${k.good === true ? "text-emerald-600" : k.good === false ? "text-amber-600" : "text-slate-800"}`}>{k.value}</p>
            {k.sub && <p className="text-[10px] text-gray-400 mt-1">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="h-64">
        <Line data={data} options={{
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 }, color: "#64748b" } },
            tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y == null ? "—" : fmtFull(c.parsed.y)}` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 11 } } },
            y: { grid: { color: "#f3f4f6" }, ticks: { callback: (v: any) => fmt(v as number), color: "#94a3b8", font: { size: 11 } } },
          },
        }} />
      </div>

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        {!f.hasLastFY
          ? "Not enough history for a seasonal forecast yet — showing a simple run-rate."
          : <>Cumulative revenue: <strong className="text-slate-500">solid</strong> is banked, <strong className="text-sky-500">dashed</strong> is the forecast, grey is last FY.
            Early in the year the range is wide and leans on last year; it narrows and trusts this year&apos;s pace as each month closes. Not a machine-learning model — a seasonal run-rate, which is what one year of history honestly supports.</>}
      </p>
    </div>
  );
}
