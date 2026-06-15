"use client";

import { useState } from "react";
import { SalesChart } from "./SalesChart";
import { GoogleAdsChart } from "./GoogleAdsChart";
import { MetaAdsChart } from "./MetaAdsChart";
import { ProductsTable } from "./ProductsTable";
import { TradeshowAccordion } from "./TradeshowAccordion";
import { BrandCard, type BrandPeriod } from "./BrandCard";
import { Leaderboard } from "./Leaderboard";
import { BrandPage } from "./BrandPage";
import { MarketingBudgetTab } from "./MarketingBudgetTab";
import { MarketingCalendar } from "./MarketingCalendar";
import { fmt } from "@/lib/format";

type TabId = "brands" | "shopify" | "google-ads" | "meta-ads" | "tradeshows" | "budget" | "calendar";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "brands", label: "Brands",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  },
  {
    id: "shopify", label: "Shopify",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>,
  },
  {
    id: "google-ads", label: "Google Ads",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  },
  {
    id: "meta-ads", label: "Meta Ads",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905a3.61 3.61 0 01-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>,
  },
  {
    id: "tradeshows", label: "Tradeshows",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
  {
    id: "budget", label: "Budget",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    id: "calendar", label: "Calendar",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
];

const LATEST = "2026-05";

// ── Brand tiers ──────────────────────────────────────────────────────────────
const BRAND_TIERS: Record<number, "A" | "B" | "C"> = {
  5:  "A", // UPPAbaby
  0:  "A", // Nanit
  8:  "A", // Frida
  // 12: "A", // SmarTrike — coming soon
  1:  "B", // Magic
  2:  "B", // Hannie
  4:  "B", // WonderFold
  3:  "B", // Gaia Baby
  6:  "C", // ZAZU
  10: "C", // Matchstick Monkey
  11: "C", // Mamave
  7:  "C", // MiaMily
  9:  "C", // Coolkidz Australia
};

interface Props {
  brands: any[];
  summaries: any[];
  monthly: any[];
  weekly: any[];
  products: any[];
  tradeshows: any[];
  tradeshowBrands: any[];
  tradeshowSales: any[];
  weekLabels: any[];
  googleAds: any[];
  metaAds: any[];
  metaAdsPlatform: any[];
  instagramOrganic: any[];
  targets: any[];
  klaviyo: any[];
  ga4: any[];
  marketingBudgets: any[];
  marketingActuals: any[];
  googleAdsCampaigns: any[];
  calendarEvents: any[];
  kpis: { label: string; value: string; sub: string }[];
}

export function DashboardTabs({
  brands, summaries, monthly, weekly, products,
  tradeshows, tradeshowBrands, tradeshowSales,
  weekLabels, googleAds, metaAds, metaAdsPlatform,
  instagramOrganic, targets, klaviyo, ga4,
  marketingBudgets, marketingActuals, googleAdsCampaigns, calendarEvents, kpis,
}: Props) {
  const [active, setActive] = useState<TabId>("brands");
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");
  const [brandPeriod, setBrandPeriod] = useState<BrandPeriod>("monthly");

  const summaryMap      = Object.fromEntries(summaries.map((s: any) => [s.brand_id, s]));
  const selectedBrand   = brandFilter !== "all" ? brands.find((b: any) => b.id === brandFilter) : null;
  const selectedSummary = brandFilter !== "all" ? summaries.find((s: any) => s.brand_id === brandFilter) : null;

  const filteredBrands   = brandFilter === "all" ? brands    : brands.filter((b: any) => b.id === brandFilter);
  const filteredMonthly  = brandFilter === "all" ? monthly   : monthly.filter((m: any) => m.brand_id === brandFilter);
  const filteredWeekly   = brandFilter === "all" ? weekly    : weekly.filter((w: any) => w.brand_id === brandFilter);
  const filteredProducts = brandFilter === "all" ? products  : products.filter((p: any) => p.brand_id === brandFilter);
  const filteredAds      = brandFilter === "all" ? googleAds : googleAds.filter((d: any) => d.brand_id === brandFilter);
  const filteredMeta     = brandFilter === "all" ? metaAds   : metaAds.filter((d: any) => d.brand_id === brandFilter);

  const topProducts = [...products].sort((a: any, b: any) => b.gross_sales - a.gross_sales).slice(0, 10);

  function openBrand(id: number) { setBrandFilter(id); setActive("brands"); }
  function goHome() { setBrandFilter("all"); }

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className="fixed top-[57px] left-0 w-[200px] h-[calc(100vh-57px)] bg-white border-r border-gray-200 flex flex-col z-10 overflow-y-auto">
      {selectedBrand && (
        <div className="px-4 py-3 border-b border-gray-100">
          <button
            onClick={goHome}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Brands
          </button>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedBrand.color }} />
            <span className="text-xs font-semibold text-slate-700 truncate">{selectedBrand.name}</span>
          </div>
        </div>
      )}
      <nav className="flex-1 py-3">
        <p className="px-4 text-[9px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-1">Navigation</p>
        {TABS.map(tab => {
          const isActive = active === tab.id && !selectedBrand;
          return (
            <button
              key={tab.id}
              onClick={() => { setActive(tab.id); setBrandFilter("all"); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-600 border-r-2 border-indigo-600 font-medium"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </nav>
      {selectedBrand && (
        <div className="px-4 py-3 border-t border-gray-100">
          <select
            value={String(brandFilter)}
            onChange={e => setBrandFilter(Number(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {brands.map((b: any) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </aside>
  );

  // ── Brand page view ──────────────────────────────────────────────────────────
  if (selectedBrand) {
    return (
      <>
        <Sidebar />
        <div className="ml-[200px]">
          <BrandPage
            brand={selectedBrand}
            summary={selectedSummary ?? undefined}
            monthly={monthly}
            weekly={weekly}
            weekLabels={weekLabels}
            products={products}
            googleAds={googleAds}
            metaAds={metaAds}
            metaAdsPlatform={metaAdsPlatform}
            instagramOrganic={instagramOrganic}
            targets={targets}
            klaviyo={klaviyo}
            ga4={ga4}
            marketingBudgets={marketingBudgets}
            marketingActuals={marketingActuals}
            googleAdsCampaigns={googleAdsCampaigns}
          />
        </div>
      </>
    );
  }

  // ── All-brands tab view ──────────────────────────────────────────────────────
  return (
    <>
      <Sidebar />
      <div className="ml-[200px]">
        <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-8">

          {/* ── Brands ── */}
          {active === "brands" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {kpis.map(kpi => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <p className="text-xs text-gray-400">{kpi.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              <div>
                {/* Period toggle + heading */}
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Brands — click to explore</h2>
                  <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    {(["monthly", "weekly", "fy"] as BrandPeriod[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setBrandPeriod(p)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          brandPeriod === p ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {p === "monthly" ? "Monthly" : p === "weekly" ? "Weekly" : "Full Year"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brand grid — grouped by tier if tiers configured */}
                {(() => {
                  const liveBrands = brands.filter((b: any) => b.live);
                  const hasTiers   = liveBrands.some((b: any) => BRAND_TIERS[b.id]);
                  const tiers: Array<{ label: string; ids: number[] }> = hasTiers
                    ? [
                        { label: "Tier A", ids: liveBrands.filter((b: any) => BRAND_TIERS[b.id] === "A").map((b: any) => b.id) },
                        { label: "Tier B", ids: liveBrands.filter((b: any) => BRAND_TIERS[b.id] === "B").map((b: any) => b.id) },
                        { label: "Tier C", ids: liveBrands.filter((b: any) => BRAND_TIERS[b.id] === "C").map((b: any) => b.id) },
                        { label: "Other",  ids: liveBrands.filter((b: any) => !BRAND_TIERS[b.id]).map((b: any) => b.id) },
                      ].filter(g => g.ids.length > 0)
                    : [{ label: "", ids: liveBrands.map((b: any) => b.id) }];

                  // Sort weeks descending to find latest
                  const sortedWeeks = [...weekLabels].sort((a: any, b: any) => b.week_start.localeCompare(a.week_start));
                  const lastWkStart  = sortedWeeks[0]?.week_start;
                  const prevWkStart  = sortedWeeks[1]?.week_start;

                  return tiers.map(({ label, ids }) => (
                    <div key={label} className={label ? "mb-6" : ""}>
                      {label && (
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {ids.map(id => {
                          const brand   = brands.find((b: any) => b.id === id);
                          if (!brand) return null;
                          const latestIg = instagramOrganic.find((d: any) => d.brand_id === id && d.month_key === LATEST);
                          const latestG  = googleAds.find((d: any) => d.brand_id === id && d.month_key === LATEST);
                          const latestM  = metaAds.find((d: any) => d.brand_id === id && d.month_key === LATEST);
                          const target   = targets.find((t: any) => t.brand_id === id && t.month_key === LATEST);
                          const gRoas    = latestG?.roas ?? 0;
                          const mRoas    = latestM && latestM.spend > 0 ? latestM.revenue / latestM.spend : 0;
                          const sum      = summaryMap[id];

                          // Period-specific revenue + growth
                          let periodRevenue: number | undefined;
                          let periodGrowth: number | null | undefined;
                          let periodLabel: string | undefined;
                          if (brandPeriod === "weekly") {
                            const wkRev  = weekly.find((w: any) => w.brand_id === id && w.week_start === lastWkStart)?.revenue ?? 0;
                            const prevRev = weekly.find((w: any) => w.brand_id === id && w.week_start === prevWkStart)?.revenue ?? 0;
                            periodRevenue = wkRev;
                            periodGrowth  = prevRev > 0 ? ((wkRev - prevRev) / prevRev) * 100 : null;
                            periodLabel   = sortedWeeks[0] ? `Wk ${new Date(lastWkStart).toLocaleDateString("en-AU", { day:"numeric", month:"short" })}` : "Last week";
                          } else if (brandPeriod === "fy") {
                            periodRevenue = sum?.fy_revenue ?? 0;
                            periodGrowth  = sum?.yoy_growth ?? null;
                            periodLabel   = "FY 2025–26";
                          }

                          return (
                            <BrandCard
                              key={id}
                              brand={brand}
                              summary={sum}
                              onClick={() => openBrand(id)}
                              hasGoogle={googleAds.some((d: any) => d.brand_id === id)}
                              hasMeta={metaAds.some((d: any) => d.brand_id === id)}
                              hasInstagram={instagramOrganic.some((d: any) => d.brand_id === id)}
                              igFollowers={latestIg?.followers}
                              target={target}
                              roasAlert={(gRoas > 0 && gRoas < 1.5) || (mRoas > 0 && mRoas < 1.5)}
                              period={brandPeriod}
                              periodRevenue={periodRevenue}
                              periodGrowth={periodGrowth}
                              periodLabel={periodLabel}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {topProducts.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h2 className="font-semibold text-gray-800 mb-1">Top Products Portfolio-Wide</h2>
                  <p className="text-xs text-gray-400 mb-4">FY 2025–26 gross sales across all brands</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold w-8">#</th>
                          <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Product</th>
                          <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Brand</th>
                          <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {topProducts.map((p: any, i: number) => {
                          const brand = brands.find((b: any) => b.id === p.brand_id);
                          return (
                            <tr key={i} className="hover:bg-gray-50/60 cursor-pointer transition-colors" onClick={() => openBrand(p.brand_id)}>
                              <td className="px-4 py-2.5 text-xs text-gray-400 font-medium">{i + 1}</td>
                              <td className="px-4 py-2.5 text-slate-700 font-medium">{p.title}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: brand?.color ?? "#ccc" }} />
                                  <span className="text-xs text-gray-500">{brand?.name ?? "—"}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmt(p.gross_sales)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Leaderboard
                brands={brands}
                summaries={summaries}
                monthly={monthly}
                googleAds={googleAds}
                metaAds={metaAds}
                instagramOrganic={instagramOrganic}
                onBrandClick={openBrand}
              />
            </>
          )}

          {/* ── Shopify ── */}
          {active === "shopify" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={brandFilter === "all" ? "all" : String(brandFilter)}
                  onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands</option>
                  {brands.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
              </div>
              <SalesChart key={String(brandFilter)} brands={filteredBrands} monthly={filteredMonthly} weekly={filteredWeekly} weekLabels={weekLabels} />

              {/* Shopify brand breakdown cards */}
              {brandFilter === "all" && (() => {
                const MK_ALL = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];

                function Spark({ values, color }: { values: number[]; color: string }) {
                  const max = Math.max(...values, 0.001);
                  const W = 80, H = 28;
                  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * H}`).join(" ");
                  return (
                    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
                      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                    </svg>
                  );
                }

                function Chg({ pct }: { pct: number | null }) {
                  if (pct === null) return <span className="text-[10px] text-gray-300">—</span>;
                  return <span className={`text-[10px] font-semibold ${pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
                }

                const rows = brands
                  .filter((b: any) => b.live)
                  .map((b: any) => {
                    const history = MK_ALL.map(mk => monthly.find((d: any) => d.brand_id === b.id && d.month_key === mk));
                    const cur  = history[history.length - 1];
                    const prev = history[history.length - 2];
                    const sum  = summaries.find((s: any) => s.brand_id === b.id);
                    if (!cur) return null;
                    const aov     = cur.orders > 0 ? cur.revenue / cur.orders : 0;
                    const prevAov = prev && prev.orders > 0 ? prev.revenue / prev.orders : 0;
                    return {
                      brand: b, cur, prev, sum,
                      aov,
                      revSpark:    history.map((r: any) => r?.revenue ?? 0),
                      ordersSpark: history.map((r: any) => r?.orders ?? 0),
                      aovSpark:    history.map((r: any) => r && r.orders > 0 ? r.revenue / r.orders : 0),
                      fySpark:     history.map((_: any, i: number) => {
                        // cumulative FY revenue up to each month
                        return history.slice(0, i + 1).reduce((s: number, r: any) => s + (r?.revenue ?? 0), 0);
                      }),
                      revChg:    prev && prev.revenue > 0   ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null,
                      ordersChg: prev && prev.orders > 0    ? ((cur.orders - prev.orders) / prev.orders) * 100 : null,
                      aovChg:    prev && prevAov > 0        ? ((aov - prevAov) / prevAov) * 100 : null,
                      momGrowth: sum?.mom_growth ?? null,
                    };
                  })
                  .filter(Boolean)
                  .sort((a: any, b: any) => (b.cur?.revenue ?? 0) - (a.cur?.revenue ?? 0));

                if (!rows.length) return null;

                return (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — May 2026</p>
                    {rows.map((r: any) => (
                      <div key={r.brand.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-50" style={{ borderLeft: `3px solid ${r.brand.color}` }}>
                          <span className="text-sm font-bold text-slate-700">{r.brand.name}</span>
                          {r.momGrowth !== null && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-1 ${(r.momGrowth ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                              {(r.momGrowth ?? 0) >= 0 ? "+" : ""}{(r.momGrowth ?? 0).toFixed(1)}% MoM
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 divide-x divide-gray-50">
                          {[
                            { label: "Revenue (May)", value: fmt(r.cur.revenue),           spark: r.revSpark,    chg: r.revChg },
                            { label: "Orders (May)",  value: r.cur.orders.toLocaleString(), spark: r.ordersSpark, chg: r.ordersChg },
                            { label: "AOV",           value: fmt(r.aov),                   spark: r.aovSpark,    chg: r.aovChg },
                            { label: "FY Revenue",    value: fmt(r.sum?.fy_revenue ?? 0),  spark: r.fySpark,     chg: null },
                          ].map(col => (
                            <div key={col.label} className="px-5 py-3">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{col.label}</p>
                              <p className="text-lg font-semibold text-slate-800 leading-none">{col.value}</p>
                              <div className="my-1.5">
                                <Spark values={col.spark} color={r.brand.color} />
                              </div>
                              <p className="text-[10px] text-gray-400">
                                {col.chg !== null ? <>vs Apr <Chg pct={col.chg} /></> : "FY 2025–26"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <ProductsTable brands={filteredBrands} products={filteredProducts} />
            </>
          )}

          {/* ── Google Ads ── */}
          {active === "google-ads" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={brandFilter === "all" ? "all" : String(brandFilter)}
                  onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands</option>
                  {brands.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
              </div>
              <GoogleAdsChart brands={filteredBrands} data={filteredAds} />

              {/* Brand KPI cards — only when all brands shown */}
              {brandFilter === "all" && (() => {
                const PREV    = "2026-04";
                const MK_ALL  = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];

                function Spark({ values, color }: { values: number[]; color: string }) {
                  const max = Math.max(...values, 0.001);
                  const W = 80, H = 28;
                  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * H}`).join(" ");
                  return (
                    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
                      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                    </svg>
                  );
                }

                function Chg({ pct }: { pct: number | null }) {
                  if (pct === null) return <span className="text-[10px] text-gray-300">—</span>;
                  return <span className={`text-[10px] font-semibold ${pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
                }

                const rows = brands
                  .filter((b: any) => b.live)
                  .map((b: any) => {
                    const history = MK_ALL.map(mk => googleAds.find((d: any) => d.brand_id === b.id && d.month_key === mk));
                    const cur  = history[history.length - 1];
                    const prev = history[history.length - 2];
                    if (!cur) return null;
                    const revenue = cur.spend * cur.roas;
                    const prevRev = prev ? prev.spend * prev.roas : 0;
                    return {
                      brand: b, cur, prev,
                      revenue,
                      spendSpark:  history.map(r => r?.spend ?? 0),
                      revSpark:    history.map(r => r ? r.spend * r.roas : 0),
                      roasSpark:   history.map(r => r?.roas ?? 0),
                      clicksSpark: history.map(r => r?.clicks ?? 0),
                      imprSpark:   history.map(r => r?.impressions ?? 0),
                      spendChg:  prev && prev.spend > 0   ? ((cur.spend - prev.spend) / prev.spend) * 100 : null,
                      revChg:    prev && prevRev > 0       ? ((revenue - prevRev) / prevRev) * 100 : null,
                      roasChg:   prev && prev.roas > 0     ? ((cur.roas - prev.roas) / prev.roas) * 100 : null,
                      clicksChg: prev && prev.clicks > 0   ? ((cur.clicks - prev.clicks) / prev.clicks) * 100 : null,
                      imprChg:   prev && prev.impressions > 0 ? ((cur.impressions - prev.impressions) / prev.impressions) * 100 : null,
                    };
                  })
                  .filter(Boolean)
                  .sort((a: any, b: any) => (b.cur.spend ?? 0) - (a.cur.spend ?? 0));

                if (!rows.length) return null;

                const roasBadge = (roas: number) => {
                  if (roas === 0) return <span className="text-gray-300 text-xs">—</span>;
                  const cls = roas >= 2 ? "bg-emerald-50 text-emerald-600" : roas >= 1.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-500";
                  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{roas.toFixed(2)}×</span>;
                };

                const cols = [
                  { label: "Spend",       getValue: (r: any) => fmt(r.cur.spend),                    getSpark: (r: any) => r.spendSpark,  getChg: (r: any) => r.spendChg,  extra: null },
                  { label: "Revenue",     getValue: (r: any) => fmt(r.revenue),                       getSpark: (r: any) => r.revSpark,    getChg: (r: any) => r.revChg,    extra: null },
                  { label: "ROAS",        getValue: (r: any) => roasBadge(r.cur.roas),                getSpark: (r: any) => r.roasSpark,   getChg: (r: any) => r.roasChg,   extra: null },
                  { label: "Clicks",      getValue: (r: any) => r.cur.clicks.toLocaleString(),        getSpark: (r: any) => r.clicksSpark, getChg: (r: any) => r.clicksChg, extra: null },
                  { label: "Impressions", getValue: (r: any) => `${(r.cur.impressions/1000).toFixed(0)}K`, getSpark: (r: any) => r.imprSpark, getChg: (r: any) => r.imprChg, extra: null },
                ];

                return (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — May 2026</p>
                    {rows.map((r: any) => (
                      <div key={r.brand.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Brand header bar */}
                        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-50" style={{ borderLeft: `3px solid ${r.brand.color}` }}>
                          <span className="text-sm font-bold text-slate-700">{r.brand.name}</span>
                        </div>
                        {/* KPI columns */}
                        <div className="grid grid-cols-5 divide-x divide-gray-50">
                          {cols.map(col => (
                            <div key={col.label} className="px-5 py-3">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{col.label}</p>
                              <p className="text-lg font-semibold text-slate-800 leading-none">{col.getValue(r)}</p>
                              <div className="my-1.5">
                                <Spark values={col.getSpark(r)} color={r.brand.color} />
                              </div>
                              <p className="text-[10px] text-gray-400">vs Apr <Chg pct={col.getChg(r)} /></p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}

          {/* ── Meta Ads ── */}
          {active === "meta-ads" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={brandFilter === "all" ? "all" : String(brandFilter)}
                  onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands</option>
                  {brands.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
              </div>
              <MetaAdsChart brands={filteredBrands} data={filteredMeta} />

              {/* Brand KPI cards — only when all brands shown */}
              {brandFilter === "all" && (() => {
                const MK_ALL = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];

                function Spark({ values, color }: { values: number[]; color: string }) {
                  const max = Math.max(...values, 0.001);
                  const W = 80, H = 28;
                  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * H}`).join(" ");
                  return (
                    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
                      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                    </svg>
                  );
                }

                function Chg({ pct }: { pct: number | null }) {
                  if (pct === null) return <span className="text-[10px] text-gray-300">—</span>;
                  return <span className={`text-[10px] font-semibold ${pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
                }

                const roasBadge = (roas: number) => {
                  if (roas === 0) return <span className="text-gray-300 text-xs">—</span>;
                  const cls = roas >= 2 ? "bg-emerald-50 text-emerald-600" : roas >= 1.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-500";
                  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{roas.toFixed(2)}×</span>;
                };

                const rows = brands
                  .filter((b: any) => b.live)
                  .map((b: any) => {
                    const history = MK_ALL.map(mk => metaAds.find((d: any) => d.brand_id === b.id && d.month_key === mk));
                    const cur  = history[history.length - 1];
                    const prev = history[history.length - 2];
                    if (!cur || cur.spend === 0) return null;
                    const roas     = cur.spend > 0 ? cur.revenue / cur.spend : 0;
                    const prevRoas = prev && prev.spend > 0 ? prev.revenue / prev.spend : 0;
                    return {
                      brand: b, cur, roas,
                      spendSpark:    history.map((r: any) => r?.spend ?? 0),
                      revSpark:      history.map((r: any) => r?.revenue ?? 0),
                      roasSpark:     history.map((r: any) => r && r.spend > 0 ? r.revenue / r.spend : 0),
                      purchSpark:    history.map((r: any) => r?.purchases ?? 0),
                      spendChg:  prev && prev.spend > 0     ? ((cur.spend - prev.spend) / prev.spend) * 100 : null,
                      revChg:    prev && prev.revenue > 0   ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null,
                      roasChg:   prevRoas > 0               ? ((roas - prevRoas) / prevRoas) * 100 : null,
                      purchChg:  prev && prev.purchases > 0 ? ((cur.purchases - prev.purchases) / prev.purchases) * 100 : null,
                    };
                  })
                  .filter(Boolean)
                  .sort((a: any, b: any) => (b.cur.spend ?? 0) - (a.cur.spend ?? 0));

                if (!rows.length) return null;

                const cols = [
                  { label: "Spend",     getValue: (r: any) => fmt(r.cur.spend),                        getSpark: (r: any) => r.spendSpark, getChg: (r: any) => r.spendChg },
                  { label: "Revenue",   getValue: (r: any) => fmt(r.cur.revenue),                       getSpark: (r: any) => r.revSpark,   getChg: (r: any) => r.revChg },
                  { label: "ROAS",      getValue: (r: any) => roasBadge(r.roas),                        getSpark: (r: any) => r.roasSpark,  getChg: (r: any) => r.roasChg },
                  { label: "Purchases", getValue: (r: any) => (r.cur.purchases ?? 0).toLocaleString(),  getSpark: (r: any) => r.purchSpark, getChg: (r: any) => r.purchChg },
                ];

                return (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — May 2026</p>
                    {rows.map((r: any) => (
                      <div key={r.brand.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-50" style={{ borderLeft: `3px solid ${r.brand.color}` }}>
                          <span className="text-sm font-bold text-slate-700">{r.brand.name}</span>
                        </div>
                        <div className="grid grid-cols-4 divide-x divide-gray-50">
                          {cols.map(col => (
                            <div key={col.label} className="px-5 py-3">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{col.label}</p>
                              <p className="text-lg font-semibold text-slate-800 leading-none">{col.getValue(r)}</p>
                              <div className="my-1.5">
                                <Spark values={col.getSpark(r)} color={r.brand.color} />
                              </div>
                              <p className="text-[10px] text-gray-400">vs Apr <Chg pct={col.getChg(r)} /></p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}

          {/* ── Tradeshows ── */}
          {active === "tradeshows" && (
            <TradeshowAccordion
              tradeshows={tradeshows}
              tradeshowBrands={tradeshowBrands}
              tradeshowSales={tradeshowSales}
              brands={brands}
            />
          )}

          {/* ── Budget ── */}
          {active === "budget" && (
            <MarketingBudgetTab
              brands={brands}
              marketingBudgets={marketingBudgets}
              marketingActuals={marketingActuals}
              googleAds={googleAds}
              metaAds={metaAds}
              monthly={monthly}
            />
          )}

          {/* ── Calendar ── */}
          {active === "calendar" && (
            <MarketingCalendar events={calendarEvents} brands={brands} />
          )}

          <p className="text-center text-xs text-gray-300 pb-4">
            Coolkidz Australia · All revenue figures ex-GST
          </p>
        </main>
      </div>
    </>
  );
}
