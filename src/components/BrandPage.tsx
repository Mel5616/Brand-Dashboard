"use client";

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandSummary, BrandMonthly, BrandProduct, GoogleAdsRow } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);

const MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];
const MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26"];
const TEAL        = "#2dc8a5";
const HEADER_BG   = "#2e4057";
const LATEST      = "2026-05";
const PREV_MO     = "2026-04";
const PREV_YR     = "2025-05";

function pctOf(a: number, b: number): number | null {
  return b > 0 ? ((a - b) / b) * 100 : null;
}

function Sparkline({ values, color = TEAL }: { values: number[]; color?: string }) {
  return (
    <Line
      data={{
        labels: values.map((_, i) => i),
        datasets: [{
          data: values,
          borderColor: color,
          backgroundColor: color + "28",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation: false as any,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      }}
    />
  );
}

function PeriodDelta({ value, label, right }: { value: number | null; label: string; right?: boolean }) {
  if (value === null) return <div />;
  const pos = value >= 0;
  return (
    <div className={right ? "text-right" : ""}>
      <p className="text-gray-400 text-[10px]">{label}</p>
      <p className={`text-sm font-semibold ${pos ? "text-[#2dc8a5]" : "text-red-500"}`}>
        {pos ? "+" : ""}{value.toFixed(1)}%
      </p>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  spark: number[];
  prevPct?: number | null;
  yearPct?: number | null;
  hero?: boolean;
  heroColor?: string;
}

function KpiCard({ label, value, spark, prevPct = null, yearPct = null, hero = false, heroColor }: KpiProps) {
  if (hero) {
    return (
      <div className="p-6 flex flex-col justify-between" style={{ background: heroColor ?? TEAL, minHeight: 180 }}>
        <p className="text-white/75 text-[10px] uppercase tracking-[0.18em] font-medium">{label}</p>
        <p className="text-white text-4xl font-light leading-tight mt-4">{value}</p>
      </div>
    );
  }
  return (
    <div className="bg-white p-5">
      <p className="text-gray-400 text-[10px] uppercase tracking-[0.15em]">{label}</p>
      <p className="text-slate-800 text-3xl font-light mt-1.5 mb-3">{value}</p>
      <div className="h-14">
        <Sparkline values={spark} />
      </div>
      <div className="flex justify-between mt-3">
        <PeriodDelta value={prevPct ?? null} label="Previous period" />
        <PeriodDelta value={yearPct ?? null} label="Previous year" right />
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      className="px-6 py-3.5 text-white text-[11px] font-bold tracking-[0.22em] uppercase"
      style={{ background: HEADER_BG }}
    >
      {title}
    </div>
  );
}

interface Props {
  brand: Brand;
  summary: BrandSummary | undefined;
  monthly: BrandMonthly[];
  products: BrandProduct[];
  googleAds: GoogleAdsRow[];
}

export function BrandPage({ brand, summary, monthly, products, googleAds }: Props) {
  const adsRows     = googleAds.filter(d => d.brand_id === brand.id);
  const monthlyRows = monthly.filter(m => m.brand_id === brand.id);
  const productRows = products.filter(p => p.brand_id === brand.id).slice(0, 10);

  // ── Shopify sparklines ──────────────────────────────────────────────────
  const revSpark = MONTH_KEYS.map(mk => monthlyRows.find(m => m.month_key === mk)?.revenue ?? 0);
  const ordSpark = MONTH_KEYS.map(mk => monthlyRows.find(m => m.month_key === mk)?.orders  ?? 0);
  const aovSpark = MONTH_KEYS.map(mk => {
    const m = monthlyRows.find(r => r.month_key === mk);
    return m && m.orders > 0 ? m.revenue / m.orders : 0;
  });

  // Orders period comparisons
  const mayOrds  = monthlyRows.find(m => m.month_key === LATEST)?.orders  ?? 0;
  const aprOrds  = monthlyRows.find(m => m.month_key === PREV_MO)?.orders ?? 0;
  const may25Ords = monthlyRows.find(m => m.month_key === PREV_YR)?.orders ?? 0;

  // ── Google Ads ──────────────────────────────────────────────────────────
  const spendSpark  = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.spend       ?? 0);
  const roasSpark   = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.roas        ?? 0);
  const clicksSpark = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.clicks      ?? 0);
  const imprSpark   = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.impressions ?? 0);

  const latestAds = adsRows.find(d => d.month_key === LATEST);
  const prevAds   = adsRows.find(d => d.month_key === PREV_MO);
  const hasAds    = adsRows.length > 0;

  // ── Monthly Revenue + Orders dual-axis bar ──────────────────────────────
  const barData = {
    labels: MONTH_LABELS,
    datasets: [
      {
        label: "Revenue",
        data: revSpark,
        backgroundColor: brand.color + "cc",
        yAxisID: "yRev",
        borderRadius: 2,
      },
      {
        label: "Orders",
        data: ordSpark,
        backgroundColor: "#cbd5e1",
        yAxisID: "yOrd",
        borderRadius: 2,
      },
    ],
  };

  const barOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            ctx.datasetIndex === 0
              ? ` Revenue: ${fmtFull(ctx.parsed.y)}`
              : ` Orders: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } },
      yRev: {
        position: "left",
        ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" },
        grid: { color: "#f3f4f6" },
      },
      yOrd: {
        position: "right",
        ticks: { font: { size: 10 }, color: "#9ca3af" },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-16">
      <div className="max-w-screen-2xl mx-auto">

        {/* ── SHOPIFY PERFORMANCE ─────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Shopify Performance`} />

        {/* KPI row */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
          <KpiCard
            label="FY 2025–26 Revenue"
            value={fmt(summary?.fy_revenue ?? 0)}
            spark={revSpark}
            hero
            heroColor={brand.color}
          />
          <KpiCard
            label={`${summary?.last_month_label ?? "Last Month"} Revenue`}
            value={fmtFull(summary?.last_month_rev ?? 0)}
            spark={revSpark}
            prevPct={summary?.mom_growth ?? null}
            yearPct={summary?.yoy_growth ?? null}
          />
          <KpiCard
            label="Orders"
            value={(summary?.last_month_orders ?? 0).toLocaleString()}
            spark={ordSpark}
            prevPct={pctOf(mayOrds, aprOrds)}
            yearPct={pctOf(mayOrds, may25Ords)}
          />
          <KpiCard
            label="Avg Order Value"
            value={fmtFull(summary?.aov ?? 0)}
            spark={aovSpark}
          />
        </div>

        {/* Revenue + Orders chart | Top Products */}
        <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100">
          <div className="col-span-3 bg-white p-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mb-5">Revenue &amp; Orders by Month</p>
            <div className="h-52">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
          <div className="col-span-2 bg-white p-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mb-4">Top Products</p>
            {productRows.length === 0 ? (
              <p className="text-sm text-gray-400 mt-6">No product data yet</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-gray-500 font-semibold pb-2 pr-4">Product</th>
                    <th className="text-right text-gray-500 font-semibold pb-2">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {productRows.map((p, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-4 text-gray-600 truncate max-w-0 w-full">{p.title}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">{fmtFull(p.gross_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── GOOGLE ADS ──────────────────────────────────────────────────── */}
        {hasAds && (
          <>
            <SectionHeader title={`${brand.name}  ·  Google Ads`} />
            <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
              <KpiCard
                label="Spend (May 26)"
                value={fmtFull(latestAds?.spend ?? 0)}
                spark={spendSpark}
                prevPct={pctOf(latestAds?.spend ?? 0, prevAds?.spend ?? 0)}
              />
              <KpiCard
                label="ROAS"
                value={(latestAds?.roas ?? 0).toFixed(2) + "×"}
                spark={roasSpark}
                prevPct={pctOf(latestAds?.roas ?? 0, prevAds?.roas ?? 0)}
              />
              <KpiCard
                label="Clicks"
                value={(latestAds?.clicks ?? 0).toLocaleString()}
                spark={clicksSpark}
                prevPct={pctOf(latestAds?.clicks ?? 0, prevAds?.clicks ?? 0)}
              />
              <KpiCard
                label="Impressions"
                value={((latestAds?.impressions ?? 0) / 1000).toFixed(0) + "K"}
                spark={imprSpark}
                prevPct={pctOf(latestAds?.impressions ?? 0, prevAds?.impressions ?? 0)}
              />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
