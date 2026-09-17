"use client";

import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { Chart } from "react-chartjs-2";
import { fmtFull } from "@/lib/format";
import { brandMatch } from "@/lib/channels";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

// The "true north" number: Marketing Efficiency Ratio — whole-business revenue
// (ERP channel sales) ÷ total marketing cost (Google + Meta + Pinterest live,
// uploaded expenses, influencer gifting) per month, with the implied target
// (FY revenue target ÷ FY marketing budget) as a reference line. Admin-only —
// whole-business revenue stays off team-visible surfaces.

type SpendRow = { brand_id?: number; month_key: string; spend: number };
type BrandLite = { id: number; name: string; color?: string | null; live?: boolean };

export function MerCard({ brands, channelSales, googleAds, metaAds, pinterestAds, amazonAds, marketingActuals, targets, marketingBudgets, monthKeys, monthLabels, fy, fyLabel, role, canView }: {
  brands: BrandLite[]; channelSales: any[]; googleAds: SpendRow[]; metaAds: SpendRow[]; pinterestAds: SpendRow[]; amazonAds: SpendRow[];
  marketingActuals: any[]; targets: any[]; marketingBudgets: any[];
  monthKeys: string[]; monthLabels: string[]; fy: string; fyLabel: string; role: string | null;
  // Admins always see it; a member needs it explicitly granted (whole-business
  // revenue is otherwise kept off team-visible surfaces) — see canView below.
  canView?: boolean;
}) {
  const [inflSpend, setInflSpend] = React.useState<SpendRow[]>([]);
  const [brandId, setBrandId] = React.useState<number | "all">("all");
  const allowed = role === "admin" || !!canView;
  React.useEffect(() => {
    if (!allowed) return;
    fetch("/api/influencer/spend").then(r => r.json()).then(j => setInflSpend(j.rows ?? [])).catch(() => {});
  }, [allowed]);
  if (!allowed) return null;

  const selected = brandId === "all" ? null : brands.find(b => b.id === brandId) ?? null;
  const byBrandId = <T extends { brand_id?: number }>(rows: T[]) => selected ? rows.filter(r => r.brand_id === selected.id) : rows;
  const byBrandName = (rows: any[]) => selected ? rows.filter(r => brandMatch(selected.name, r.brand)) : rows;

  const sum = (rows: any[], mk: string, key: string, val: string) =>
    rows.filter(r => r[key] === mk).reduce((s, r) => s + (Number(r[val]) || 0), 0);

  const revenue = monthKeys.map(mk => sum(byBrandName(channelSales), mk, "month_key", "value"));
  const cost = monthKeys.map(mk =>
    sum(byBrandId(googleAds), mk, "month_key", "spend") + sum(byBrandId(metaAds), mk, "month_key", "spend") +
    sum(byBrandId(pinterestAds), mk, "month_key", "spend") + sum(byBrandId(amazonAds), mk, "month_key", "spend") +
    sum(byBrandId(marketingActuals), mk, "month_key", "spend") + sum(byBrandId(inflSpend), mk, "month_key", "spend"));

  // Only months with real revenue count (channel sales upload lags the month end)
  const liveIdx = monthKeys.map((_, i) => i).filter(i => revenue[i] > 0);
  if (liveIdx.length === 0) return null;
  const mer = monthKeys.map((_, i) => (cost[i] > 0 && revenue[i] > 0 ? revenue[i] / cost[i] : null));

  const fytdRev = liveIdx.reduce((s, i) => s + revenue[i], 0);
  const fytdCost = liveIdx.reduce((s, i) => s + cost[i], 0);
  const fytdMer = fytdCost > 0 ? fytdRev / fytdCost : null;
  const lastIdx = liveIdx[liveIdx.length - 1];

  // Implied target: FY revenue target ÷ FY marketing budget. Per-brand target
  // is D2C (brand_targets has no whole-business figure), so a brand's own MER
  // vs the whole-business target line is an approximation, same as the
  // all-brands view already is.
  const targetRev = byBrandId(targets).filter((t: any) => monthKeys.includes(t.month_key)).reduce((s: number, t: any) => s + (Number(t.revenue_target) || 0), 0);
  const budget = byBrandId(marketingBudgets).filter((b: any) => (b.fy ?? "2025-26") === fy).reduce((s: number, b: any) => s + (Number(b.annual_budget) || 0), 0);
  const targetMer = budget > 0 && targetRev > 0 ? targetRev / budget : null;

  const kpis = [
    { label: `${fyLabel} MER`, value: fytdMer != null ? fytdMer.toFixed(1) + "×" : "—", sub: `${fmtFull(fytdRev)} rev ÷ ${fmtFull(fytdCost)} mktg` },
    { label: `${monthLabels[lastIdx]} MER`, value: mer[lastIdx] != null ? mer[lastIdx]!.toFixed(1) + "×" : "—", sub: `${fmtFull(revenue[lastIdx])} ÷ ${fmtFull(cost[lastIdx])}` },
    { label: "Mktg % of sales", value: fytdRev > 0 ? ((fytdCost / fytdRev) * 100).toFixed(1) + "%" : "—", sub: "FY to date" },
    { label: "Target MER", value: targetMer != null ? targetMer.toFixed(1) + "×" : "—", sub: targetMer != null ? "FY target ÷ FY budget" : "set targets + budgets" },
  ];

  const onTrack = fytdMer != null && targetMer != null ? fytdMer >= targetMer : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Marketing efficiency (MER)</h2>
          <p className="text-xs text-gray-400 mt-0.5">Every dollar of marketing → dollars of {selected ? `${selected.name} ` : "whole-business "}revenue · all channels, all costs</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={brandId} onChange={e => setBrandId(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="text-[11px] font-semibold text-slate-600 bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400">
            <option value="all">All brands</option>
            {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {onTrack != null && (
            <span className={`text-[11px] font-bold rounded-full px-3 py-1.5 whitespace-nowrap ${onTrack ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {onTrack ? "▲ Ahead of target" : "▼ Below target"}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="bg-gray-50 rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-gray-400">{k.label}</p>
            <p className="text-xl font-bold text-gray-900">{k.value}</p>
            <p className="text-[10.5px] text-gray-400 truncate" title={k.sub}>{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="h-48">
        <Chart
          type="bar"
          data={{
            labels: monthLabels,
            datasets: [
              { type: "bar" as const, label: "MER", data: mer, backgroundColor: mer.map(v => v == null ? "#e2e8f0" : targetMer != null && v < targetMer ? "#f59e0b" : "#10b981"), borderRadius: 4 },
              ...(targetMer != null ? [{ type: "line" as const, label: "Target", data: monthKeys.map(() => targetMer), borderColor: "#64748b", borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 }] : []),
            ],
          }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y == null ? "—" : c.parsed.y.toFixed(2) + "×"}` } } },
            scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v: any) => v + "×" }, grid: { color: "#f3f4f6" } } },
          }}
        />
      </div>
    </div>
  );
}
