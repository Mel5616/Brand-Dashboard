"use client";

import { useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type {
  Brand, BrandSummary, BrandMonthly, BrandWeekly, BrandProduct,
  GoogleAdsRow, GoogleAdsCampaignRow, MetaAdsRow, MetaAdsPlatformRow, InstagramOrganicRow,
  WeekLabel, BrandTarget, KlaviyoRow, GA4Row, MarketingBudget, MarketingActual,
} from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);

const MONTH_KEYS   = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];
const MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26"];
const TEAL      = "#2dc8a5";
const HEADER_BG = "#2e4057";
const LATEST    = "2026-05";
const PREV_MO   = "2026-04";
const PREV_YR   = "2025-05";

type Period = "monthly" | "weekly";

function pctOf(a: number, b: number): number | null {
  return b > 0 ? ((a - b) / b) * 100 : null;
}

// ── Sub-components ──────────────────────────────────────────────────────────

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
  color?: string;
}

function KpiCard({ label, value, spark, prevPct = null, yearPct = null, hero = false, heroColor, color }: KpiProps) {
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
        <Sparkline values={spark} color={color} />
      </div>
      <div className="flex justify-between mt-3">
        <PeriodDelta value={prevPct ?? null} label="Previous period" />
        <PeriodDelta value={yearPct ?? null} label="Previous year" right />
      </div>
    </div>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      className="px-6 py-3 flex items-center justify-between text-white text-[11px] font-bold tracking-[0.22em] uppercase"
      style={{ background: HEADER_BG }}
    >
      <span>{title}</span>
      {children}
    </div>
  );
}

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-0.5 bg-white/10 rounded p-0.5">
      {(["monthly", "weekly"] as Period[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-0.5 rounded text-[10px] font-semibold tracking-wider transition ${
            period === p ? "bg-white text-[#2e4057]" : "text-white/70 hover:text-white"
          }`}
        >
          {p === "monthly" ? "Monthly" : "Weekly"}
        </button>
      ))}
    </div>
  );
}

function PacingBar({ current, target, label }: { current: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 110) : 0;
  const onTrack = pct >= 80;
  const over = pct > 100;
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1.5">
        <span className="text-white/60">{label}</span>
        <span className={`font-semibold ${over ? "text-[#2dc8a5]" : onTrack ? "text-[#2dc8a5]" : "text-amber-400"}`}>
          {fmtFull(current)} / {fmtFull(target)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: onTrack ? "#2dc8a5" : "#f59e0b" }}
        />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  brand: Brand;
  summary: BrandSummary | undefined;
  monthly: BrandMonthly[];
  weekly: BrandWeekly[];
  weekLabels: WeekLabel[];
  products: BrandProduct[];
  googleAds: GoogleAdsRow[];
  metaAds: MetaAdsRow[];
  metaAdsPlatform: MetaAdsPlatformRow[];
  instagramOrganic: InstagramOrganicRow[];
  targets: BrandTarget[];
  klaviyo: KlaviyoRow[];
  ga4: GA4Row[];
  marketingBudgets: MarketingBudget[];
  marketingActuals: MarketingActual[];
  googleAdsCampaigns: GoogleAdsCampaignRow[];
}

export function BrandPage({
  brand, summary, monthly, weekly, weekLabels, products,
  googleAds, metaAds, metaAdsPlatform, instagramOrganic,
  targets, klaviyo, ga4, marketingBudgets, marketingActuals, googleAdsCampaigns,
}: Props) {
  const [period, setPeriod] = useState<Period>("monthly");

  const monthlyRows = monthly.filter(m => m.brand_id === brand.id);
  const weeklyRows  = weekly.filter(w => w.brand_id === brand.id);
  const productRows = products.filter(p => p.brand_id === brand.id).slice(0, 10);
  const adsRows     = googleAds.filter(d => d.brand_id === brand.id);

  // ── Monthly data ────────────────────────────────────────────────────────
  const revMonthly = MONTH_KEYS.map(mk => monthlyRows.find(m => m.month_key === mk)?.revenue ?? 0);
  const ordMonthly = MONTH_KEYS.map(mk => monthlyRows.find(m => m.month_key === mk)?.orders  ?? 0);
  const aovMonthly = MONTH_KEYS.map(mk => {
    const m = monthlyRows.find(r => r.month_key === mk);
    return m && m.orders > 0 ? m.revenue / m.orders : 0;
  });
  const mayOrds   = monthlyRows.find(m => m.month_key === LATEST)?.orders  ?? 0;
  const aprOrds   = monthlyRows.find(m => m.month_key === PREV_MO)?.orders ?? 0;
  const may25Ords = monthlyRows.find(m => m.month_key === PREV_YR)?.orders ?? 0;

  // ── Weekly data ─────────────────────────────────────────────────────────
  const sortedWeeks = [...weekLabels].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const revWeekly = sortedWeeks.map(wl => weeklyRows.find(w => w.week_start === wl.week_start)?.revenue ?? 0);
  const ordWeekly = sortedWeeks.map(wl => weeklyRows.find(w => w.week_start === wl.week_start)?.orders  ?? 0);
  const aovWeekly = sortedWeeks.map(wl => {
    const w = weeklyRows.find(r => r.week_start === wl.week_start);
    return w && w.orders > 0 ? w.revenue / w.orders : 0;
  });
  const lastWk    = sortedWeeks[sortedWeeks.length - 1];
  const prevWk    = sortedWeeks[sortedWeeks.length - 2];
  const latestWkD = weeklyRows.find(w => w.week_start === lastWk?.week_start);
  const prevWkD   = weeklyRows.find(w => w.week_start === prevWk?.week_start);

  // ── Period-switched values ──────────────────────────────────────────────
  const isWeekly    = period === "weekly";
  const revSpark    = isWeekly ? revWeekly : revMonthly;
  const ordSpark    = isWeekly ? ordWeekly : ordMonthly;
  const aovSpark    = isWeekly ? aovWeekly : aovMonthly;
  const chartLabels = isWeekly ? sortedWeeks.map(w => w.label) : MONTH_LABELS;

  const currentRev      = isWeekly ? (latestWkD?.revenue ?? 0) : (summary?.last_month_rev ?? 0);
  const currentRevPrev  = isWeekly ? pctOf(latestWkD?.revenue ?? 0, prevWkD?.revenue ?? 0) : (summary?.mom_growth ?? null);
  const currentRevYear  = isWeekly ? null : (summary?.yoy_growth ?? null);
  const currentOrds     = isWeekly ? (latestWkD?.orders ?? 0) : (summary?.last_month_orders ?? 0);
  const currentOrdsPrev = isWeekly ? pctOf(latestWkD?.orders ?? 0, prevWkD?.orders ?? 0) : pctOf(mayOrds, aprOrds);
  const currentOrdsYear = isWeekly ? null : pctOf(mayOrds, may25Ords);
  const currentAov      = isWeekly
    ? (latestWkD && latestWkD.orders > 0 ? latestWkD.revenue / latestWkD.orders : 0)
    : (summary?.aov ?? 0);
  const periodLabel = isWeekly ? `Wk ${lastWk?.label ?? ""}` : (summary?.last_month_label ?? "Last Month");

  // ── Bar chart ───────────────────────────────────────────────────────────
  const barData = {
    labels: chartLabels,
    datasets: [
      { label: "Revenue", data: revSpark, backgroundColor: brand.color + "cc", yAxisID: "yRev", borderRadius: 2 },
      { label: "Orders",  data: ordSpark, backgroundColor: "#cbd5e1",           yAxisID: "yOrd", borderRadius: 2 },
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
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 } },
      yRev: { position: "left",  ticks: { callback: (v: number) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
      yOrd: { position: "right", ticks: { font: { size: 10 }, color: "#9ca3af" }, grid: { display: false } },
    },
  };

  // ── Google Ads ──────────────────────────────────────────────────────────
  const spendSpark  = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.spend       ?? 0);
  const roasSpark   = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.roas        ?? 0);
  const clicksSpark = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.clicks      ?? 0);
  const imprSpark   = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.impressions ?? 0);
  const gRevSpark   = MONTH_KEYS.map(mk => { const r = adsRows.find(d => d.month_key === mk); return r ? r.roas * r.spend : 0; });
  const latestAds   = adsRows.find(d => d.month_key === LATEST);
  const prevAds     = adsRows.find(d => d.month_key === PREV_MO);
  const hasAds      = adsRows.length > 0;
  const latestGRev  = (latestAds?.roas ?? 0) * (latestAds?.spend ?? 0);
  const prevGRev    = (prevAds?.roas  ?? 0) * (prevAds?.spend  ?? 0);

  // ── Google Ads Campaigns ─────────────────────────────────────────────────
  const campRows     = googleAdsCampaigns.filter(c => c.brand_id === brand.id);
  const campLatest   = campRows.filter(c => c.month_key === LATEST).sort((a, b) => b.spend - a.spend);
  const campPrev     = campRows.filter(c => c.month_key === PREV_MO);
  const hasCampaigns = campLatest.length > 0;

  // ── Meta Ads ─────────────────────────────────────────────────────────────
  const metaRows     = metaAds.filter(d => d.brand_id === brand.id);
  const hasMeta      = metaRows.length > 0;
  const metaSpendSp  = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.spend     ?? 0);
  const metaClicksSp = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.clicks    ?? 0);
  const metaPurchSp  = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.purchases ?? 0);
  const metaRevSp    = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.revenue   ?? 0);
  const latestMeta   = metaRows.find(d => d.month_key === LATEST);
  const prevMeta     = metaRows.find(d => d.month_key === PREV_MO);
  const metaRoasSp   = MONTH_KEYS.map(mk => {
    const r = metaRows.find(d => d.month_key === mk);
    return r && r.spend > 0 ? r.revenue / r.spend : 0;
  });
  const latestMetaRoas = latestMeta && latestMeta.spend > 0 ? latestMeta.revenue / latestMeta.spend : 0;
  const prevMetaRoas   = prevMeta   && prevMeta.spend   > 0 ? prevMeta.revenue   / prevMeta.spend   : 0;

  // ── Blended ROAS ────────────────────────────────────────────────────────
  const blendedSpendSp = MONTH_KEYS.map((mk, i) => spendSpark[i] + metaSpendSp[i]);
  const blendedRevSp   = MONTH_KEYS.map((mk, i) => gRevSpark[i]  + metaRevSp[i]);
  const blendedRoasSp  = blendedSpendSp.map((spend, i) => spend > 0 ? blendedRevSp[i] / spend : 0);
  const blendedSpend   = (latestAds?.spend ?? 0) + (latestMeta?.spend ?? 0);
  const blendedRev     = latestGRev + (latestMeta?.revenue ?? 0);
  const blendedRoas    = blendedSpend > 0 ? blendedRev / blendedSpend : 0;
  const prevBlendSpend = (prevAds?.spend ?? 0) + (prevMeta?.spend ?? 0);
  const prevBlendRev   = prevGRev + (prevMeta?.revenue ?? 0);
  const prevBlendRoas  = prevBlendSpend > 0 ? prevBlendRev / prevBlendSpend : 0;
  const hasBlended     = hasAds || hasMeta;

  // ── Meta Platform Breakdown ──────────────────────────────────────────────
  const platRows    = metaAdsPlatform.filter(d => d.brand_id === brand.id);
  const hasPlatform = platRows.length > 0;
  const PLATFORMS: { id: string; label: string; icon: string }[] = [
    { id: "facebook",         label: "Facebook",         icon: "f"  },
    { id: "instagram",        label: "Instagram",        icon: "ig" },
    { id: "messenger",        label: "Messenger",        icon: "m"  },
    { id: "audience_network", label: "Audience Network", icon: "an" },
  ];
  const latestPlatRows = platRows.filter(d => d.month_key === LATEST);

  // ── Instagram Organic ────────────────────────────────────────────────────
  const igRows       = instagramOrganic.filter(d => d.brand_id === brand.id);
  const hasIg        = igRows.length > 0;
  const latestIg     = igRows.find(d => d.month_key === LATEST);
  const prevIg       = igRows.find(d => d.month_key === PREV_MO);
  const igFollSpark  = MONTH_KEYS.map(mk => igRows.find(d => d.month_key === mk)?.followers        ?? 0);
  const igReachSpark = MONTH_KEYS.map(mk => igRows.find(d => d.month_key === mk)?.reach            ?? 0);
  const igPvSpark    = MONTH_KEYS.map(mk => igRows.find(d => d.month_key === mk)?.profile_views    ?? 0);
  const igEngSpark   = MONTH_KEYS.map(mk => igRows.find(d => d.month_key === mk)?.accounts_engaged ?? 0);

  // ── Marketing Budgets & Actuals (needed for summary KPIs) ────────────────
  const budgets        = marketingBudgets.filter(b => b.brand_id === brand.id);
  const hasBudgets     = budgets.length > 0;
  const actualsRows    = marketingActuals.filter(a => a.brand_id === brand.id);
  const fyGoogleActual = adsRows.reduce((s, r) => s + r.spend, 0);
  const fyMetaActual   = metaRows.reduce((s, r) => s + r.spend, 0);

  function getActual(channel: string): number {
    if (channel === "Google Advertising") return fyGoogleActual;
    if (channel === "Social Media (Meta)") return fyMetaActual;
    return actualsRows.filter(a => a.channel === channel).reduce((s, a) => s + a.spend, 0);
  }

  const CHANNEL_COLORS: Record<string, string> = {
    "Google Advertising":   "#4285F4",
    "Social Media (Meta)":  "#1877F2",
    "Klaviyo":              "#7c3aed",
    "Influencer Marketing": "#f59e0b",
    "Photography":          "#ec4899",
    "Shopify":              "#96bf48",
  };

  // ── Targets & Pacing ─────────────────────────────────────────────────────
  const latestTarget  = targets.find(t => t.brand_id === brand.id && t.month_key === LATEST);
  const brandTargets  = targets.filter(t => t.brand_id === brand.id);
  const fyRevTarget   = brandTargets.reduce((s, t) => s + (t.revenue_target ?? 0), 0);

  // ── Brand-level summary KPIs ──────────────────────────────────────────────
  const fyRevenue          = summary?.fy_revenue ?? 0;
  const fyTotalOtherActual = actualsRows?.reduce((s, a) => s + a.spend, 0) ?? 0;
  const fyTotalSpend       = (fyGoogleActual ?? 0) + (fyMetaActual ?? 0) + fyTotalOtherActual;
  const fyBudget           = budgets.reduce((s, b) => s + b.annual_budget, 0);
  const fyBlendedRoas      = fyTotalSpend > 0 ? fyRevenue / fyTotalSpend : 0;
  const mktgPctOfSales     = fyRevenue > 0 ? (fyTotalSpend / fyRevenue) * 100 : 0;
  const portfolioFyRev     = monthly.filter(m => MONTH_KEYS.includes(m.month_key)).reduce((s, m) => s + m.revenue, 0);
  const shareOfPortfolio   = portfolioFyRev > 0 ? (fyRevenue / portfolioFyRev) * 100 : 0;
  const monthsWithData     = monthlyRows.filter(m => m.revenue > 0).length;
  const forecastFullYear   = monthsWithData > 0 ? (fyRevenue / monthsWithData) * 12 : 0;
  const paceVsTarget       = fyRevTarget > 0 ? (forecastFullYear / fyRevTarget) * 100 : null;
  const targetVsActual     = fyRevTarget > 0 ? (fyRevenue / fyRevTarget) * 100 : null;
  const budgetUtilPct      = fyBudget > 0 ? (fyTotalSpend / fyBudget) * 100 : null;
  const hasSummaryKpis     = fyRevenue > 0 || fyTotalSpend > 0 || fyRevTarget > 0;

  // ── Returns Rate ─────────────────────────────────────────────────────────
  const fyRefunds        = summary?.fy_refunds ?? 0;
  const lastMonthRefunds = summary?.last_month_refunds ?? 0;
  const returnRateFy     = (summary?.fy_revenue ?? 0) > 0 ? (fyRefunds / (summary?.fy_revenue ?? 1)) * 100 : 0;
  const returnRateMonth  = (summary?.last_month_rev ?? 0) > 0 ? (lastMonthRefunds / (summary?.last_month_rev ?? 1)) * 100 : 0;
  const hasRefunds       = fyRefunds > 0;

  // ── Customer LTV ─────────────────────────────────────────────────────────
  const fyOrders         = summary?.fy_orders ?? 0;
  const uniqueCustomers  = summary?.unique_customers_fy ?? 0;
  const purchaseFreq     = uniqueCustomers > 0 ? fyOrders / uniqueCustomers : 0;
  const ltv              = (summary?.aov ?? 0) * purchaseFreq;
  const hasLtv           = uniqueCustomers > 0;

  // ── Seasonal Index ────────────────────────────────────────────────────────
  const totalFyRev      = revMonthly.reduce((s, v) => s + v, 0);
  const seasonalIndex   = revMonthly.map(v => totalFyRev > 0 ? (v / totalFyRev) * 100 : 0);
  const activeMonths    = revMonthly.filter(v => v > 0).length;
  const avgSeasonalPct  = activeMonths > 0 ? 100 / activeMonths : 0;
  const hasSeasonalData = activeMonths >= 3;

  // ── CAC by Channel ────────────────────────────────────────────────────────
  const googleCac = (latestAds?.roas ?? 0) > 0 && (summary?.aov ?? 0) > 0
    ? (summary?.aov ?? 0) / latestAds!.roas : 0;
  const metaCac = (latestMeta?.purchases ?? 0) > 0
    ? (latestMeta?.spend ?? 0) / latestMeta!.purchases : 0;
  const prevMetaCac = (prevMeta?.purchases ?? 0) > 0
    ? (prevMeta?.spend ?? 0) / prevMeta!.purchases : 0;
  const googleCacSpark = MONTH_KEYS.map((mk, i) => {
    const roas = adsRows.find(d => d.month_key === mk)?.roas ?? 0;
    return roas > 0 && aovMonthly[i] > 0 ? aovMonthly[i] / roas : 0;
  });
  const metaCacSpark = MONTH_KEYS.map(mk => {
    const r = metaRows.find(d => d.month_key === mk);
    return r && r.purchases > 0 ? r.spend / r.purchases : 0;
  });
  const blendedCacSpark = MONTH_KEYS.map((mk, i) => {
    const totalSpend = spendSpark[i] + metaSpendSp[i];
    const gRoas = adsRows.find(d => d.month_key === mk)?.roas ?? 0;
    const gOrds = gRoas > 0 && aovMonthly[i] > 0 ? gRevSpark[i] / aovMonthly[i] : 0;
    const mOrds = metaRows.find(d => d.month_key === mk)?.purchases ?? 0;
    const totalOrds = gOrds + mOrds;
    return totalOrds > 0 ? totalSpend / totalOrds : 0;
  });
  const blendedCac = (() => {
    const totalSpend = (latestAds?.spend ?? 0) + (latestMeta?.spend ?? 0);
    const gOrds = (latestAds?.roas ?? 0) > 0 && (summary?.aov ?? 0) > 0
      ? latestGRev / (summary?.aov ?? 1) : 0;
    const mOrds = latestMeta?.purchases ?? 0;
    const totalOrds = gOrds + mOrds;
    return totalOrds > 0 ? totalSpend / totalOrds : 0;
  })();

  // ── Klaviyo ──────────────────────────────────────────────────────────────
  const klaviyoRows  = klaviyo.filter(d => d.brand_id === brand.id);
  const hasKlaviyo   = klaviyoRows.length > 0;
  const latestKl     = klaviyoRows.find(d => d.month_key === LATEST);
  const prevKl       = klaviyoRows.find(d => d.month_key === PREV_MO);
  const klListSpark  = MONTH_KEYS.map(mk => klaviyoRows.find(d => d.month_key === mk)?.list_size  ?? 0);
  const klOpenSpark  = MONTH_KEYS.map(mk => klaviyoRows.find(d => d.month_key === mk)?.open_rate  ?? 0);
  const klClickSpark = MONTH_KEYS.map(mk => klaviyoRows.find(d => d.month_key === mk)?.click_rate ?? 0);
  const klRevSpark   = MONTH_KEYS.map(mk => klaviyoRows.find(d => d.month_key === mk)?.revenue    ?? 0);


  // ── GA4 ──────────────────────────────────────────────────────────────────
  const ga4Rows        = ga4.filter(d => d.brand_id === brand.id);
  const hasGA4         = ga4Rows.length > 0;
  const latestGA4      = ga4Rows.find(d => d.month_key === LATEST);
  const prevGA4        = ga4Rows.find(d => d.month_key === PREV_MO);
  const ga4SessSpark   = MONTH_KEYS.map(mk => ga4Rows.find(d => d.month_key === mk)?.sessions        ?? 0);
  const ga4OrgSpark    = MONTH_KEYS.map(mk => ga4Rows.find(d => d.month_key === mk)?.organic_sessions ?? 0);
  const ga4UsersSpark  = MONTH_KEYS.map(mk => ga4Rows.find(d => d.month_key === mk)?.new_users        ?? 0);
  const ga4EngSpark    = MONTH_KEYS.map(mk => ga4Rows.find(d => d.month_key === mk)?.engagement_rate  ?? 0);

  return (
    <div className="bg-gray-50 min-h-screen pb-16">
      <div className="max-w-screen-2xl mx-auto">

        {/* ── BRAND SUMMARY KPIs ───────────────────────────────────────────── */}
        {hasSummaryKpis && (
          <div className="bg-white border-b border-gray-100 px-6 py-5">
            {/* Row 1 — hero metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {/* Blended ROAS */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: brand.color }} />
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">ROAS</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{fyBlendedRoas > 0 ? `${fyBlendedRoas.toFixed(1)}×` : "—"}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">sales per $1 marketing</p>
              </div>
              {/* Full-year forecast */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Forecast (full year)</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{forecastFullYear > 0 ? fmt(forecastFullYear) : "—"}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {paceVsTarget !== null ? `${paceVsTarget.toFixed(1)}% of target at current pace` : "based on YTD run rate"}
                </p>
              </div>
              {/* Share of portfolio */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Share of portfolio</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{shareOfPortfolio > 0 ? `${shareOfPortfolio.toFixed(1)}%` : "—"}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">of total company sales</p>
              </div>
              {/* Momentum */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Momentum</span>
                </div>
                {summary?.mom_growth != null ? (
                  <>
                    <p className={`text-2xl font-bold ${summary.mom_growth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {summary.mom_growth >= 0 ? "▲" : "▼"} {Math.abs(summary.mom_growth).toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">MoM · May</p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-slate-400">—</p>
                )}
              </div>
            </div>

            {/* Row 2 — targets strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                {
                  dot: "bg-emerald-400",
                  label: "Sales target FY",
                  value: fyRevTarget > 0 ? fmt(fyRevTarget) : "—",
                  sub: null,
                },
                {
                  dot: "bg-emerald-400",
                  label: "Actual sales YTD",
                  value: fmt(fyRevenue),
                  sub: targetVsActual !== null ? `${targetVsActual.toFixed(1)}% to target` : null,
                },
                {
                  dot: "bg-slate-600",
                  label: "Marketing budget FY",
                  value: fyBudget > 0 ? fmt(fyBudget) : "—",
                  sub: null,
                },
                {
                  dot: "bg-slate-600",
                  label: "Spend YTD",
                  value: fyTotalSpend > 0 ? fmt(fyTotalSpend) : "—",
                  sub: budgetUtilPct !== null ? `${budgetUtilPct.toFixed(1)}% of budget used` : null,
                },
                {
                  dot: "bg-slate-600",
                  label: "Mktg % of sales",
                  value: fyTotalSpend > 0 && fyRevenue > 0 ? `${mktgPctOfSales.toFixed(1)}%` : "—",
                  sub: null,
                },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={`w-2 h-2 rounded-full ${kpi.dot}`} />
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{kpi.label}</span>
                  </div>
                  <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
                  {kpi.sub && <p className="text-[10px] text-gray-400 mt-0.5">{kpi.sub}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SHOPIFY ──────────────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Shopify Performance`}>
          <PeriodToggle period={period} onChange={setPeriod} />
        </SectionHeader>

        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
          <KpiCard
            label="FY 2025–26 Revenue"
            value={fmt(summary?.fy_revenue ?? 0)}
            spark={revMonthly}
            hero
            heroColor={brand.color}
          />
          <KpiCard
            label={`${periodLabel} Revenue`}
            value={fmtFull(currentRev)}
            spark={revSpark}
            prevPct={currentRevPrev}
            yearPct={currentRevYear}
          />
          <KpiCard
            label={`${periodLabel} Orders`}
            value={currentOrds.toLocaleString()}
            spark={ordSpark}
            prevPct={currentOrdsPrev}
            yearPct={currentOrdsYear}
          />
          <KpiCard
            label="Avg Order Value"
            value={fmtFull(currentAov)}
            spark={aovSpark}
          />
        </div>

        {/* ── RETURNS RATE ─────────────────────────────────────────────────── */}
        {hasRefunds && (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard label="FY Returns" value={fmt(fyRefunds)} spark={[]} color="#ef4444" />
            <KpiCard label="Return Rate (FY)" value={`${returnRateFy.toFixed(1)}%`} spark={[]} color="#ef4444" />
            <KpiCard label="Returns (May 26)" value={lastMonthRefunds > 0 ? fmtFull(lastMonthRefunds) : "—"} spark={[]} color="#ef4444" />
            <KpiCard label="Return Rate (May 26)" value={returnRateMonth > 0 ? `${returnRateMonth.toFixed(1)}%` : "—"} spark={[]} color="#ef4444" />
          </div>
        )}

        {/* ── CUSTOMER LTV ──────────────────────────────────────────────────── */}
        {hasLtv && (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard label="Unique Customers (FY)" value={uniqueCustomers.toLocaleString()} spark={[]} />
            <KpiCard label="FY Orders" value={fyOrders.toLocaleString()} spark={[]} />
            <KpiCard label="Avg Orders / Customer" value={purchaseFreq.toFixed(2)} spark={[]} />
            <KpiCard label="Est. Customer LTV" value={ltv > 0 ? fmtFull(ltv) : "—"} spark={aovSpark} />
          </div>
        )}

        {/* ── TARGETS & PACING ─────────────────────────────────────────────── */}
        {latestTarget && (
          <div className="px-6 py-5 border-b border-gray-100" style={{ background: HEADER_BG }}>
            <p className="text-white/60 text-[10px] uppercase tracking-[0.2em] mb-3">May 2026 · Targets & Pacing</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {latestTarget.revenue_target > 0 && (
                <PacingBar current={summary?.last_month_rev ?? 0} target={latestTarget.revenue_target} label="Revenue" />
              )}
              {latestTarget.google_spend_target > 0 && (
                <PacingBar current={latestAds?.spend ?? 0} target={latestTarget.google_spend_target} label="Google Spend" />
              )}
              {latestTarget.meta_spend_target > 0 && (
                <PacingBar current={latestMeta?.spend ?? 0} target={latestTarget.meta_spend_target} label="Meta Spend" />
              )}
            </div>
          </div>
        )}

        {/* Revenue + Orders chart | Top Products */}
        <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100">
          <div className="col-span-3 bg-white p-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mb-5">
              Revenue &amp; Orders — {isWeekly ? "Weekly (Rolling 13 Weeks)" : "Monthly (FY 2025–26)"}
            </p>
            <div className="h-52">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
          <div className="col-span-2 bg-white p-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mb-4">Top Products (FY)</p>
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

        {/* ── SEASONAL INDEX ────────────────────────────────────────────────── */}
        {hasSeasonalData && (
          <>
            <SectionHeader title={`${brand.name}  ·  Seasonal Index  ·  Revenue Pattern`} />
            <div className="bg-white border-b border-gray-100 p-6">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mb-4">
                Monthly share of annual revenue · above-average months highlighted · use to guide budget timing
              </p>
              <div className="h-44">
                <Bar
                  data={{
                    labels: MONTH_LABELS,
                    datasets: [{
                      label: "% of annual revenue",
                      data: seasonalIndex,
                      backgroundColor: seasonalIndex.map(v =>
                        v >= avgSeasonalPct ? brand.color + "cc" : "#e2e8f0"
                      ),
                      borderRadius: 3,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false as any,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y.toFixed(1)}% of annual revenue` } },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 } },
                      y: { ticks: { callback: (v: any) => `${Number(v).toFixed(0)}%`, font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
                    },
                  }}
                />
              </div>
              <div className="flex gap-5 mt-3 flex-wrap">
                {MONTH_KEYS.map((mk, i) => seasonalIndex[i] >= avgSeasonalPct * 1.15 ? (
                  <div key={mk} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: brand.color }} />
                    <span className="text-[11px] font-semibold text-slate-700">{MONTH_LABELS[i]}</span>
                    <span className="text-[11px] text-gray-400">{seasonalIndex[i].toFixed(1)}%</span>
                  </div>
                ) : null)}
                <span className="text-[10px] text-gray-300 self-center">avg {avgSeasonalPct.toFixed(1)}% / month</span>
              </div>
            </div>
          </>
        )}

        {/* ── BLENDED PAID MEDIA ───────────────────────────────────────────── */}
        {hasBlended && (
          <>
            <SectionHeader title={`${brand.name}  ·  Blended Paid Media  ·  Google + Meta`} />
            <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
              <KpiCard
                label="Blended Spend (May 26)"
                value={fmtFull(blendedSpend)}
                spark={blendedSpendSp}
                prevPct={pctOf(blendedSpend, prevBlendSpend)}
                color="#6366f1"
              />
              <KpiCard
                label="Blended Revenue (May 26)"
                value={fmtFull(blendedRev)}
                spark={blendedRevSp}
                prevPct={pctOf(blendedRev, prevBlendRev)}
                color="#6366f1"
              />
              <KpiCard
                label="Blended ROAS"
                value={blendedRoas.toFixed(2) + "×"}
                spark={blendedRoasSp}
                prevPct={pctOf(blendedRoas, prevBlendRoas)}
                color="#6366f1"
              />
              <div className="bg-white p-5">
                <p className="text-gray-400 text-[10px] uppercase tracking-[0.15em] mb-4">Channel split (May)</p>
                {[
                  { label: "Google",  spend: latestAds?.spend ?? 0, rev: latestGRev,          roas: latestAds?.roas ?? 0, color: "#4285F4" },
                  { label: "Meta",    spend: latestMeta?.spend ?? 0, rev: latestMeta?.revenue ?? 0, roas: latestMetaRoas, color: "#1877F2" },
                ].map(ch => (
                  <div key={ch.label} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{ch.label}</span>
                      <span className="text-gray-500">{ch.spend > 0 ? `${ch.roas.toFixed(1)}× ROAS` : "—"}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: blendedSpend > 0 ? `${(ch.spend / blendedSpend) * 100}%` : "0%",
                          background: ch.color,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{fmtFull(ch.spend)} spend · {fmtFull(ch.rev)} rev</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── CAC BY CHANNEL ───────────────────────────────────────────────── */}
        {hasBlended && (
          <>
            <SectionHeader title={`${brand.name}  ·  CAC by Channel  ·  Cost per Acquisition`} />
            <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
              <KpiCard
                label="Google CAC (approx)"
                value={hasAds && googleCac > 0 ? fmtFull(googleCac) : "—"}
                spark={googleCacSpark}
                color="#4285F4"
              />
              <KpiCard
                label="Meta CAC (exact)"
                value={hasMeta && metaCac > 0 ? fmtFull(metaCac) : "—"}
                spark={metaCacSpark}
                prevPct={hasMeta ? pctOf(metaCac, prevMetaCac) : null}
                color="#1877F2"
              />
              <KpiCard
                label="Blended CAC"
                value={blendedCac > 0 ? fmtFull(blendedCac) : "—"}
                spark={blendedCacSpark}
                color="#6366f1"
              />
              <div className="bg-white p-5">
                <p className="text-gray-400 text-[10px] uppercase tracking-[0.15em] mb-3">Method</p>
                <div className="space-y-2.5 text-xs text-slate-600">
                  {hasMeta && (
                    <p>
                      <span className="font-semibold text-slate-800">Meta:</span>{" "}
                      spend ÷ purchases <span className="text-emerald-500 text-[10px] font-bold ml-1">exact</span>
                    </p>
                  )}
                  {hasAds && (
                    <p>
                      <span className="font-semibold text-slate-800">Google:</span>{" "}
                      AOV ÷ ROAS <span className="text-amber-500 text-[10px] font-bold ml-1">approx</span>
                    </p>
                  )}
                  <p className="text-gray-400 text-[10px] pt-1 border-t border-gray-50">
                    Lower CAC = more efficient acquisition. Compare channels to optimise budget split.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── GOOGLE ADS ───────────────────────────────────────────────────── */}
        {hasAds && (
          <>
            <SectionHeader title={`${brand.name}  ·  Google Ads  ·  Monthly`} />
            <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
              <KpiCard label="Spend (May 26)"       value={fmtFull(latestAds?.spend ?? 0)}             spark={spendSpark}  prevPct={pctOf(latestAds?.spend ?? 0, prevAds?.spend ?? 0)} />
              <KpiCard label="Revenue (May 26)"     value={fmtFull(latestGRev)}                        spark={gRevSpark}   prevPct={pctOf(latestGRev, prevGRev)} />
              <KpiCard label="ROAS"                 value={(latestAds?.roas ?? 0).toFixed(2) + "×"}   spark={roasSpark}   prevPct={pctOf(latestAds?.roas ?? 0, prevAds?.roas ?? 0)} />
              <KpiCard label="Clicks"               value={(latestAds?.clicks ?? 0).toLocaleString()}  spark={clicksSpark} prevPct={pctOf(latestAds?.clicks ?? 0, prevAds?.clicks ?? 0)} />
              <KpiCard label="Impressions"          value={((latestAds?.impressions ?? 0) / 1000).toFixed(0) + "K"} spark={imprSpark} prevPct={pctOf(latestAds?.impressions ?? 0, prevAds?.impressions ?? 0)} />
            </div>
          </>
        )}

        {/* ── GOOGLE ADS CAMPAIGNS ─────────────────────────────────────────── */}
        {hasCampaigns && (
          <>
            <SectionHeader title={`${brand.name}  ·  Google Ads  ·  Campaigns  ·  May 26`} />
            <div className="bg-white border-b border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Campaign", "Spend", "vs Apr", "Clicks", "Conversions", "Conv Value", "ROAS"].map(h => (
                      <th key={h} className={`${h === "Campaign" ? "text-left" : "text-right"} px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campLatest.map(c => {
                    const prev     = campPrev.find(p => p.campaign_name === c.campaign_name);
                    const spendChg = prev && prev.spend > 0 ? ((c.spend - prev.spend) / prev.spend) * 100 : null;
                    const roas     = c.spend > 0 ? c.conv_value / c.spend : 0;
                    return (
                      <tr key={c.campaign_name} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-2.5 text-slate-700 font-medium max-w-xs truncate">{c.campaign_name}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtFull(c.spend)}</td>
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          {spendChg !== null ? (
                            <span className={`text-xs font-semibold ${spendChg >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {spendChg >= 0 ? "+" : ""}{spendChg.toFixed(1)}%
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{c.clicks.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{c.conversions > 0 ? c.conversions.toFixed(1) : "—"}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600 whitespace-nowrap">{c.conv_value > 0 ? fmtFull(c.conv_value) : "—"}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-slate-700">{roas > 0 ? `${roas.toFixed(1)}×` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="px-5 pt-2 pb-3 text-xs font-semibold text-gray-500">Total</td>
                    <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">
                      {fmtFull(campLatest.reduce((s, c) => s + c.spend, 0))}
                    </td>
                    <td />
                    <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">
                      {campLatest.reduce((s, c) => s + c.clicks, 0).toLocaleString()}
                    </td>
                    <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">
                      {campLatest.reduce((s, c) => s + c.conversions, 0).toFixed(1)}
                    </td>
                    <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">
                      {fmtFull(campLatest.reduce((s, c) => s + c.conv_value, 0))}
                    </td>
                    <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">
                      {(() => { const s = campLatest.reduce((a, c) => a + c.spend, 0); const v = campLatest.reduce((a, c) => a + c.conv_value, 0); return s > 0 ? `${(v/s).toFixed(1)}×` : "—"; })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* ── META ADS ─────────────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Meta Ads  ·  Monthly`} />
        {hasMeta ? (
          <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard label="Spend (May 26)"    value={fmtFull(latestMeta?.spend ?? 0)}       spark={metaSpendSp}  prevPct={pctOf(latestMeta?.spend ?? 0, prevMeta?.spend ?? 0)} />
            <KpiCard label="Revenue (May 26)"  value={fmtFull(latestMeta?.revenue ?? 0)}     spark={metaRevSp}    prevPct={pctOf(latestMeta?.revenue ?? 0, prevMeta?.revenue ?? 0)} />
            <KpiCard label="ROAS"              value={latestMetaRoas.toFixed(2) + "×"}       spark={metaRoasSp}   prevPct={pctOf(latestMetaRoas, prevMetaRoas)} />
            <KpiCard label="Purchases"         value={(latestMeta?.purchases ?? 0).toLocaleString()} spark={metaPurchSp}  prevPct={pctOf(latestMeta?.purchases ?? 0, prevMeta?.purchases ?? 0)} />
            <KpiCard label="Clicks"            value={(latestMeta?.clicks ?? 0).toLocaleString()}    spark={metaClicksSp} prevPct={pctOf(latestMeta?.clicks ?? 0, prevMeta?.clicks ?? 0)} />
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">Meta Ads not yet connected for {brand.name}</p>
            <p className="text-xs text-gray-300 mt-1.5">Add <code className="bg-gray-100 px-1 rounded">metaAdAccountId</code> to stores.config.json, then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_meta.py</code></p>
          </div>
        )}

        {/* ── META PLATFORM BREAKDOWN ───────────────────────────────────────── */}
        {hasPlatform && latestPlatRows.length > 0 && (
          <>
            <SectionHeader title={`${brand.name}  ·  Meta Ads  ·  Platform Breakdown  ·  May 26`} />
            <div className="bg-white border-b border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Platform","Spend","Revenue","ROAS","Purchases","Clicks","Impressions"].map(h => (
                      <th key={h} className={`${h === "Platform" ? "text-left" : "text-right"} px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PLATFORMS.filter(p => latestPlatRows.some(r => r.platform === p.id)).map(p => {
                    const r = latestPlatRows.find(row => row.platform === p.id)!;
                    const roas = r.spend > 0 ? r.revenue / r.spend : 0;
                    const ICON_BG: Record<string, string> = { facebook: "#1877F2", instagram: "#E1306C", messenger: "#0084FF", audience_network: "#6366f1" };
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3 flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded text-white text-[9px] font-bold flex items-center justify-center shrink-0" style={{ background: ICON_BG[p.id] ?? "#888" }}>{p.icon.toUpperCase()}</span>
                          <span className="font-medium text-slate-700">{p.label}</span>
                        </td>
                        <td className="px-6 py-3 text-right text-slate-600">{fmtFull(r.spend)}</td>
                        <td className="px-6 py-3 text-right font-semibold text-slate-800">{fmtFull(r.revenue)}</td>
                        <td className="px-6 py-3 text-right text-slate-600">{roas.toFixed(2)}×</td>
                        <td className="px-6 py-3 text-right text-slate-600">{r.purchases.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-slate-600">{r.clicks.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-slate-600">{(r.impressions / 1000).toFixed(0)}K</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── INSTAGRAM ORGANIC ─────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Instagram  ·  Organic`} />
        {hasIg ? (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard label="Followers"                value={(latestIg?.followers ?? 0).toLocaleString()}       spark={igFollSpark}  color="#E1306C" />
            <KpiCard label="Reach (May 26)"           value={(latestIg?.reach ?? 0).toLocaleString()}           spark={igReachSpark} prevPct={pctOf(latestIg?.reach ?? 0, prevIg?.reach ?? 0)} color="#E1306C" />
            <KpiCard label="Profile Views (May 26)"   value={(latestIg?.profile_views ?? 0).toLocaleString()}   spark={igPvSpark}    prevPct={pctOf(latestIg?.profile_views ?? 0, prevIg?.profile_views ?? 0)} color="#E1306C" />
            <KpiCard label="Accounts Engaged (May 26)" value={(latestIg?.accounts_engaged ?? 0).toLocaleString()} spark={igEngSpark}  prevPct={pctOf(latestIg?.accounts_engaged ?? 0, prevIg?.accounts_engaged ?? 0)} color="#E1306C" />
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">Instagram organic not yet connected for {brand.name}</p>
            <p className="text-xs text-gray-300 mt-1.5">Add <code className="bg-gray-100 px-1 rounded">instagramAccountId</code> to stores.config.json, then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_instagram.py</code></p>
          </div>
        )}

        {/* ── KLAVIYO ──────────────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Klaviyo  ·  Email Marketing`} />
        {hasKlaviyo ? (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard label="Subscribers"       value={(latestKl?.list_size ?? 0).toLocaleString()}          spark={klListSpark}  color="#7c3aed" />
            <KpiCard label="Open Rate (May 26)" value={`${(latestKl?.open_rate ?? 0).toFixed(1)}%`}         spark={klOpenSpark}  prevPct={pctOf(latestKl?.open_rate ?? 0, prevKl?.open_rate ?? 0)} color="#7c3aed" />
            <KpiCard label="Click Rate (May 26)" value={`${(latestKl?.click_rate ?? 0).toFixed(1)}%`}       spark={klClickSpark} prevPct={pctOf(latestKl?.click_rate ?? 0, prevKl?.click_rate ?? 0)} color="#7c3aed" />
            <KpiCard label="Revenue (May 26)"  value={fmtFull(latestKl?.revenue ?? 0)}                      spark={klRevSpark}   prevPct={pctOf(latestKl?.revenue ?? 0, prevKl?.revenue ?? 0)} color="#7c3aed" />
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">Klaviyo not yet connected for {brand.name}</p>
            <p className="text-xs text-gray-300 mt-1.5">Add <code className="bg-gray-100 px-1 rounded">klaviyoApiKey</code> + <code className="bg-gray-100 px-1 rounded">klaviyoListId</code> to stores.config.json, then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_klaviyo.py</code></p>
          </div>
        )}

        {/* ── MARKETING BUDGET ─────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Marketing Budget  ·  FY 2025–26`} />
        {hasBudgets ? (
          <div className="bg-white border-b border-gray-100 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Budget by channel table */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-3">Annual budget by channel</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold pr-3">Channel</th>
                      <th className="text-right pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold pr-3">Budget</th>
                      <th className="text-right pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold pr-3">Actual</th>
                      <th className="text-right pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold w-28">Pacing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {budgets.sort((a, b) => b.annual_budget - a.annual_budget).map(b => {
                      const color    = CHANNEL_COLORS[b.channel] ?? "#94a3b8";
                      const isLive   = b.channel === "Google Advertising" || b.channel === "Social Media (Meta)";
                      const actual   = getActual(b.channel);
                      const hasActual = actual > 0;
                      const utilPct  = b.annual_budget > 0 ? Math.min((actual / b.annual_budget) * 100, 110) : 0;
                      return (
                        <tr key={b.channel}>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                              <span className="text-slate-700 font-medium">{b.channel}</span>
                              {isLive && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1 rounded font-bold">LIVE</span>}
                            </div>
                          </td>
                          <td className="py-2 text-right text-slate-600 whitespace-nowrap pr-3">{fmtFull(b.annual_budget)}</td>
                          <td className="py-2 text-right text-slate-600 whitespace-nowrap pr-3">
                            {hasActual ? fmtFull(actual) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2 w-28">
                            {hasActual ? (
                              <div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(utilPct, 100)}%`, background: utilPct > 100 ? "#ef4444" : utilPct > 80 ? "#f59e0b" : color }} />
                                </div>
                                <p className="text-[9px] text-gray-400 mt-0.5 text-right">{utilPct.toFixed(0)}% of budget</p>
                              </div>
                            ) : (
                              <p className="text-[9px] text-gray-300 text-right">no actuals yet</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="pt-2 text-xs font-semibold text-gray-500">Total</td>
                      <td className="pt-2 text-right font-bold text-slate-800 pr-3">{fmtFull(budgets.reduce((s, b) => s + b.annual_budget, 0))}</td>
                      <td className="pt-2 text-right font-bold text-slate-800 pr-3">{fmtFull(budgets.reduce((s, b) => s + getActual(b.channel), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Donut-style budget split visual */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-3">Budget split</p>
                <div className="space-y-2">
                  {budgets.sort((a, b) => b.annual_budget - a.annual_budget).map(b => {
                    const color = CHANNEL_COLORS[b.channel] ?? "#94a3b8";
                    const total = budgets.reduce((s, x) => s + x.annual_budget, 0);
                    const pct   = total > 0 ? (b.annual_budget / total) * 100 : 0;
                    return (
                      <div key={b.channel}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600">{b.channel}</span>
                          <span className="text-gray-400 font-medium">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-4">
                  Google &amp; Meta actuals are live API data. Other channels sync from the Google Sheet actuals tab.
                  Run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_marketing_actuals.py</code> to refresh.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">Marketing budgets not yet synced</p>
            <p className="text-xs text-gray-300 mt-1.5">
              Add <code className="bg-gray-100 px-1 rounded">marketingBudgetGid</code> to stores.config.json, then run{" "}
              <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_marketing_budget.py</code>
            </p>
          </div>
        )}

        {/* ── GA4 ORGANIC ──────────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  GA4  ·  Organic Traffic`} />
        {hasGA4 ? (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard label="Sessions (May 26)"         value={(latestGA4?.sessions ?? 0).toLocaleString()}         spark={ga4SessSpark}  prevPct={pctOf(latestGA4?.sessions ?? 0, prevGA4?.sessions ?? 0)} color="#34a853" />
            <KpiCard label="Organic Sessions (May 26)" value={(latestGA4?.organic_sessions ?? 0).toLocaleString()}  spark={ga4OrgSpark}   prevPct={pctOf(latestGA4?.organic_sessions ?? 0, prevGA4?.organic_sessions ?? 0)} color="#34a853" />
            <KpiCard label="New Users (May 26)"        value={(latestGA4?.new_users ?? 0).toLocaleString()}         spark={ga4UsersSpark} prevPct={pctOf(latestGA4?.new_users ?? 0, prevGA4?.new_users ?? 0)} color="#34a853" />
            <KpiCard label="Engagement Rate (May 26)"  value={`${((latestGA4?.engagement_rate ?? 0) * 100).toFixed(1)}%`} spark={ga4EngSpark.map(v => v * 100)} prevPct={pctOf(latestGA4?.engagement_rate ?? 0, prevGA4?.engagement_rate ?? 0)} color="#34a853" />
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">GA4 not yet connected for {brand.name}</p>
            <p className="text-xs text-gray-300 mt-1.5">Add <code className="bg-gray-100 px-1 rounded">ga4PropertyId</code> to each brand in stores.config.json + set up service account credentials, then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_ga4.py</code></p>
          </div>
        )}

      </div>
    </div>
  );
}
