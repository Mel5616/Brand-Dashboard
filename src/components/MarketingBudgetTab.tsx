"use client";

import { useState, useEffect } from "react";
import { BrandBudgetOverview } from "./BrandBudgetOverview";
import { BudgetDataTools } from "./BudgetDataTools";
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Doughnut, Line, Bar } from "react-chartjs-2";
import { fmtFull, fmt } from "@/lib/format";
import type { MarketingBudget, MarketingActual, GoogleAdsRow, MetaAdsRow, BrandMonthly } from "@/lib/db";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

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
  targets?:         any[];
  fyLabel?:         string;
  fy?:              string;
  canEdit?:         boolean;
  monthKeys?:       string[];
  monthLabels?:     string[];
  latest?:          string;
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

export function MarketingBudgetTab({ brands, marketingBudgets: allBudgets, marketingActuals, googleAds, metaAds, monthly, targets = [], fyLabel = "FY 2025–26", fy = "2025-26", canEdit = false, monthKeys = DEFAULT_MONTH_KEYS, monthLabels = DEFAULT_MONTH_LABELS, latest = DEFAULT_MONTH_KEYS[DEFAULT_MONTH_KEYS.length - 1] }: Props) {
  // Only the selected financial year's budgets (older rows default to FY 2025-26).
  const marketingBudgets = allBudgets.filter((b: any) => (b.fy ?? "2025-26") === fy);
  const MONTH_KEYS = monthKeys;
  const MONTH_LABELS = monthLabels;
  const [budgetMsg] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  // Monthly budget values (budget_topups) — make budgets monthly-aware everywhere.
  const [topups, setTopups] = useState<any[]>([]);
  useEffect(() => { fetch("/api/budget-topups").then(r => r.json()).then(j => setTopups(j.topups ?? [])).catch(() => {}); }, []);
  const topupVal = (bid: number, ch: string, mk: string) => { const t = topups.find(t => t.brand_id === bid && t.channel === ch && t.month_key === mk); return t ? Number(t.amount) || 0 : null; };
  const monthBudgetVal = (bid: number, ch: string, mk: string, annual: number) => { const o = topupVal(bid, ch, mk); return o != null ? o : annual / 12; };
  // FY budget for a brand × channel = sum of the 12 monthly values (equals annual when no monthly overrides).
  const fyBudgetFor = (bid: number, ch: string, annual: number) => MONTH_KEYS.reduce((s, mk) => s + monthBudgetVal(bid, ch, mk, annual), 0);

  async function saveOneBudget(brand_id: number, channel: string, value: string) {
    await fetch("/api/marketing-budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id, channel, budget: value, fy }) }).catch(() => {});
    setTimeout(() => window.location.reload(), 600);
  }

  const [budgetBrand, setBudgetBrand] = useState<number | "all">("all");
  const budgetBrandList = brands.filter((b: any) => marketingBudgets.some(mb => mb.brand_id === b.id));

  function getActual(brandId: number, channel: string): number {
    if (channel === "Google Advertising")  return googleAds.filter(r => r.brand_id === brandId).reduce((s, r) => s + r.spend, 0);
    if (channel === "Social Media (Meta)") return metaAds.filter(r => r.brand_id === brandId).reduce((s, r) => s + r.spend, 0);
    return marketingActuals.filter(a => a.brand_id === brandId && a.channel === channel).reduce((s, a) => s + a.spend, 0);
  }

  // Portfolio totals
  const totalBudget = marketingBudgets.reduce((s, b) => s + fyBudgetFor(b.brand_id, b.channel, b.annual_budget), 0);
  const totalActual = marketingBudgets.reduce((s, b) => s + getActual(b.brand_id, b.channel), 0);
  const totalPct    = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const remaining   = totalBudget - totalActual;

  // Channel totals
  const channels = [...new Set(marketingBudgets.map(b => b.channel))];
  const channelTotals = channels.map(ch => ({
    channel: ch,
    budget: marketingBudgets.filter(b => b.channel === ch).reduce((s, b) => s + fyBudgetFor(b.brand_id, b.channel, b.annual_budget), 0),
    actual: brands.reduce((s, brand) =>
      marketingBudgets.some(b => b.brand_id === brand.id && b.channel === ch)
        ? s + getActual(brand.id, ch) : s, 0),
  })).sort((a, b) => b.budget - a.budget);

  // Per-brand summaries
  const brandSummaries = brands
    .filter(b => marketingBudgets.some(mb => mb.brand_id === b.id))
    .map(brand => {
      const bRows  = marketingBudgets.filter(b => b.brand_id === brand.id);
      const budget = bRows.reduce((s, b) => s + fyBudgetFor(b.brand_id, b.channel, b.annual_budget), 0);
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

  // ── Portfolio visual series ─────────────────────────────────────────────────
  const chanColor = (ch: string, i: number) => CHANNEL_COLORS[ch] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
  const monthlyBudgetTotals = MONTH_KEYS.map(mk => marketingBudgets.reduce((s, b) => s + monthBudgetVal(b.brand_id, b.channel, mk, b.annual_budget), 0));
  const cumSeries = (arr: number[]) => arr.reduce((acc: number[], v, i) => { acc.push((acc[i - 1] ?? 0) + v); return acc; }, []);
  const cumBudget = cumSeries(monthlyBudgetTotals);
  const cumSpend = cumSeries(monthlySpend);
  // monthly budget per channel (for the stacked mix)
  const budgetByChannelMonth = channels.map(ch => MONTH_KEYS.map(mk => marketingBudgets.filter(b => b.channel === ch).reduce((s, b) => s + monthBudgetVal(b.brand_id, ch, mk, b.annual_budget), 0)));
  const baseScales: any = { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } };

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

  const selectedBudgetBrand = budgetBrand !== "all" ? brands.find((b: any) => b.id === budgetBrand) : null;

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

      {/* Brand selector — drill into a single brand's budget */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedBudgetBrand && (
          <button onClick={() => setBudgetBrand("all")} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mr-1">← All brands</button>
        )}
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{selectedBudgetBrand ? "Brand" : "View"}</label>
        <select
          value={budgetBrand === "all" ? "all" : String(budgetBrand)}
          onChange={e => setBudgetBrand(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
        >
          <option value="all">All Brands (portfolio)</option>
          {budgetBrandList.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            {budgetMsg && <span className={`text-[11px] ${budgetMsg.startsWith("✓") ? "text-emerald-600" : "text-rose-500"}`}>{budgetMsg}</span>}
            <button onClick={() => setShowEdit(s => !s)} className="text-xs font-medium text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5">{showEdit ? "Close edit" : "Quick edit (annual)"}</button>
          </div>
        )}
      </div>

      {canEdit && showEdit && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Edit budgets · {fyLabel}</p>
          <p className="text-[11px] text-gray-400 mb-3">Annual budget per brand × channel. Edit a value and click away to save (the page reloads). Use the CSV upload to add new rows.</p>
          {marketingBudgets.length === 0 ? (
            <p className="text-sm text-gray-400">No budget rows for {fyLabel} yet — upload a CSV to seed them.</p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide sticky top-0">
                  <tr><th className="text-left font-semibold px-3 py-2">Brand</th><th className="text-left font-semibold px-3 py-2">Channel</th><th className="text-right font-semibold px-3 py-2">Annual budget $</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...marketingBudgets].sort((a: any, c: any) => (brands.find((b: any) => b.id === a.brand_id)?.name || "").localeCompare(brands.find((b: any) => b.id === c.brand_id)?.name || "")).map((r: any) => {
                    const key = `${r.brand_id}|${r.channel}`;
                    return (
                      <tr key={key}>
                        <td className="px-3 py-1.5 font-medium text-slate-700">{brands.find((b: any) => b.id === r.brand_id)?.name ?? `#${r.brand_id}`}</td>
                        <td className="px-3 py-1.5 text-slate-600">{r.channel}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input defaultValue={r.annual_budget} inputMode="numeric"
                            onChange={e => setEditVals(p => ({ ...p, [key]: e.target.value }))}
                            onBlur={() => { if (editVals[key] !== undefined && Number(editVals[key]) !== Number(r.annual_budget)) saveOneBudget(r.brand_id, r.channel, editVals[key]); }}
                            className="w-28 text-right text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedBudgetBrand ? (
        <BrandBudgetOverview
          brand={selectedBudgetBrand}
          marketingBudgets={marketingBudgets}
          marketingActuals={marketingActuals}
          googleAds={googleAds}
          metaAds={metaAds}
          targets={targets}
          monthlySales={monthly}
          monthKeys={MONTH_KEYS}
          monthLabels={MONTH_LABELS}
          fyLabel={fyLabel}
          latest={latest}
        />
      ) : (
      <>
      {canEdit && (
        <BudgetDataTools brands={brands} marketingBudgets={marketingBudgets} monthKeys={MONTH_KEYS} fy={fy} fyLabel={fyLabel} topups={topups} />
      )}
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

      {/* Portfolio visuals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative pacing */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-0.5">Cumulative pacing</h2>
          <p className="text-xs text-gray-400 mb-4">Spend to date vs the budget plan · above the line is ahead of plan</p>
          <div className="h-56">
            <Line
              data={{ labels: MONTH_LABELS, datasets: [
                { label: "Budget (plan)", data: cumBudget, borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
                { label: "Actual", data: cumSpend, borderColor: "#2e4057", backgroundColor: "#2e405722", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 },
              ] }}
              options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` } } }, scales: baseScales }}
            />
          </div>
        </div>

        {/* Monthly budget mix by channel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-0.5">Monthly budget mix by channel</h2>
          <p className="text-xs text-gray-400 mb-4">How the planned spend shifts across the year</p>
          <div className="h-56">
            <Bar
              data={{ labels: MONTH_LABELS, datasets: channels.map((ch, i) => ({ label: ch, data: budgetByChannelMonth[i], backgroundColor: chanColor(ch, i), borderRadius: 2, stack: "b" })) }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { stacked: true, ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } } }}
            />
          </div>
        </div>

        {/* Budget vs actual by brand */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-0.5">Budget vs actual by brand</h2>
          <p className="text-xs text-gray-400 mb-4">{fyLabel} to date</p>
          <div style={{ height: Math.max(220, brandSummaries.length * 26) }}>
            <Bar
              data={{ labels: brandSummaries.map(b => b.brand.name), datasets: [
                { label: "Budget", data: brandSummaries.map(b => b.budget), backgroundColor: "#e2e8f0", borderRadius: 3 },
                { label: "Actual", data: brandSummaries.map(b => b.actual), backgroundColor: brandSummaries.map(b => b.brand.color), borderRadius: 3 },
              ] }}
              options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.x ?? 0)}` } } }, scales: { x: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#6b7280" } } } }}
            />
          </div>
        </div>

        {/* Budget vs actual by channel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-0.5">Budget vs actual by channel</h2>
          <p className="text-xs text-gray-400 mb-4">{fyLabel} to date</p>
          <div style={{ height: Math.max(220, channelTotals.length * 26) }}>
            <Bar
              data={{ labels: channelTotals.map(c => c.channel), datasets: [
                { label: "Budget", data: channelTotals.map(c => c.budget), backgroundColor: "#e2e8f0", borderRadius: 3 },
                { label: "Actual", data: channelTotals.map(c => c.actual), backgroundColor: channelTotals.map((c, i) => chanColor(c.channel, i)), borderRadius: 3 },
              ] }}
              options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.x ?? 0)}` } } }, scales: { x: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#6b7280" } } } }}
            />
          </div>
        </div>
      </div>

      {/* By-brand table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Budget by brand</h2>
          <p className="text-xs text-gray-400 mt-0.5">{fyLabel} marketing budget vs actual spend · click a brand to drill in</p>
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
                  <tr key={brand.id} onClick={() => setBudgetBrand(brand.id)} className="hover:bg-emerald-50/50 transition-colors cursor-pointer group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brand.color }} />
                        <span className="font-medium text-slate-700 group-hover:text-emerald-600">{brand.name}</span>
                        <span className="text-gray-300 group-hover:text-emerald-400 transition-colors">›</span>
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
        Google &amp; Meta actuals are live from the ad platforms · all other expenses are uploaded above
      </p>
      </>
      )}
    </div>
  );
}
