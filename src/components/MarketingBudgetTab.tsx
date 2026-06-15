"use client";

import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { fmtFull, fmt } from "@/lib/format";
import type { MarketingBudget, MarketingActual, GoogleAdsRow, MetaAdsRow, BrandMonthly } from "@/lib/db";

ChartJS.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

const DEFAULT_MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];
const DEFAULT_MONTH_LABELS = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];

const CHANNEL_COLORS: Record<string, string> = {
  "Google Advertising":   "#4285F4",
  "Social Media (Meta)":  "#1877F2",
  "Klaviyo":              "#7c3aed",
  "Influencer Marketing": "#f59e0b",
  "Photography":          "#ec4899",
  "Shopify":              "#96bf48",
};
const FALLBACK_COLORS = ["#6366f1","#14b8a6","#f97316","#e11d48","#8b5cf6","#0ea5e9"];

interface Props {
  brands:           any[];
  marketingBudgets: MarketingBudget[];
  marketingActuals: MarketingActual[];
  googleAds:        GoogleAdsRow[];
  metaAds:          MetaAdsRow[];
  monthly:          BrandMonthly[];
  fyLabel?:         string;
  monthKeys?:       string[];
  monthLabels?:     string[];
}

function PacingBar({ pct, color }: { pct: number; color: string }) {
  const fill = pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : color;
  return (
    <div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: fill }} />
      </div>
      <p className="text-[9px] text-gray-400 mt-0.5 text-right">{pct.toFixed(0)}%</p>
    </div>
  );
}

const DONUT_OPTS: any = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  cutout: "72%",
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` ${ctx.label}: ${fmtFull(ctx.parsed)}`,
      },
    },
  },
};

