"use client";

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandMonthly, BrandSummary } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);

interface Props {
  brands: Brand[];
  monthly: BrandMonthly[];
  summaries: BrandSummary[];
  monthKeys: string[];
  monthLabels: string[];
  latest: string;
  fyLabel: string;
}

export function ShopifyInsights({ brands, monthly, summaries, monthKeys, monthLabels, latest, fyLabel }: Props) {
  const liveIds = new Set(brands.filter(b => b.live).map(b => b.id));
  const inScope = (bid: number) => liveIds.has(bid);
  const latestIdx = Math.max(0, monthKeys.indexOf(latest));

  // Per-month aggregates across in-scope brands
  const rev      = monthKeys.map(mk => monthly.filter(m => m.month_key === mk && inScope(m.brand_id)).reduce((s, m) => s + (m.revenue ?? 0), 0));
  const prevRev  = monthKeys.map(mk => monthly.filter(m => m.month_key === mk && inScope(m.brand_id)).reduce((s, m) => s + (m.prev_revenue ?? 0), 0));
  const orders   = monthKeys.map(mk => monthly.filter(m => m.month_key === mk && inScope(m.brand_id)).reduce((s, m) => s + (m.orders ?? 0), 0));
  const aov      = rev.map((r, i) => orders[i] > 0 ? r / orders[i] : 0);

  // current-year series only through the latest month with data
  const curRev    = rev.map((v, i) => i <= latestIdx ? v : null);
  const curOrders = orders.map((v, i) => i <= latestIdx ? v : null);
  const curAov    = aov.map((v, i) => i <= latestIdx ? v : null);

  // YoY to date
  const ytdCur  = rev.slice(0, latestIdx + 1).reduce((s, v) => s + v, 0);
  const ytdPrev = prevRev.slice(0, latestIdx + 1).reduce((s, v) => s + v, 0);
  const yoyPct  = ytdPrev > 0 ? ((ytdCur - ytdPrev) / ytdPrev) * 100 : null;
  const hasYoY  = prevRev.some(v => v > 0);

  // Top movers (MoM) — only meaningful when multiple brands shown
  const single = liveIds.size === 1;
  const movers = brands.filter(b => b.live)
    .map(b => ({ brand: b, s: summaries.find(s => s.brand_id === b.id) }))
    .filter(x => x.s && (x.s.last_month_rev ?? 0) > 0 && x.s.mom_growth != null)
    .map(x => ({ brand: x.brand, mom: x.s!.mom_growth, rev: x.s!.last_month_rev }))
    .sort((a, b) => b.mom - a.mom);
  // Top 3 genuine gainers (up) and up to 3 genuine decliners (down) — never
  // pad the decliner slots with brands that actually grew.
  const gainers = movers.filter(m => m.mom > 0).slice(0, 3);
  const decliners = movers.filter(m => m.mom < 0).slice(-3).reverse();

  return (
    <div className="space-y-4">
      {/* Top movers */}
      {!single && movers.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-1.5 px-0.5">Top Movers · {monthLabel(latest)} MoM</p>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[...gainers, ...decliners].map(m => (
              <div key={m.brand.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: m.brand.color }} />
                  <span className="text-xs font-semibold text-slate-600 truncate">{m.brand.name}</span>
                </div>
                <p className={`text-lg font-bold mt-0.5 ${m.mom >= 0 ? "text-emerald-500" : "text-red-500"}`}>{m.mom >= 0 ? "+" : ""}{m.mom.toFixed(1)}%</p>
                <p className="text-[10px] text-gray-400">{fmt(m.rev)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Year on year */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Year on Year</h3>
              <p className="text-xs text-gray-400">{fyLabel} vs prior year, by month</p>
            </div>
            {yoyPct != null && (
              <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${yoyPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                {yoyPct >= 0 ? "+" : ""}{yoyPct.toFixed(1)}% YTD
              </span>
            )}
          </div>
          <div className="h-56 mt-4">
            {hasYoY ? (
              <Bar
                data={{
                  labels: monthLabels,
                  datasets: [
                    { label: "Prior year", data: prevRev, backgroundColor: "#cbd5e1", borderRadius: 3 },
                    { label: fyLabel, data: curRev, backgroundColor: "#2dc8a5", borderRadius: 3 },
                  ],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
                    tooltip: { callbacks: { label: (ctx: any) => ctx.parsed.y == null ? "" : ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y)}` } },
                  },
                  scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } },
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400 text-center">No prior-year data for {fyLabel}.</div>
            )}
          </div>
        </div>

        {/* AOV & Orders */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">AOV &amp; Orders</h3>
          <p className="text-xs text-gray-400">Average order value vs order volume, by month</p>
          <div className="h-56 mt-4">
            <Bar
              data={{
                labels: monthLabels,
                datasets: [
                  { type: "bar", label: "Orders", data: curOrders, backgroundColor: "#6366f1", borderRadius: 3, yAxisID: "yOrd", order: 2 },
                  { type: "line", label: "AOV", data: curAov, borderColor: "#f59e0b", backgroundColor: "#f59e0b", borderWidth: 2, pointRadius: 3, tension: 0.35, yAxisID: "yAov", order: 1 },
                ],
              } as any}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
                  tooltip: { callbacks: { label: (ctx: any) => ctx.parsed.y == null ? "" : (ctx.dataset.label === "AOV" ? ` AOV: ${fmtFull(ctx.parsed.y)}` : ` Orders: ${ctx.parsed.y.toLocaleString()}`) } },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } },
                  yOrd: { position: "left", beginAtZero: true, ticks: { precision: 0, font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
                  yAov: { position: "right", ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { display: false } },
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}
