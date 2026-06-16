"use client";

import { useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { MarketingBudget, MarketingActual, GoogleAdsRow, MetaAdsRow } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const CHANNEL_COLORS: Record<string, string> = {
  "Google Advertising":   "#4285F4",
  "Social Media (Meta)":  "#1877F2",
  "Klaviyo":              "#7c3aed",
  "Influencer Marketing": "#f59e0b",
  "Photography":          "#ec4899",
  "Shopify":              "#96bf48",
};
const FALLBACK = ["#6366f1","#14b8a6","#f97316","#e11d48","#8b5cf6","#0ea5e9"];

interface Props {
  brand: any;
  marketingBudgets: MarketingBudget[];
  marketingActuals: MarketingActual[];
  googleAds: GoogleAdsRow[];
  metaAds: MetaAdsRow[];
  monthKeys: string[];
  monthLabels: string[];
  fyLabel: string;
  latest: string;
}

export function BrandBudgetOverview({
  brand, marketingBudgets, marketingActuals, googleAds, metaAds,
  monthKeys, monthLabels, fyLabel, latest,
}: Props) {
  const bid = brand.id;
  const rows = marketingBudgets.filter(b => b.brand_id === bid && b.annual_budget > 0);

  // default month = latest if it's in this FY, else the last month
  const defaultMonth = monthKeys.includes(latest) ? latest : monthKeys[monthKeys.length - 1];
  const [month, setMonth] = useState<string>(defaultMonth);

  const colorFor = (ch: string, i: number) => CHANNEL_COLORS[ch] ?? FALLBACK[i % FALLBACK.length];

  // actual spend for a channel in a given month
  function actual(channel: string, mk: string): number {
    if (channel === "Google Advertising")  return googleAds.filter(r => r.brand_id === bid && r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    if (channel === "Social Media (Meta)") return metaAds.filter(r => r.brand_id === bid && r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    return marketingActuals.filter(a => a.brand_id === bid && a.channel === channel && a.month_key === mk).reduce((s, a) => s + a.spend, 0);
  }

  const channels = rows.map(r => r.channel);

  // FY totals
  const fyBudget = rows.reduce((s, r) => s + r.annual_budget, 0);
  const fyActual = channels.reduce((s, ch) => s + monthKeys.reduce((m, mk) => m + actual(ch, mk), 0), 0);
  const fyPct = fyBudget > 0 ? (fyActual / fyBudget) * 100 : 0;

  // selected-month rows: monthly budget = annual / 12
  const monthRows = rows.map((r, i) => {
    const monthlyBudget = r.annual_budget / 12;
    const spent = actual(r.channel, month);
    return { channel: r.channel, color: colorFor(r.channel, i), budget: monthlyBudget, spent, pct: monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0 };
  }).sort((a, b) => b.budget - a.budget);
  const monthBudgetTotal = monthRows.reduce((s, r) => s + r.budget, 0);
  const monthActualTotal = monthRows.reduce((s, r) => s + r.spent, 0);

  // monthly trend across the FY
  const monthlyBudgetLine = monthKeys.map(() => rows.reduce((s, r) => s + r.annual_budget / 12, 0));
  const monthlyActualBars = monthKeys.map(mk => channels.reduce((s, ch) => s + actual(ch, mk), 0));

  const monthIdx = monthKeys.indexOf(month);
  const monthLbl = monthLabels[monthIdx] ?? month;

  return (
    <div className="space-y-4">
      {/* Header + month selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full" style={{ background: brand.color }} />
          <div>
            <h2 className="font-semibold text-gray-800">{brand.name} · Budget</h2>
            <p className="text-xs text-gray-400">{fyLabel} budget vs actual spend</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Month</label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {monthKeys.map((mk, i) => <option key={mk} value={mk}>{monthLabels[i]}</option>)}
          </select>
        </div>
      </div>

      {/* FY summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `${fyLabel} Budget`, value: fmtFull(fyBudget) },
          { label: "Actual to date",    value: fmtFull(fyActual) },
          { label: "Remaining",         value: fmtFull(fyBudget - fyActual) },
          { label: "Utilisation",       value: `${fyPct.toFixed(0)}%` },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{c.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Selected-month channel table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">{monthLbl} · Budget vs Actual</h3>
            <span className="text-[11px] text-gray-400">monthly = annual ÷ 12</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Channel", "Budget", "Actual", "%"].map(h => (
                    <th key={h} className={`${h === "Channel" ? "text-left" : "text-right"} px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthRows.map(r => (
                  <tr key={r.channel} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                        <span className="text-slate-700">{r.channel}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtFull(r.budget)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700 whitespace-nowrap">{fmtFull(r.spent)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${r.pct > 100 ? "bg-red-50 text-red-500" : r.pct > 80 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>{r.pct.toFixed(0)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="px-4 pt-2 pb-3 text-xs font-semibold text-gray-500">Total</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtFull(monthBudgetTotal)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtFull(monthActualTotal)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800">{monthBudgetTotal > 0 ? `${((monthActualTotal / monthBudgetTotal) * 100).toFixed(0)}%` : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Month-by-month trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Monthly Spend vs Budget</h3>
          <p className="text-xs text-gray-400 mb-4">Actual spend (bars) against the monthly budget line</p>
          <div className="h-56">
            <Bar
              data={{
                labels: monthLabels,
                datasets: [
                  { type: "bar", label: "Actual", data: monthlyActualBars, backgroundColor: brand.color, borderRadius: 4, order: 2 },
                  { type: "line", label: "Monthly budget", data: monthlyBudgetLine, borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, order: 1 },
                ],
              } as any}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
                  tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` } },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } },
                  y: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
