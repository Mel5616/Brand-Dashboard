"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, KlaviyoRow } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const DEFAULT_MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];
const DEFAULT_MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26","Jun 26"];

type Metric = "revenue" | "delivered" | "open" | "click" | "orders" | "unsub";

const metricLabels: { id: Metric; label: string }[] = [
  { id: "revenue",   label: "Email Revenue" },
  { id: "delivered", label: "Delivered" },
  { id: "orders",    label: "Orders" },
  { id: "open",      label: "Open %" },
  { id: "click",     label: "Click %" },
  { id: "unsub",     label: "Unsub %" },
];

function valueFor(row: KlaviyoRow | undefined, metric: Metric): number {
  if (!row) return 0;
  return metric === "revenue"   ? row.revenue
       : metric === "delivered" ? row.emails_sent
       : metric === "orders"    ? (row.orders ?? 0)
       : metric === "open"      ? row.open_rate
       : metric === "click"     ? row.click_rate
       : /* unsub rate */         (row.emails_sent > 0 ? ((row.unsubscribes ?? 0) / row.emails_sent) * 100 : 0);
}

export function EmailChart({ brands, data, monthly = [], monthKeys = DEFAULT_MONTH_KEYS, monthLabels = DEFAULT_MONTH_LABELS, latest, wholeYear = false }: { brands: Brand[]; data: KlaviyoRow[]; monthly?: { brand_id: number; month_key: string; revenue: number }[]; monthKeys?: string[]; monthLabels?: string[]; latest?: string; wholeYear?: boolean }) {
  const MONTH_KEYS = monthKeys;
  const MONTH_LABELS = monthLabels;
  const [metric, setMetric] = React.useState<Metric>("revenue");

  const activeBrands = brands.filter(b => data.some(d => d.brand_id === b.id && d.emails_sent > 0));

  if (activeBrands.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Email Marketing</h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">✉️</div>
          <p className="text-gray-500 font-medium">No Klaviyo data yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_klaviyo.py</code> to pull email metrics
          </p>
        </div>
      </div>
    );
  }

  // Rates are grouped (per-brand bars); volume metrics stack.
  const isRate = metric === "open" || metric === "click";
  const datasets = activeBrands.map(brand => {
    const rows = data.filter(d => d.brand_id === brand.id);
    const values = MONTH_KEYS.map(mk => valueFor(rows.find(r => r.month_key === mk), metric));
    return { label: brand.name, data: values, backgroundColor: brand.color, stack: isRate ? undefined : "s" };
  });

  // Summary KPIs — selected month, or whole-FY aggregate
  const latestKey  = latest ?? MONTH_KEYS[MONTH_KEYS.length - 1];
  const latestLbl  = wholeYear ? "FY" : (() => { const [y, m] = latestKey.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short" }); })();
  const rows       = wholeYear ? data : data.filter(d => d.month_key === latestKey);
  const delivered  = rows.reduce((s, d) => s + d.emails_sent, 0);
  const revenue    = rows.reduce((s, d) => s + d.revenue, 0);
  // Blend rates by delivered volume (open_rate is a % per brand-month).
  const blendOpen  = delivered > 0 ? rows.reduce((s, d) => s + d.open_rate  * d.emails_sent, 0) / delivered : 0;
  const blendClick = delivered > 0 ? rows.reduce((s, d) => s + d.click_rate * d.emails_sent, 0) / delivered : 0;
  // Subscribers is a point-in-time count (stamped to each month), so read the latest month, not the FY sum.
  const subscribers = data.filter(d => d.month_key === latestKey).reduce((s, d) => s + (d.list_size || 0), 0);

  const orders    = rows.reduce((s, d) => s + (d.orders ?? 0), 0);
  const aov       = orders > 0 ? revenue / orders : 0;
  const unsubs    = rows.reduce((s, d) => s + (d.unsubscribes ?? 0), 0);
  const unsubRate = delivered > 0 ? (unsubs / delivered) * 100 : 0;
  const flowRev   = rows.reduce((s, d) => s + (d.flow_revenue ?? 0), 0);
  const campRev   = rows.reduce((s, d) => s + (d.campaign_revenue ?? 0), 0);
  const flowShare = (flowRev + campRev) > 0 ? (flowRev / (flowRev + campRev)) * 100 : 0;
  // Email's share of total store revenue for the same period
  const storeRows = wholeYear ? monthly : monthly.filter(m => m.month_key === latestKey);
  const storeRev  = storeRows.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const pctOfRev  = storeRev > 0 ? (revenue / storeRev) * 100 : 0;

  const kpis = [
    { label: `${latestLbl} Email Revenue`, value: fmtFull(revenue) },
    { label: "Subscribers", value: subscribers > 0 ? subscribers.toLocaleString() : "—" },
    { label: `${latestLbl} Delivered`,     value: delivered.toLocaleString() },
    { label: "Open Rate",   value: blendOpen.toFixed(1) + "%" },
    { label: "Click Rate",  value: blendClick.toFixed(1) + "%" },
    { label: "Email Orders", value: orders.toLocaleString() },
    { label: "Avg Order Value", value: orders > 0 ? fmt(aov) : "—" },
    { label: "Unsub Rate", value: unsubRate.toFixed(2) + "%" },
    { label: "Flow Share", value: (flowRev + campRev) > 0 ? flowShare.toFixed(0) + "%" : "—" },
    { label: "% of Total Rev", value: storeRev > 0 ? pctOfRev.toFixed(1) + "%" : "—" },
  ];

  const yFmt = (v: number) =>
    metric === "revenue"   ? fmt(v) :
    metric === "delivered" ? (v >= 1000 ? (v/1000).toFixed(0)+"K" : String(v)) :
    metric === "orders"    ? (v >= 1000 ? (v/1000).toFixed(1)+"K" : String(Math.round(v))) :
    metric === "unsub"     ? v.toFixed(2) + "%" :
                             v.toFixed(0) + "%";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Email Marketing</h2>
          <p className="text-xs text-gray-400 mt-0.5">Klaviyo — monthly performance across all brands</p>
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

      {/* KPI strip */}
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
