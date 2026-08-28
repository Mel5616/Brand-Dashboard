"use client";

import { useState, useEffect } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { fmtFull, fmt } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

// Self-contained "sales vs forecast vs spend vs budget" line chart, month by
// month — shared between the Budget tab (whole-portfolio) and Business
// Overview (labelled D2C, since `monthly` there is D2C-only revenue) so the
// two never drift into two slightly different chart implementations.
// Fetches budget_topups itself so the "Marketing budget" line stays
// monthly-aware wherever this is dropped in, without every caller having to
// plumb that through.
interface Props {
  monthly: { month_key: string; revenue: number }[];
  targets?: { month_key: string; revenue_target: number }[];
  marketingBudgets: { brand_id: number; channel: string; annual_budget: number }[];
  marketingActuals: { month_key: string; spend: number }[];
  googleAds: { month_key: string; spend: number }[];
  metaAds: { month_key: string; spend: number }[];
  pinterestAds?: { month_key: string; spend: number }[];
  monthKeys: string[];
  monthLabels: string[];
  title?: string;
  subtitle?: string;
  height?: string;
}

export function SalesForecastSpendChart({
  monthly, targets = [], marketingBudgets, marketingActuals, googleAds, metaAds, pinterestAds = [],
  monthKeys, monthLabels, title = "Monthly sales vs marketing spend", subtitle, height = "h-56",
}: Props) {
  const [topups, setTopups] = useState<any[]>([]);
  useEffect(() => { fetch("/api/budget-topups").then(r => r.json()).then(j => setTopups(j.topups ?? [])).catch(() => {}); }, []);
  const topupVal = (bid: number, ch: string, mk: string) => {
    const t = topups.find((t: any) => t.brand_id === bid && t.channel === ch && t.month_key === mk);
    return t ? Number(t.amount) || 0 : null;
  };
  const monthBudgetVal = (bid: number, ch: string, mk: string, annual: number) => {
    const o = topupVal(bid, ch, mk);
    return o != null ? o : annual / 12;
  };

  const sales = monthKeys.map(mk => monthly.filter(m => m.month_key === mk).reduce((s, m) => s + m.revenue, 0));
  const forecast = monthKeys.map(mk => targets.filter(t => t.month_key === mk).reduce((s, t) => s + (Number(t.revenue_target) || 0), 0));
  const spend = monthKeys.map(mk => {
    const g = googleAds.filter(r => r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    const m = metaAds.filter(r => r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    const p = pinterestAds.filter(r => r.month_key === mk).reduce((s, r) => s + r.spend, 0);
    const o = marketingActuals.filter(a => a.month_key === mk).reduce((s, a) => s + a.spend, 0);
    return g + m + p + o;
  });
  const budget = monthKeys.map(mk => marketingBudgets.reduce((s, b) => s + monthBudgetVal(b.brand_id, b.channel, mk, b.annual_budget), 0));

  const lineData = {
    labels: monthLabels,
    datasets: [
      { label: "Sales", data: sales, borderColor: "#2dc8a5", backgroundColor: "#2dc8a520", fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: "#2dc8a5", borderWidth: 2, yAxisID: "yRev" },
      { label: "Forecast", data: forecast, borderColor: "#94a3b8", backgroundColor: "transparent", borderDash: [3, 3], tension: 0.4, pointRadius: 2, pointBackgroundColor: "#94a3b8", borderWidth: 1.5, yAxisID: "yRev" },
      { label: "Marketing spend", data: spend, borderColor: "#2e4057", backgroundColor: "transparent", borderDash: [5, 4], tension: 0.4, pointRadius: 3, pointBackgroundColor: "#2e4057", borderWidth: 2, yAxisID: "ySpend" },
      { label: "Marketing budget", data: budget, borderColor: "#f59e0b", backgroundColor: "transparent", borderDash: [2, 2], tension: 0.4, pointRadius: 2, pointBackgroundColor: "#f59e0b", borderWidth: 1.5, yAxisID: "ySpend" },
    ],
  };

  const lineOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
      yRev: { position: "left", ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
      ySpend: { position: "right", ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { display: false } },
    },
  };

  return (
    <>
      <h2 className="font-semibold text-gray-800 mb-0.5">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
      <div className={height}>
        <Line data={lineData} options={lineOpts} />
      </div>
    </>
  );
}
