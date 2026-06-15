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
import { fmt } from "@/lib/format";

type TabId = "brands" | "shopify" | "google-ads" | "meta-ads" | "tradeshows" | "budget";

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
  kpis: { label: string; value: string; sub: string }[];
}

export function DashboardTabs({
  brands, summaries, monthly, weekly, products,
  tradeshows, tradeshowBrands, tradeshowSales,
  weekLabels, googleAds, metaAds, metaAdsPlatform,
  instagramOrganic, targets, klaviyo, ga4,
  marketingBudgets, marketingActuals, googleAdsCampaigns, kpis,
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

              {/* Brand breakdown table — only when all brands shown */}
              {brandFilter === "all" && (() => {
                const PREV = "2026-04";
                const rows = brands
                  .filter((b: any) => b.live)
                  .map((b: any) => {
                    const cur  = googleAds.find((d: any) => d.brand_id === b.id && d.month_key === LATEST);
                    const prev = googleAds.find((d: any) => d.brand_id === b.id && d.month_key === PREV);
                    return { brand: b, cur, prev };
                  })
                  .filter(r => r.cur)
                  .sort((a, b) => (b.cur?.spend ?? 0) - (a.cur?.spend ?? 0));

                if (!rows.length) return null;

                return (
                  <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-700">Brand Breakdown — May 2026</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            {["Brand", "Spend", "vs Apr", "Revenue", "ROAS", "Clicks", "Impressions"].map(h => (
                              <th key={h} className={`${h === "Brand" ? "text-left" : "text-right"} px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map(({ brand: b, cur, prev }) => {
                            const spendChg = prev && prev.spend > 0 ? ((cur.spend - prev.spend) / prev.spend) * 100 : null;
                            const roasOk   = cur.roas === 0 ? null : cur.roas >= 2 ? "good" : cur.roas >= 1.5 ? "ok" : "bad";
                            return (
                              <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                                    <span className="font-medium text-slate-700">{b.name}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-right text-slate-600 whitespace-nowrap font-medium">{fmt(cur.spend)}</td>
                                <td className="px-5 py-3 text-right whitespace-nowrap">
                                  {spendChg !== null
                                    ? <span className={`text-xs font-semibold ${spendChg >= 0 ? "text-emerald-500" : "text-red-500"}`}>{spendChg >= 0 ? "+" : ""}{spendChg.toFixed(1)}%</span>
                                    : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                <td className="px-5 py-3 text-right text-slate-600 whitespace-nowrap">{cur.roas > 0 ? fmt(cur.spend * cur.roas) : "—"}</td>
                                <td className="px-5 py-3 text-right whitespace-nowrap">
                                  {roasOk === null
                                    ? <span className="text-gray-300 text-xs">—</span>
                                    : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${roasOk === "good" ? "bg-emerald-50 text-emerald-600" : roasOk === "ok" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-500"}`}>{cur.roas.toFixed(2)}×</span>
                                  }
                                </td>
                                <td className="px-5 py-3 text-right text-slate-600">{cur.clicks.toLocaleString()}</td>
                                <td className="px-5 py-3 text-right text-slate-600">{cur.impressions >= 1000 ? `${(cur.impressions / 1000).toFixed(0)}K` : cur.impressions.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200">
                            <td className="px-5 pt-2 pb-3 text-xs font-semibold text-gray-500">Total</td>
                            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmt(rows.reduce((s, r) => s + (r.cur?.spend ?? 0), 0))}</td>
                            <td />
                            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmt(rows.reduce((s, r) => s + (r.cur ? r.cur.spend * r.cur.roas : 0), 0))}</td>
                            <td className="px-5 pt-2 pb-3 text-right">
                              {(() => {
                                const totalSpend = rows.reduce((s, r) => s + (r.cur?.spend ?? 0), 0);
                                const totalRev   = rows.reduce((s, r) => s + (r.cur ? r.cur.spend * r.cur.roas : 0), 0);
                                const blended    = totalSpend > 0 ? totalRev / totalSpend : 0;
                                return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600">{blended.toFixed(2)}×</span>;
                              })()}
                            </td>
                            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">{rows.reduce((s, r) => s + (r.cur?.clicks ?? 0), 0).toLocaleString()}</td>
                            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">{(() => { const t = rows.reduce((s, r) => s + (r.cur?.impressions ?? 0), 0); return t >= 1000 ? `${(t/1000).toFixed(0)}K` : t.toLocaleString(); })()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
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

          <p className="text-center text-xs text-gray-300 pb-4">
            Coolkidz Australia · All revenue figures ex-GST
          </p>
        </main>
      </div>
    </>
  );
}
