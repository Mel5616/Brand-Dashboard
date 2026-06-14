"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand } from "@/lib/db";
import type { MetaAdsRow } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];
const MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26"];
const LATEST = "2026-05";

type Metric = "spend" | "revenue" | "roas" | "purchases" | "clicks";

export function MetaAdsChart({ brands, data }: { brands: Brand[]; data: MetaAdsRow[] }) {
  const [metric, setMetric] = React.useState<Metric>("spend");

  const activeBrands = brands.filter(b => data.some(d => d.brand_id === b.id));

  if (activeBrands.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-2">Meta Ads</h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-gray-500 font-medium">No Meta Ads data yet</p>
          <p className="text-sm text-gray-400 mt-1">Run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_meta.py</code></p>
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

  const latestRows  = data.filter(d => d.month_key === LATEST);
  const totalSpend  = latestRows.reduce((s, d) => s + d.spend, 0);
  const totalRev    = latestRows.reduce((s, d) => s + d.revenue, 0);
  const totalPurch  = latestRows.reduce((s, d) => s + d.purchases, 0);
  const totalClicks = latestRows.reduce((s, d) => s + d.clicks, 0);
  const avgRoas     = totalSpend > 0 ? totalRev / totalSpend : 0;

  const kpis = [
    { label: "May Spend",     value: fmtFull(totalSpend) },
    { label: "May Revenue",   value: fmtFull(totalRev) },
    { label: "Avg ROAS",      value: avgRoas.toFixed(2) + "×" },
    { label: "Purchases",     value: totalPurch.toLocaleString() },
    { label: "Clicks",        value: totalClicks.toLocaleString() },
  ];

  const metricLabels: { id: Metric; label: string }[] = [
    { id: "spend",     label: "Spend" },
    { id: "revenue",   label: "Revenue" },
    { id: "roas",      label: "ROAS" },
    { id: "purchases", label: "Purchases" },
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
          <h2 className="font-semibold text-gray-800">Meta Ads</h2>
          <p className="text-xs text-gray-400 mt-0.5">Monthly performance across all brands</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {metricLabels.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${metric === m.id ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
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