export function MarketingBudgetTab({ brands, marketingBudgets, marketingActuals, googleAds, metaAds, monthly, fyLabel = "FY 2025–26", monthKeys = DEFAULT_MONTH_KEYS, monthLabels = DEFAULT_MONTH_LABELS }: Props) {
  const MONTH_KEYS = monthKeys;
  const MONTH_LABELS = monthLabels;

  function getActual(brandId: number, channel: string): number {
    if (channel === "Google Advertising")  return googleAds.filter(r => r.brand_id === brandId).reduce((s, r) => s + r.spend, 0);
    if (channel === "Social Media (Meta)") return metaAds.filter(r => r.brand_id === brandId).reduce((s, r) => s + r.spend, 0);
    return marketingActuals.filter(a => a.brand_id === brandId && a.channel === channel).reduce((s, a) => s + a.spend, 0);
  }

  // Portfolio totals
  const totalBudget = marketingBudgets.reduce((s, b) => s + b.annual_budget, 0);
  const totalActual = marketingBudgets.reduce((s, b) => s + getActual(b.brand_id, b.channel), 0);
  const totalPct    = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const remaining   = totalBudget - totalActual;

  // Channel totals
  const channels = [...new Set(marketingBudgets.map(b => b.channel))];
  const channelTotals = channels.map(ch => ({
    channel: ch,
    budget: marketingBudgets.filter(b => b.channel === ch).reduce((s, b) => s + b.annual_budget, 0),
    actual: brands.reduce((s, brand) =>
      marketingBudgets.some(b => b.brand_id === brand.id && b.channel === ch)
        ? s + getActual(brand.id, ch) : s, 0),
  })).sort((a, b) => b.budget - a.budget);

  // Per-brand summaries
  const brandSummaries = brands
    .filter(b => b.live)
    .map(brand => {
      const bRows  = marketingBudgets.filter(b => b.brand_id === brand.id);
      const budget = bRows.reduce((s, b) => s + b.annual_budget, 0);
      const actual = bRows.reduce((s, b) => s + getActual(brand.id, b.channel), 0);
      return { brand, budget, actual };
    })
    .filter(b => b.budget > 0)
    .sort((a, b) => b.budget - a.budget);

  // Monthly spend (all channels combined)
  const monthlySpend = MONTH_KEYS.map(mk => {
    const gSpend  = googleAds.filter(r => r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    const mSpend  = metaAds.filter(r => r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    const oSpend  = marketingActuals.filter(a => a.month_key === mk).reduce((s, a) => s + a.spend, 0);
    return gSpend + mSpend + oSpend;
  });

  // Monthly revenue (all brands)
  const monthlyRevenue = MONTH_KEYS.map(mk =>
    monthly.filter(m => m.month_key === mk).reduce((s, m) => s + m.revenue, 0)
  );

  // Donut data — budget by channel
  const budgetDonutData = {
    labels: channelTotals.map(c => c.channel),
    datasets: [{
      data: channelTotals.map(c => c.budget),
      backgroundColor: channelTotals.map((c, i) => CHANNEL_COLORS[c.channel] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]),
      borderWidth: 2,
      borderColor: "#fff",
    }],
  };

  // Donut data — actual spend by channel
  const actualDonutData = {
    labels: channelTotals.map(c => c.channel),
    datasets: [{
      data: channelTotals.map(c => c.actual),
      backgroundColor: channelTotals.map((c, i) => CHANNEL_COLORS[c.channel] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]),
      borderWidth: 2,
      borderColor: "#fff",
    }],
  };

  // Utilisation donut
  const utilisationDonut = {
    labels: ["Spent", remaining >= 0 ? "Remaining" : "Over budget"],
    datasets: [{
      data: remaining >= 0 ? [totalActual, remaining] : [totalBudget, Math.abs(remaining)],
      backgroundColor: remaining >= 0 ? ["#2e4057", "#e2e8f0"] : ["#ef4444", "#fca5a5"],
      borderWidth: 0,
    }],
  };

  // Line chart — monthly sales vs spend
  const lineData = {
    labels: MONTH_LABELS,
    datasets: [
      {
        label: "Sales",
        data: monthlyRevenue,
        borderColor: "#2dc8a5",
        backgroundColor: "#2dc8a520",
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#2dc8a5",
        borderWidth: 2,
        yAxisID: "yRev",
      },
      {
        label: "Marketing spend",
        data: monthlySpend,
        borderColor: "#2e4057",
        backgroundColor: "transparent",
        borderDash: [5, 4],
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#2e4057",
        borderWidth: 2,
        yAxisID: "ySpend",
      },
    ],
  };

  const lineOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
      yRev: {
        position: "left",
        ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" },
        grid: { color: "#f3f4f6" },
      },
      ySpend: {
        position: "right",
        ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" },
        grid: { display: false },
      },
    },
  };

  if (marketingBudgets.length === 0) {
    return (
      <div className="max-w-screen-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-gray-400 font-medium">Marketing budgets not yet synced</p>
        <p className="text-xs text-gray-300 mt-1.5">Run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_marketing_budget.py</code></p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total FY Budget",    value: fmtFull(totalBudget), sub: "all brands & channels" },
          { label: "Total Actual Spend", value: fmtFull(totalActual), sub: `${totalPct.toFixed(0)}% of annual budget` },
          { label: "Remaining Budget",   value: fmtFull(Math.abs(remaining)), sub: remaining < 0 ? "over budget" : "unspent", red: remaining < 0 },
          { label: "Budget Utilisation", value: `${totalPct.toFixed(1)}%`, sub: `${brandSummaries.length} brands tracked` },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-400">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${"red" in kpi && kpi.red ? "text-red-600" : "text-gray-900"}`}>{kpi.value}</p>
            <p className={`text-xs mt-0.5 ${"red" in kpi && kpi.red ? "text-red-400" : "text-gray-400"}`}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Sales vs Spend line + Utilisation donut */}
      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-0.5">Monthly sales vs marketing spend</h2>
          <p className="text-xs text-gray-400 mb-4">Sales (solid, left axis) · spend (dashed, right axis)</p>
          <div className="h-56">
            <Line data={lineData} options={lineOpts} />
          </div>
        </div>

        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-0.5">Budget vs spend</h2>
          <p className="text-xs text-gray-400 mb-4">{fyLabel} marketing budget utilisation</p>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
              <Doughnut data={utilisationDonut} options={DONUT_OPTS} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={`text-2xl font-bold ${totalPct > 100 ? "text-red-600" : "text-[#2e4057]"}`}>{totalPct.toFixed(1)}%</span>
                <span className="text-[10px] text-gray-400">of budget used</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-full bg-[#2e4057] shrink-0" />Spent</span>
                <span className="font-semibold text-slate-800">{fmtFull(totalActual)}</span>
              </div>
              {remaining < 0 ? (
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-red-500"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />Over budget</span>
                  <span className="font-semibold text-red-600">+{fmtFull(Math.abs(remaining))}</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />Remaining</span>
                  <span className="font-semibold text-slate-600">{fmtFull(remaining)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between">
                <span className="text-gray-500">Total budget</span>
                <span className="font-bold text-slate-800">{fmtFull(totalBudget)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel donuts */}
      <div className="grid grid-cols-2 gap-6">
        {[
          { title: "Marketing budget by channel", sub: `Planned ${fyLabel} budget across channels`, data: budgetDonutData, total: totalBudget, totals: channelTotals.map(c => c.budget) },
          { title: "Spend by channel",             sub: `Actual ${fyLabel} spend across channels`,  data: actualDonutData, total: totalActual, totals: channelTotals.map(c => c.actual) },
        ].map(({ title, sub, data, total, totals }) => (
          <div key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-0.5">{title}</h2>
            <p className="text-xs text-gray-400 mb-4">{sub}</p>
            <div className="flex items-center gap-6">
              <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
                <Doughnut data={data} options={DONUT_OPTS} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-gray-400">Total</span>
                  <span className="text-lg font-bold text-slate-800">{fmt(total)}</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                {channelTotals.map((c, i) => {
                  const val  = totals[i];
                  const pct  = total > 0 ? (val / total) * 100 : 0;
                  const color = CHANNEL_COLORS[c.channel] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                  return (
                    <div key={c.channel} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-gray-600 truncate">{c.channel}</span>
                      </div>
                      <span className="text-gray-400 font-medium ml-2 shrink-0">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* By-brand table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Budget by brand</h2>
          <p className="text-xs text-gray-400 mt-0.5">{fyLabel} total marketing budget vs actual spend</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Brand","Budget","Actual","Remaining","Pacing"].map((h, i) => (
                  <th key={h} className={`${i === 0 ? "text-left" : i < 4 ? "text-right" : "text-left"} px-6 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-semibold ${i === 4 ? "w-44" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brandSummaries.map(({ brand, budget, actual }) => {
                const pct  = budget > 0 ? (actual / budget) * 100 : 0;
                const rem  = budget - actual;
                return (
                  <tr key={brand.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brand.color }} />
                        <span className="font-medium text-slate-700">{brand.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-600">{fmtFull(budget)}</td>
                    <td className="px-6 py-3 text-right text-slate-600">{fmtFull(actual)}</td>
                    <td className={`px-6 py-3 text-right font-medium ${rem < 0 ? "text-red-500" : "text-slate-700"}`}>{fmtFull(rem)}</td>
                    <td className="px-6 py-3"><PacingBar pct={pct} color={brand.color} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                <td className="px-6 py-3 font-semibold text-gray-700 text-sm">Total</td>
                <td className="px-6 py-3 text-right font-bold text-slate-800">{fmtFull(totalBudget)}</td>
                <td className="px-6 py-3 text-right font-bold text-slate-800">{fmtFull(totalActual)}</td>
                <td className={`px-6 py-3 text-right font-bold ${remaining < 0 ? "text-red-600" : "text-slate-800"}`}>{fmtFull(remaining)}</td>
                <td className="px-6 py-3"><PacingBar pct={totalPct} color="#6366f1" /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* By-channel table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Budget by channel</h2>
          <p className="text-xs text-gray-400 mt-0.5">Portfolio-wide spend by marketing channel</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Channel","Budget","% of Total","Actual","Pacing"].map((h, i) => (
                  <th key={h} className={`${i === 0 ? "text-left" : i < 4 ? "text-right" : "text-left"} px-6 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-semibold ${i === 4 ? "w-44" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {channelTotals.map(({ channel, budget, actual }) => {
                const color    = CHANNEL_COLORS[channel] ?? "#94a3b8";
                const pct      = budget > 0 ? (actual / budget) * 100 : 0;
                const sharePct = totalBudget > 0 ? (budget / totalBudget) * 100 : 0;
                return (
                  <tr key={channel} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="font-medium text-slate-700">{channel}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-600">{fmtFull(budget)}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{sharePct.toFixed(1)}%</td>
                    <td className="px-6 py-3 text-right text-slate-600">{actual > 0 ? fmtFull(actual) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3"><PacingBar pct={pct} color={color} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-gray-300 pb-4">
        Google &amp; Meta actuals are live API data · Other channels synced from Google Sheet
      </p>
    </div>
  );
}
