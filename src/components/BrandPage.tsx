"use client";

import { useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandSummary, BrandMonthly, BrandWeekly, BrandProduct, GoogleAdsRow, MetaAdsRow, MetaAdsPlatformRow, InstagramOrganicRow, WeekLabel } from "@/lib/db";

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
}

export function BrandPage({ brand, summary, monthly, weekly, weekLabels, products, googleAds, metaAds, metaAdsPlatform, instagramOrganic }: Props) {
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
  const mayOrds  = monthlyRows.find(m => m.month_key === LATEST)?.orders  ?? 0;
  const aprOrds  = monthlyRows.find(m => m.month_key === PREV_MO)?.orders ?? 0;
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
  const isWeekly     = period === "weekly";
  const revSpark     = isWeekly ? revWeekly : revMonthly;
  const ordSpark     = isWeekly ? ordWeekly : ordMonthly;
  const aovSpark     = isWeekly ? aovWeekly : aovMonthly;
  const chartLabels  = isWeekly ? sortedWeeks.map(w => w.label) : MONTH_LABELS;

  const currentRev     = isWeekly ? (latestWkD?.revenue ?? 0) : (summary?.last_month_rev ?? 0);
  const currentRevPrev = isWeekly ? pctOf(latestWkD?.revenue ?? 0, prevWkD?.revenue ?? 0) : (summary?.mom_growth ?? null);
  const currentRevYear = isWeekly ? null : (summary?.yoy_growth ?? null);
  const currentOrds    = isWeekly ? (latestWkD?.orders ?? 0) : (summary?.last_month_orders ?? 0);
  const currentOrdsPrev = isWeekly ? pctOf(latestWkD?.orders ?? 0, prevWkD?.orders ?? 0) : pctOf(mayOrds, aprOrds);
  const currentOrdsYear = isWeekly ? null : pctOf(mayOrds, may25Ords);
  const currentAov     = isWeekly
    ? (latestWkD && latestWkD.orders > 0 ? latestWkD.revenue / latestWkD.orders : 0)
    : (summary?.aov ?? 0);
  const periodLabel    = isWeekly ? `Wk ${lastWk?.label ?? ""}` : (summary?.last_month_label ?? "Last Month");

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

  // ── Google Ads (always monthly) ──────────────────────────────────────────
  const spendSpark   = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.spend       ?? 0);
  const roasSpark    = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.roas        ?? 0);
  const clicksSpark  = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.clicks      ?? 0);
  const imprSpark    = MONTH_KEYS.map(mk => adsRows.find(d => d.month_key === mk)?.impressions ?? 0);
  const gRevSpark    = MONTH_KEYS.map(mk => { const r = adsRows.find(d => d.month_key === mk); return r ? r.roas * r.spend : 0; });
  const latestAds    = adsRows.find(d => d.month_key === LATEST);
  const prevAds      = adsRows.find(d => d.month_key === PREV_MO);
  const hasAds       = adsRows.length > 0;
  const latestGRev   = (latestAds?.roas ?? 0) * (latestAds?.spend ?? 0);
  const prevGRev     = (prevAds?.roas ?? 0) * (prevAds?.spend ?? 0);

  // ── Meta Ads (always monthly) ────────────────────────────────────────────
  const metaRows      = metaAds.filter(d => d.brand_id === brand.id);
  const hasMeta       = metaRows.length > 0;
  const metaSpendSp   = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.spend     ?? 0);
  const metaClicksSp  = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.clicks    ?? 0);
  const metaPurchSp   = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.purchases ?? 0);
  const metaRevSp     = MONTH_KEYS.map(mk => metaRows.find(d => d.month_key === mk)?.revenue   ?? 0);
  const latestMeta    = metaRows.find(d => d.month_key === LATEST);
  const prevMeta      = metaRows.find(d => d.month_key === PREV_MO);
  const metaRoasSp    = MONTH_KEYS.map(mk => {
    const r = metaRows.find(d => d.month_key === mk);
    return r && r.spend > 0 ? r.revenue / r.spend : 0;
  });
  const latestMetaRoas = latestMeta && latestMeta.spend > 0 ? latestMeta.revenue / latestMeta.spend : 0;
  const prevMetaRoas   = prevMeta   && prevMeta.spend   > 0 ? prevMeta.revenue   / prevMeta.spend   : 0;

  // ── Meta Ads Platform Breakdown ──────────────────────────────────────────
  const platRows    = metaAdsPlatform.filter(d => d.brand_id === brand.id);
  const hasPlatform = platRows.length > 0;
  const PLATFORMS: { id: string; label: string; icon: string }[] = [
    { id: "facebook",         label: "Facebook",         icon: "f" },
    { id: "instagram",        label: "Instagram",        icon: "ig" },
    { id: "messenger",        label: "Messenger",        icon: "m" },
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

  return (
    <div className="bg-gray-50 min-h-screen pb-16">
      <div className="max-w-screen-2xl mx-auto">

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

        {/* ── GOOGLE ADS ───────────────────────────────────────────────────── */}
        {hasAds && (
          <>
            <SectionHeader title={`${brand.name}  ·  Google Ads  ·  Monthly`} />
            <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
              <KpiCard
                label="Spend (May 26)"
                value={fmtFull(latestAds?.spend ?? 0)}
                spark={spendSpark}
                prevPct={pctOf(latestAds?.spend ?? 0, prevAds?.spend ?? 0)}
              />
              <KpiCard
                label="Revenue (May 26)"
                value={fmtFull(latestGRev)}
                spark={gRevSpark}
                prevPct={pctOf(latestGRev, prevGRev)}
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

        {/* ── META ADS ─────────────────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Meta Ads  ·  Monthly`} />
        {hasMeta ? (
          <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard
              label="Spend (May 26)"
              value={fmtFull(latestMeta?.spend ?? 0)}
              spark={metaSpendSp}
              prevPct={pctOf(latestMeta?.spend ?? 0, prevMeta?.spend ?? 0)}
            />
            <KpiCard
              label="Revenue (May 26)"
              value={fmtFull(latestMeta?.revenue ?? 0)}
              spark={metaRevSp}
              prevPct={pctOf(latestMeta?.revenue ?? 0, prevMeta?.revenue ?? 0)}
            />
            <KpiCard
              label="ROAS"
              value={latestMetaRoas.toFixed(2) + "×"}
              spark={metaRoasSp}
              prevPct={pctOf(latestMetaRoas, prevMetaRoas)}
            />
            <KpiCard
              label="Purchases"
              value={(latestMeta?.purchases ?? 0).toLocaleString()}
              spark={metaPurchSp}
              prevPct={pctOf(latestMeta?.purchases ?? 0, prevMeta?.purchases ?? 0)}
            />
            <KpiCard
              label="Clicks"
              value={(latestMeta?.clicks ?? 0).toLocaleString()}
              spark={metaClicksSp}
              prevPct={pctOf(latestMeta?.clicks ?? 0, prevMeta?.clicks ?? 0)}
            />
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">Meta Ads not yet connected for {brand.name}</p>
            <p className="text-xs text-gray-300 mt-1.5">
              Add <code className="bg-gray-100 px-1 rounded">metaAdAccountId</code> to this brand in stores.config.json,
              then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_meta.py</code>
            </p>
          </div>
        )}

        {/* ── META PLATFORM BREAKDOWN ───────────────────────────────────── */}
        {hasPlatform && latestPlatRows.length > 0 && (
          <>
            <SectionHeader title={`${brand.name}  ·  Meta Ads  ·  Platform Breakdown  ·  May 26`} />
            <div className="bg-white border-b border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">Platform</th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">Spend</th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">Revenue</th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">ROAS</th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">Purchases</th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">Clicks</th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">Impressions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PLATFORMS.filter(p => latestPlatRows.some(r => r.platform === p.id)).map(p => {
                    const r = latestPlatRows.find(row => row.platform === p.id)!;
                    const roas = r.spend > 0 ? r.revenue / r.spend : 0;
                    const ICON_BG: Record<string, string> = {
                      facebook: "#1877F2", instagram: "#E1306C", messenger: "#0084FF", audience_network: "#6366f1",
                    };
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3 flex items-center gap-2.5">
                          <span
                            className="w-6 h-6 rounded text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                            style={{ background: ICON_BG[p.id] ?? "#888" }}
                          >
                            {p.icon.toUpperCase()}
                          </span>
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

        {/* ── INSTAGRAM ORGANIC ─────────────────────────────────────────── */}
        <SectionHeader title={`${brand.name}  ·  Instagram  ·  Organic`} />
        {hasIg ? (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shadow-sm">
            <KpiCard
              label="Followers"
              value={(latestIg?.followers ?? 0).toLocaleString()}
              spark={igFollSpark}
            />
            <KpiCard
              label="Reach (May 26)"
              value={(latestIg?.reach ?? 0).toLocaleString()}
              spark={igReachSpark}
              prevPct={pctOf(latestIg?.reach ?? 0, prevIg?.reach ?? 0)}
            />
            <KpiCard
              label="Profile Views (May 26)"
              value={(latestIg?.profile_views ?? 0).toLocaleString()}
              spark={igPvSpark}
              prevPct={pctOf(latestIg?.profile_views ?? 0, prevIg?.profile_views ?? 0)}
            />
            <KpiCard
              label="Accounts Engaged (May 26)"
              value={(latestIg?.accounts_engaged ?? 0).toLocaleString()}
              spark={igEngSpark}
              prevPct={pctOf(latestIg?.accounts_engaged ?? 0, prevIg?.accounts_engaged ?? 0)}
            />
          </div>
        ) : (
          <div className="bg-white border-b border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400 font-medium">Instagram organic not yet connected for {brand.name}</p>
            <p className="text-xs text-gray-300 mt-1.5">
              Add <code className="bg-gray-100 px-1 rounded">instagramAccountId</code> to this brand in stores.config.json,
              then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_instagram.py</code>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
