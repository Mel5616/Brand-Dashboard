"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, PinterestAdsRow } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const DEFAULT_MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];
const DEFAULT_MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26","Jun 26"];

type Metric = "spend" | "revenue" | "roas" | "purchases" | "clicks";

export function PinterestAdsChart({ brands, data, monthKeys = DEFAULT_MONTH_KEYS, monthLabels = DEFAULT_MONTH_LABELS, latest, wholeYear = false }: { brands: Brand[]; data: PinterestAdsRow[]; monthKeys?: string[]; monthLabels?: string[]; latest?: string; wholeYear?: boolean }) {
  const MONTH_KEYS = monthKeys;
  const MONTH_LABELS = monthLabels;
  const LATEST = latest ?? MONTH_KEYS[MONTH_KEYS.length - 1];
  const latestLbl = wholeYear ? "FY" : (() => { const [y, m] = LATEST.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short" }); })();
  const [metric, setMetric] = React.useState<Metric>("spend");

  const activeBrands = brands.filter(b => data.some(d => d.brand_id === b.id));

  if (activeBrands.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Pinterest Ads</h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-gray-500 font-medium">No Pinterest Ads data yet</p>
          <p className="text-sm text-gray-400 mt-1">Add <code className="bg-gray-100 px-1 rounded">pinterestAccessToken</code> + <code className="bg-gray-100 px-1 rounded">pinterestAdAccountId</code> to your config, then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_pinterest.py</code></p>
        </div>
      </div>
    );
  }

  const datasets = activeBrands.map(brand => {
    const rows = data.filter(d => d.brand_id === brand.id);
    const values = MONTH_KEYS.map(mk => {
      const row = rows.find(r => r.month_key === mk);
      if (!row) return 0;
      if (metric === "roas") return row.spend > 0 ? row.revenue / row.spend : 0;
      return row[metric] ?? 0;
    });
    return { label: brand.name, data: values, backgroundColor: brand.color, stack: metric === "roas" ? undefined : "s" };
  });

  const latestRows  = wholeYear ? data : data.filter(d => d.month_key === LATEST);
  const totalSpend  = latestRows.reduce((s, d) => s + d.spend, 0);
  const totalRev    = latestRows.reduce((s, d) => s + d.revenue, 0);
  const totalPurch  = latestRows.reduce((s, d) => s + d.purchases, 0);
  const totalClicks = latestRows.reduce((s, d) => s + d.clicks, 0);
  const avgRoas     = totalSpend > 0 ? totalRev / totalSpend : 0;

  const kpis = [
    { label: `${latestLbl} Spend`, value: fmtFull(totalSpend) },
    { label: `${latestLbl} Revenue`, value: fmtFull(totalRev) },
    { label: "Avg ROAS",      value: avgRoas.toFixed(2) + "×" },
    { label: "Conversions",   value: totalPurch.toLocaleString() },
    { label: "Clicks",        value: totalClicks.toLocaleString() },
  ];

  const metricLabels: { id: Metric; label: string }[] = [
    { id: "spend",     label: "Spend" },
    { id: "revenue",   label: "Revenue" },
    { id: "roas",      label: "ROAS" },
    { id: "purchases", label: "Conversions" },
    { id: "clicks",    label: "Clicks" },
  ];

  const yFmt = (v: number) =>
    metric === "spend" || metric === "revenue" ? fmt(v) :
    metric === "roas" ? v.toFixed(1) + "×" :
    v >= 1000 ? (v / 1000).toFixed(0) + "K" : String(v);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Pinterest Ads</h2>
          <p className="text-xs text-gray-400 mt-0.5">Monthly performance across all brands</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {metricLabels.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${metric === m.id ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400">{k.label}</p>
            <p className="font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="h-56">
        <Bar
          data={{ labels: MONTH_LABELS, datasets }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: {
              callbacks: { label: ctx => ` ${ctx.dataset.label}: ${yFmt(ctx.parsed.y ?? 0)}` },
            }},
            scales: {
              x: { grid: { display: false } },
              y: { ticks: { callback: v => yFmt(v as number) }, grid: { color: "#f3f4f6" } },
            },
          }}
        />
      </div>

      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        {activeBrands.map(b => (
          <div key={b.id} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: b.color }} />
            <span className="text-gray-600">{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
