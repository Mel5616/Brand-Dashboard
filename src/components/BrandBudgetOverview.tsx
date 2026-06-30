"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  LineElement, PointElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { MarketingBudget, MarketingActual, GoogleAdsRow, MetaAdsRow, BrandTarget, BrandMonthly } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend, Filler);

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

  // Per-month overrides: a specific month/channel can be set to an exact figure,
  // replacing the annual ÷ 12 default for that month only.
  const [topups, setTopups] = useState<{ brand_id: number; month_key: string; channel: string; amount: number }[]>([]);
  useEffect(() => { fetch("/api/budget-topups").then(r => r.json()).then(j => setTopups(j.topups ?? [])).catch(() => {}); }, []);
  const override = (channel: string, mk: string): number | null => { const t = topups.find(t => t.brand_id === bid && t.channel === channel && t.month_key === mk); return t ? (Number(t.amount) || 0) : null; };
  // Influencer spend flows in automatically from the Influencer tracker (like Google/Meta).
  const [inflSpend, setInflSpend] = useState<{ brand_id: number; month_key: string; spend: number }[]>([]);
  useEffect(() => { fetch("/api/influencer/spend").then(r => r.json()).then(j => setInflSpend(j.rows ?? [])).catch(() => {}); }, []);
  const influencerActual = (mk: string) => inflSpend.filter(r => r.brand_id === bid && r.month_key === mk).reduce((s, r) => s + r.spend, 0);
  // The budget for a channel in a given month: the override if set, else annual ÷ 12.
  const monthBudget = (channel: string, annual: number, mk: string) => { const o = override(channel, mk); return o != null ? o : annual / 12; };

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
    if (channel === "Influencer Marketing") return influencerActual(mk) + marketingActuals.filter(a => a.brand_id === bid && a.channel === channel && a.month_key === mk).reduce((s, a) => s + a.spend, 0);
    return marketingActuals.filter(a => a.brand_id === bid && a.channel === channel && a.month_key === mk).reduce((s, a) => s + a.spend, 0);
  }

  const channels = rows.map(r => r.channel);

  // FY totals (sum of each month's budget, honouring overrides)
  const fyBudget = rows.reduce((s, r) => s + monthKeys.reduce((m, mk) => m + monthBudget(r.channel, r.annual_budget, mk), 0), 0);
  const fyActual = channels.reduce((s, ch) => s + monthKeys.reduce((m, mk) => m + actual(ch, mk), 0), 0);
  const fyPct = fyBudget > 0 ? (fyActual / fyBudget) * 100 : 0;
  const mktgPctOfSales = salesTarget > 0 ? (fyBudget / salesTarget) * 100 : null;
  const targetVsLY = lastYearSales > 0 ? ((salesTarget - lastYearSales) / lastYearSales) * 100 : null;

  // selected-month rows: monthly budget = annual / 12
  const monthRows = rows.map((r, i) => {
    const monthlyBudget = monthBudget(r.channel, r.annual_budget, month);
    const spent = actual(r.channel, month);
    return { channel: r.channel, color: colorFor(r.channel, i), budget: monthlyBudget, spent, pct: monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0 };
  }).sort((a, b) => b.budget - a.budget);
  // annual (FY) rows: full-year budget per channel (sum of monthly, honouring overrides) vs FY-to-date actual
  const fyRows = rows.map((r, i) => {
    const spent = monthKeys.reduce((s, mk) => s + actual(r.channel, mk), 0);
    const budget = monthKeys.reduce((s, mk) => s + monthBudget(r.channel, r.annual_budget, mk), 0);
    return { channel: r.channel, color: colorFor(r.channel, i), budget, spent, pct: budget > 0 ? (spent / budget) * 100 : 0 };
  }).sort((a, b) => b.budget - a.budget);

  const chanRows = chanScope === "fy" ? fyRows : monthRows;
  const chanBudgetTotal = chanRows.reduce((s, r) => s + r.budget, 0);
  const chanActualTotal = chanRows.reduce((s, r) => s + r.spent, 0);

  // monthly trend across the FY
  const monthlyBudgetLine = monthKeys.map(mk => rows.reduce((s, r) => s + monthBudget(r.channel, r.annual_budget, mk), 0));
  const monthlyActualBars = monthKeys.map(mk => channels.reduce((s, ch) => s + actual(ch, mk), 0));

  const monthIdx = monthKeys.indexOf(month);
  const monthLbl = monthLabels[monthIdx] ?? month;

  // ── Derived series for the expense visuals ──────────────────────────────────
  const annualByChannel: Record<string, number> = {};
  rows.forEach(r => { annualByChannel[r.channel] = r.annual_budget; });
  const budgetByChannelMonth = channels.map(ch => monthKeys.map(mk => monthBudget(ch, annualByChannel[ch] ?? 0, mk)));
  const actualByChannelMonth = channels.map(ch => monthKeys.map(mk => actual(ch, mk)));
  const cum = (arr: number[]) => arr.reduce((acc: number[], v, i) => { acc.push((acc[i - 1] ?? 0) + v); return acc; }, []);
  const cumBudget = cum(monthlyBudgetLine);
  const cumActual = cum(monthlyActualBars);
  const revByMonth = monthKeys.map(mk => monthlySales.filter(m => m.brand_id === bid && m.month_key === mk).reduce((s, m) => s + (m.revenue ?? 0), 0));
  const efficiency = monthKeys.map((_, i) => revByMonth[i] > 0 ? (monthlyActualBars[i] / revByMonth[i]) * 100 : null);
  const hasActual = fyActual > 0;
  const baseScales = { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } };

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
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
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

      {/* ── Visual snapshot ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1 · Budget allocation donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Budget allocation</h3>
          <p className="text-xs text-gray-400 mb-4">Share of the {fyLabel} budget by channel</p>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
              <Doughnut
                data={{ labels: fyRows.map(r => r.channel), datasets: [{ data: fyRows.map(r => r.budget), backgroundColor: fyRows.map(r => r.color), borderColor: "#fff", borderWidth: 2 }] }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${fmtFull(ctx.parsed)} (${fyBudget > 0 ? ((ctx.parsed / fyBudget) * 100).toFixed(0) : 0}%)` } } } }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-gray-400">Total</span>
                <span className="text-base font-bold text-slate-800">{fmt(fyBudget)}</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {fyRows.slice(0, 8).map(r => (
                <div key={r.channel} className="flex items-center justify-between text-xs gap-2">
                  <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} /><span className="text-gray-600 truncate">{r.channel}</span></span>
                  <span className="text-gray-400 font-medium shrink-0">{fyBudget > 0 ? ((r.budget / fyBudget) * 100).toFixed(0) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2 · Cumulative pacing (burn-up) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Cumulative pacing</h3>
          <p className="text-xs text-gray-400 mb-4">Spend to date against the budget plan — above the line is ahead of plan</p>
          <div className="h-56">
            <Line
              data={{ labels: monthLabels, datasets: [
                { label: "Budget (plan)", data: cumBudget, borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
                { label: "Actual", data: cumActual, borderColor: brand.color, backgroundColor: brand.color + "22", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 },
              ] }}
              options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` } } }, scales: baseScales as any }}
            />
          </div>
        </div>

        {/* 3 · Channel mix over time */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Monthly budget mix by channel</h3>
          <p className="text-xs text-gray-400 mb-4">How the planned spend shifts month to month</p>
          <div className="h-56">
            <Bar
              data={{ labels: monthLabels, datasets: channels.map((ch, i) => ({ label: ch, data: budgetByChannelMonth[i], backgroundColor: colorFor(ch, i), borderRadius: 2, stack: "b" })) }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { stacked: true, ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } } }}
            />
          </div>
        </div>

        {/* 4 · Budget vs actual by channel (horizontal) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Budget vs actual by channel</h3>
          <p className="text-xs text-gray-400 mb-4">{fyLabel} to date</p>
          <div className="h-56">
            <Bar
              data={{ labels: fyRows.map(r => r.channel), datasets: [
                { label: "Budget", data: fyRows.map(r => r.budget), backgroundColor: "#e2e8f0", borderRadius: 3 },
                { label: "Actual", data: fyRows.map(r => r.spent), backgroundColor: brand.color, borderRadius: 3 },
              ] }}
              options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.x ?? 0)}` } } }, scales: { x: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#6b7280" } } } }}
            />
          </div>
        </div>

        {/* 5 · Spend efficiency */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Spend efficiency</h3>
          <p className="text-xs text-gray-400 mb-4">Marketing spend as a % of sales each month (lower is more efficient)</p>
          <div className="h-56">
            {revByMonth.some(v => v > 0) ? (
              <Line
                data={{ labels: monthLabels, datasets: [{ label: "Spend % of sales", data: efficiency, borderColor: "#f97316", backgroundColor: "#f9731622", borderWidth: 2, pointRadius: 2, fill: true, tension: 0.3, spanGaps: true }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ctx.parsed.y == null ? " no sales" : ` ${ctx.parsed.y.toFixed(1)}% of sales` } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => `${v}%`, font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } } }}
              />
            ) : <div className="h-full grid place-items-center text-xs text-gray-300">No sales recorded yet for {fyLabel}</div>}
          </div>
        </div>

        {/* 6 · Variance heatmap */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-hidden">
          <h3 className="text-sm font-semibold text-slate-700">Spend vs budget heatmap</h3>
          <p className="text-xs text-gray-400 mb-3">% of each month&apos;s budget used · green under, amber near, red over</p>
          <div className="overflow-x-auto">
            <table className="text-[10px] border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr><th /> {monthLabels.map((l, i) => <th key={i} className="px-1 py-0.5 text-gray-400 font-semibold">{l.slice(0, 3)}</th>)}</tr>
              </thead>
              <tbody>
                {channels.map((ch, ci) => (
                  <tr key={ch}>
                    <td className="pr-2 text-gray-600 whitespace-nowrap max-w-[120px] truncate">{ch}</td>
                    {monthKeys.map((mk, mi) => {
                      const b = budgetByChannelMonth[ci][mi], a = actualByChannelMonth[ci][mi];
                      const pct = b > 0 ? (a / b) * 100 : (a > 0 ? 999 : -1);
                      const bg = pct < 0 ? "#f1f5f9" : pct > 100 ? "#fecaca" : pct > 80 ? "#fde68a" : a > 0 ? "#a7f3d0" : "#eef6f0";
                      const col = pct > 100 ? "#991b1b" : pct > 80 ? "#92400e" : "#475569";
                      return <td key={mi} title={`${ch} ${monthLabels[mi]}: ${fmtFull(a)} of ${fmtFull(b)}`} className="w-7 h-6 text-center rounded" style={{ background: bg, color: col }}>{pct < 0 ? "" : pct >= 999 ? "!" : `${Math.round(pct)}`}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasActual && <p className="text-[10px] text-gray-300 mt-2">Cells fill in as spend is recorded against each channel.</p>}
        </div>
      </div>
    </div>
  );
}
