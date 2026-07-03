"use client";

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const DEFAULT_MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];
const DEFAULT_MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26","Jun 26"];

export type GoogleAdsRow = {
  brand_id: number;
  month_key: string;
  spend: number;
  impressions: number;
  clicks: number;
  roas: number;
};

type Metric = "spend" | "revenue" | "clicks" | "impressions" | "roas";

export function GoogleAdsChart({ brands, data, monthKeys = DEFAULT_MONTH_KEYS, monthLabels = DEFAULT_MONTH_LABELS, latest, wholeYear = false }: { brands: Brand[]; data: GoogleAdsRow[]; monthKeys?: string[]; monthLabels?: string[]; latest?: string; wholeYear?: boolean }) {
  const MONTH_KEYS = monthKeys;
  const MONTH_LABELS = monthLabels;
  const [metric, setMetric] = React.useState<Metric>("spend");

  const activeBrands = brands.filter(b => data.some(d => d.brand_id === b.id));

  if (activeBrands.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Google Ads</h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 font-medium">No Google Ads data yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Run <code className="bg-gray-100 px-1 rounded">python3 scripts/setup_google_ads.py</code> to connect your accounts
          </p>
        </div>
      </div>
    );
  }

  const datasets = activeBrands.map(brand => {
    const rows = data.filter(d => d.brand_id === brand.id);
    const values = MONTH_KEYS.map(mk => {
      const row = rows.find(r => r.month_key === mk);
      if (!row) return 0;
      return metric === "revenue" ? row.roas * row.spend : row[metric] ?? 0;
    });
    return { label: brand.name, data: values, backgroundColor: brand.color, stack: metric === "roas" ? undefined : "s" };
  });

  // Summary KPIs for latest month
  const latestKey = latest ?? MONTH_KEYS[MONTH_KEYS.length - 1];
  const latestLbl = wholeYear ? "FY" : (() => { const [y, m] = latestKey.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short" }); })();
  const latestRows   = wholeYear ? data : data.filter(d => d.month_key === latestKey);
  const totalSpend   = latestRows.reduce((s, d) => s + d.spend, 0);
  const totalRevenue = latestRows.reduce((s, d) => s + d.roas * d.spend, 0);
  const totalClicks  = latestRows.reduce((s, d) => s + d.clicks, 0);
  const totalImpr    = latestRows.reduce((s, d) => s + d.impressions, 0);
  const avgRoas      = totalSpend > 0
    ? latestRows.filter(d => d.spend > 0).reduce((s, d) => s + d.roas * d.spend, 0) / totalSpend
    : 0;

  // Previous month, for month-on-month deltas (skipped in whole-FY mode).
  const latestIdx = MONTH_KEYS.indexOf(latestKey);
  const prevKey = !wholeYear && latestIdx > 0 ? MONTH_KEYS[latestIdx - 1] : null;
  const prevLbl = prevKey ? (() => { const [y, m] = prevKey.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short" }); })() : "";
  const prevRows = prevKey ? data.filter(d => d.month_key === prevKey) : [];
  const prevSpend = prevRows.reduce((s, d) => s + d.spend, 0);
  const prevRevenue = prevRows.reduce((s, d) => s + d.roas * d.spend, 0);
  const prevClicks = prevRows.reduce((s, d) => s + d.clicks, 0);
  const prevImpr = prevRows.reduce((s, d) => s + d.impressions, 0);
  const prevRoas = prevSpend > 0 ? prevRevenue / prevSpend : 0;
  const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : null;

  // Narrative helpers — best / worst performer + active brand count this period.
  const nameOf = (id: number) => brands.find(b => b.id === id)?.name ?? `Brand ${id}`;
  const rankable = latestRows.filter(d => d.spend > 50);
  const best  = [...rankable].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...rankable].filter(d => d.spend > 300).sort((a, b) => a.roas - b.roas)[0];
  const activeCount = latestRows.filter(d => d.spend > 0).length;

  const kpis: { label: string; value: string; delta: number | null; goodUp: boolean; roas?: boolean }[] = [
    { label: `${latestLbl} Spend`,   value: fmtFull(totalSpend),   delta: pct(totalSpend, prevSpend),   goodUp: false },
    { label: `${latestLbl} Revenue`, value: fmtFull(totalRevenue), delta: pct(totalRevenue, prevRevenue), goodUp: true },
    { label: "Blended ROAS",         value: avgRoas.toFixed(2) + "x", delta: pct(avgRoas, prevRoas),     goodUp: true, roas: true },
    { label: "Clicks",               value: totalClicks.toLocaleString(), delta: pct(totalClicks, prevClicks), goodUp: false },
    { label: "Impressions",          value: (totalImpr / 1000).toFixed(0) + "K", delta: pct(totalImpr, prevImpr), goodUp: false },
  ];

  const metricLabels: { id: Metric; label: string }[] = [
    { id: "spend",       label: "Spend" },
    { id: "revenue",     label: "Revenue" },
    { id: "roas",        label: "ROAS" },
    { id: "clicks",      label: "Clicks" },
    { id: "impressions", label: "Impressions" },
  ];

  const yFmt = (v: number) =>
    metric === "spend" || metric === "revenue" ? fmt(v) :
    metric === "roas" ? v.toFixed(1) + "x" :
    v >= 1000 ? (v/1000).toFixed(0)+"K" : String(v);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Google Ads</h2>
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

      {/* Plain-English read of the period */}
      <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-2.5 mb-4 text-[13px] leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-800">{wholeYear ? "This financial year" : latestLbl}:</span>{" "}
        spent {fmtFull(totalSpend)} across {activeCount} brand{activeCount === 1 ? "" : "s"} and drove {fmtFull(totalRevenue)} in tracked sales — a blended{" "}
        <span className={avgRoas >= 1 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{avgRoas.toFixed(2)}× ROAS</span>{" "}
        (every $1 of ad spend returned ${avgRoas.toFixed(2)}).
        {best && <> Strongest: <span className="font-semibold text-slate-700">{nameOf(best.brand_id)}</span> at {best.roas.toFixed(1)}×.</>}
        {worst && worst.roas < 1 && <> Watch: <span className="font-semibold text-rose-600">{nameOf(worst.brand_id)}</span> at {worst.roas.toFixed(1)}× (under break-even).</>}
      </div>

      {/* KPI strip with month-on-month movement */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[11px] text-gray-400">{k.label}</p>
            <p className={`font-bold ${k.roas ? (avgRoas >= 1 ? "text-emerald-600" : "text-rose-600") : "text-gray-900"}`}>{k.value}</p>
            {k.delta != null && (
              <p className={`text-[10px] font-semibold ${k.goodUp ? (k.delta >= 0 ? "text-emerald-500" : "text-rose-500") : "text-gray-400"}`}>
                {k.delta >= 0 ? "▲" : "▼"} {Math.abs(k.delta).toFixed(0)}% vs {prevLbl}
              </p>
            )}
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

      {/* What the chart is showing */}
      <p className="text-[11px] text-gray-400 mt-2">
        {(() => {
          const d: Record<Metric, string> = {
            spend: "how much each brand spent on Google Ads",
            revenue: "sales Google Ads is credited with driving (spend × ROAS)",
            roas: "return on ad spend — sales per $1 spent (higher is better; under 1× loses money)",
            clicks: "clicks to each brand's site",
            impressions: "how often ads were shown",
          };
          return `Each bar is a month, stacked by brand — showing ${d[metric]}. Tap a metric above to switch the view.`;
        })()}
      </p>

      {/* Brand legend */}
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

// React needs to be imported for useState
import React from "react";
