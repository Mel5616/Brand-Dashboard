"use client";

import { useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { MarketingBudget, MarketingActual, GoogleAdsRow, MetaAdsRow, BrandTarget, BrandMonthly } from "@/lib/db";

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
  targets: BrandTarget[];
  monthlySales: BrandMonthly[];
  monthKeys: string[];
  monthLabels: string[];
  fyLabel: string;
  latest: string;
}

export function BrandBudgetOverview({
  brand, marketingBudgets, marketingActuals, googleAds, metaAds, targets, monthlySales,
  monthKeys, monthLabels, fyLabel, latest,
}: Props) {
  const bid = brand.id;
  const rows = marketingBudgets.filter(b => b.brand_id === bid && b.annual_budget > 0);

  // Sales target vs actual (revenue_target is monthly; sum across the FY = annual)
  const salesTarget = targets.filter(t => t.brand_id === bid && monthKeys.includes(t.month_key))
    .reduce((s, t) => s + (t.revenue_target ?? 0), 0);
  const actualSales = monthlySales.filter(m => m.brand_id === bid && monthKeys.includes(m.month_key))
    .reduce((s, m) => s + (m.revenue ?? 0), 0);
  const salesPct = salesTarget > 0 ? (actualSales / salesTarget) * 100 : 0;
  // last-year sales (same FY months, prior year) for the vs-LY metric
  const lastYearSales = monthlySales.filter(m => m.brand_id === bid && monthKeys.includes(m.month_key))
    .reduce((s, m) => s + ((m as any).prev_revenue ?? 0), 0);

  // default month = latest if it's in this FY, else the last month
  const defaultMonth = monthKeys.includes(latest) ? latest : monthKeys[monthKeys.length - 1];
  const [month, setMonth] = useState<string>(defaultMonth);
  const [chanScope, setChanScope] = useState<"month" | "fy">("month");

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
  const mktgPctOfSales = salesTarget > 0 ? (fyBudget / salesTarget) * 100 : null;
  const targetVsLY = lastYearSales > 0 ? ((salesTarget - lastYearSales) / lastYearSales) * 100 : null;

  // selected-month rows: monthly budget = annual / 12
  const monthRows = rows.map((r, i) => {
    const monthlyBudget = r.annual_budget / 12;
    const spent = actual(r.channel, month);
    return { channel: r.channel, color: colorFor(r.channel, i), budget: monthlyBudget, spent, pct: monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0 };
  }).sort((a, b) => b.budget - a.budget);
  // annual (FY) rows: full-year budget per channel vs FY-to-date actual
  const fyRows = rows.map((r, i) => {
    const spent = monthKeys.reduce((s, mk) => s + actual(r.channel, mk), 0);
    return { channel: r.channel, color: colorFor(r.channel, i), budget: r.annual_budget, spent, pct: r.annual_budget > 0 ? (spent / r.annual_budget) * 100 : 0 };
  }).sort((a, b) => b.budget - a.budget);

  const chanRows = chanScope === "fy" ? fyRows : monthRows;
  const chanBudgetTotal = chanRows.reduce((s, r) => s + r.budget, 0);
  const chanActualTotal = chanRows.reduce((s, r) => s + r.spent, 0);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: `${fyLabel} Budget`, value: fmtFull(fyBudget), sub: "marketing", color: "" },
          { label: "Actual to date",    value: fmtFull(fyActual), sub: `${fyPct.toFixed(0)}% used`, color: "" },
          { label: "Remaining",         value: fmtFull(fyBudget - fyActual), sub: "unspent", color: "" },
          { label: "Mktg % of Sales",   value: mktgPctOfSales != null ? `${mktgPctOfSales.toFixed(1)}%` : "—", sub: "budget ÷ sales target", color: "" },
          { label: "Sales Target",      value: fmtFull(salesTarget), sub: salesTarget > 0 ? `${salesPct.toFixed(0)}% achieved` : "no target", color: "" },
          { label: "Target vs Last Yr", value: targetVsLY != null ? `${targetVsLY >= 0 ? "▲" : "▼"} ${Math.abs(targetVsLY).toFixed(0)}%` : "—", sub: lastYearSales > 0 ? `LY ${fmtFull(lastYearSales)}` : "no LY data", color: targetVsLY == null ? "" : targetVsLY >= 0 ? "text-emerald-600" : "text-rose-500" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{c.label}</p>
            <p className={`text-xl font-bold mt-1 ${c.color || "text-slate-800"}`}>{c.value}</p>
            {c.sub && <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Sales target vs actual */}
      {salesTarget > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Sales Target — {fyLabel}</h3>
            <span className="text-xs text-gray-400">Mktg budget = {salesTarget > 0 ? `${((fyBudget / salesTarget) * 100).toFixed(1)}%` : "—"} of target</span>
          </div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-2xl font-bold text-slate-800">{fmtFull(actualSales)}</p>
              <p className="text-[11px] text-gray-400">actual sales of {fmtFull(salesTarget)} target</p>
            </div>
            <p className={`text-lg font-bold ${salesPct >= 100 ? "text-emerald-500" : salesPct >= 70 ? "text-amber-500" : "text-slate-500"}`}>{salesPct.toFixed(0)}%</p>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(salesPct, 100)}%`, background: salesPct >= 100 ? "#10b981" : salesPct >= 70 ? "#f59e0b" : brand.color }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Selected-month channel table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-700">{chanScope === "fy" ? "Full Year" : monthLbl} · by Channel</h3>
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
              {(["month", "fy"] as const).map(s => (
                <button key={s} onClick={() => setChanScope(s)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${chanScope === s ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{s === "fy" ? "Full Year" : "Monthly"}</button>
              ))}
            </div>
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
                {chanRows.map(r => (
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
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtFull(chanBudgetTotal)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtFull(chanActualTotal)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800">{chanBudgetTotal > 0 ? `${((chanActualTotal / chanBudgetTotal) * 100).toFixed(0)}%` : "—"}</td>
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
