"use client";

import { useState, useEffect } from "react";
import { SalesChart } from "./SalesChart";
import { GoogleAdsChart } from "./GoogleAdsChart";
import { MetaAdsChart } from "./MetaAdsChart";
import { EmailChart } from "./EmailChart";
import { EmailBrandDetail } from "./EmailBrandDetail";
import { BrandReport } from "./BrandReport";
import { buildReport } from "@/lib/report";
import { GoogleCampaignTable, MetaPlatformBreakdown } from "./ChannelBrandDetail";
import { CampaignCalendar } from "./CampaignCalendar";
import { SeoPanel } from "./SeoPanel";
import { ProductsTable } from "./ProductsTable";
import { TradeshowAccordion } from "./TradeshowAccordion";
import { BrandCard, type BrandPeriod } from "./BrandCard";
import { Leaderboard } from "./Leaderboard";
import { BrandPage } from "./BrandPage";
import { MarketingBudgetTab } from "./MarketingBudgetTab";
import { MarketingCalendar } from "./MarketingCalendar";
import { ContentPlanner } from "./ContentPlanner";
import { InfluencerTracker } from "./InfluencerTracker";
import { TeamPanel } from "./TeamPanel";
import { BoothFunnel } from "./BoothFunnel";
import { SalesTargetTracker } from "./SalesTargetTracker";
import { ShopifyInsights } from "./ShopifyInsights";
import { fmt } from "@/lib/format";
import { type FY, FY_LIST, FY_LABEL, fyMonthKeys, fyMonthLabels, fyLatestMonth, fyPrevMonth, currentFY, monthLabel } from "@/lib/fy";

type TabId = "brands" | "campaign-calendar" | "report" | "shopify" | "google-ads" | "meta-ads" | "email" | "seo" | "tradeshows" | "budget" | "calendar" | "content" | "influencer" | "team";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "brands", label: "Brands",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  },
  {
    id: "campaign-calendar", label: "Campaign Calendar",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>,
  },
  {
    id: "report", label: "Report",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
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
    id: "email", label: "Email",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  },
  {
    id: "seo", label: "SEO",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
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
  {
    id: "content", label: "Content",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
  {
    id: "influencer", label: "Influencer",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>,
  },
  {
    id: "team", label: "Team",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 00-3-3.87" /></svg>,
  },
];


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
  gscMetrics: any[];
  gscQueries: any[];
  gscInsights: any[];
  boothFunnel: any;
  kpis: { label: string; value: string; sub: string }[];
  role?: "admin" | "member";
  allowedTabs?: string[];
}

export function DashboardTabs({
  brands, summaries, monthly, weekly, products,
  tradeshows, tradeshowBrands, tradeshowSales,
  weekLabels, googleAds, metaAds, metaAdsPlatform,
  instagramOrganic, targets, klaviyo, ga4,
  marketingBudgets, marketingActuals, googleAdsCampaigns, calendarEvents, boothFunnel, kpis,
  gscMetrics, gscQueries, gscInsights,
  role = "admin", allowedTabs,
}: Props) {
  // Financial tabs (cost / margin / budget) are admin-only even if otherwise granted.
  const FINANCIAL = ["budget", "influencer"];
  // Tabs this user may open (admin → all). Filter the nav + guard the active tab.
  const visibleTabs = role === "admin"
    ? TABS
    : TABS.filter(t => (allowedTabs ?? []).includes(t.id) && !FINANCIAL.includes(t.id));
  const firstTab = (visibleTabs[0]?.id ?? "brands") as TabId;
  const [active, setActive] = useState<TabId>(firstTab);
  // One brand selection, shared across every tab — pick a brand once and it
  // persists as you move between Shopify / Google / Meta / Email / Report.
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");
  const [brandPeriod, setBrandPeriod] = useState<BrandPeriod>("monthly");
  const [fy, setFy] = useState<FY>(currentFY());

  // FY-derived month range + headline month, shared with every page
  const monthKeys   = fyMonthKeys(fy);
  const monthLabels = fyMonthLabels(fy);
  const presentKeys = monthly.map((m: any) => m.month_key);
  const fyLatest    = fyLatestMonth(fy, presentKeys);
  const fyLatestIdx = Math.max(0, monthKeys.indexOf(fyLatest));
  // Months you can step back to (up to the latest with data)
  const monthOptions = monthKeys.slice(0, fyLatestIdx + 1);

  // Chosen "current month" — defaults to the latest, resets when FY changes
  const [monthSel, setMonthSel] = useState<string>(fyLatest);
  useEffect(() => { setMonthSel(fyLatestMonth(fy, monthly.map((m: any) => m.month_key))); }, [fy]); // eslint-disable-line react-hooks/exhaustive-deps

  const wholeYear   = monthSel === "all"; // "Full Year" — aggregate the whole FY
  const LATEST      = (!wholeYear && monthOptions.includes(monthSel)) ? monthSel : fyLatest;
  const PREV_MO     = fyPrevMonth(fy, LATEST);
  const latestI     = monthKeys.indexOf(LATEST); // index of selected month within the FY
  const fyLabel     = FY_LABEL[fy];
  const latestLabel = monthLabel(LATEST);
  const prevLabel   = monthLabel(PREV_MO);
  const fySum       = (arr: number[]) => arr.reduce((s, v) => s + (v ?? 0), 0);

  // Restrict month-keyed datasets to the selected FY before anything renders
  const inFy = (rows: any[]) => rows.filter((r: any) => monthKeys.includes(r.month_key));
  monthly          = inFy(monthly);
  googleAds        = inFy(googleAds);
  metaAds          = inFy(metaAds);
  metaAdsPlatform  = inFy(metaAdsPlatform);
  instagramOrganic = inFy(instagramOrganic);
  targets          = inFy(targets);
  klaviyo          = inFy(klaviyo);
  ga4              = inFy(ga4);
  gscMetrics       = inFy(gscMetrics);
  gscQueries       = inFy(gscQueries);
  marketingActuals = inFy(marketingActuals);
  googleAdsCampaigns = inFy(googleAdsCampaigns);
  marketingBudgets = marketingBudgets.filter((b: any) => (b.fy ?? "2025-26") === fy);

  const summaryMap      = Object.fromEntries(summaries.map((s: any) => [s.brand_id, s]));
  const selectedBrand   = brandFilter !== "all" ? brands.find((b: any) => b.id === brandFilter) : null;
  const selectedSummary = brandFilter !== "all" ? summaries.find((s: any) => s.brand_id === brandFilter) : null;

  const filteredBrands   = brandFilter === "all" ? brands    : brands.filter((b: any) => b.id === brandFilter);
  const filteredMonthly  = brandFilter === "all" ? monthly   : monthly.filter((m: any) => m.brand_id === brandFilter);
  const filteredWeekly   = brandFilter === "all" ? weekly    : weekly.filter((w: any) => w.brand_id === brandFilter);
  const filteredProducts = brandFilter === "all" ? products  : products.filter((p: any) => p.brand_id === brandFilter);
  const filteredAds      = brandFilter === "all" ? googleAds : googleAds.filter((d: any) => d.brand_id === brandFilter);
  const filteredMeta     = brandFilter === "all" ? metaAds   : metaAds.filter((d: any) => d.brand_id === brandFilter);
  const filteredKlaviyo  = brandFilter === "all" ? klaviyo   : klaviyo.filter((d: any) => d.brand_id === brandFilter);

  const topProducts = [...products].sort((a: any, b: any) => b.gross_sales - a.gross_sales).slice(0, 10);

  // FY-aware headline KPIs (recomputed from the filtered data so they track the toggle)
  const fyRevenue   = monthly.reduce((s: number, m: any) => s + (m.revenue ?? 0), 0);
  const orderRows   = wholeYear ? monthly : monthly.filter((m: any) => m.month_key === LATEST);
  const ordersVal   = orderRows.reduce((s: number, m: any) => s + (m.orders ?? 0), 0);
  const liveCount    = brands.filter((b: any) => b.live).length;
  const fyKpis = [
    { label: `${fyLabel} Revenue`, value: fmt(fyRevenue), sub: "ex-GST, all brands" },
    { label: "Active Brands",      value: String(liveCount), sub: `of ${brands.length} total` },
    { label: `${wholeYear ? fyLabel : latestLabel} Orders`, value: ordersVal.toLocaleString(), sub: wholeYear ? "all months" : fyLabel },
    { label: "Tradeshows",         value: String(tradeshows.length), sub: `${tradeshows.filter((t: any) => new Date() < new Date(t.date_start)).length} upcoming` },
  ];

  function openBrand(id: number) { setBrandFilter(id); setActive("brands"); }
  function goHome() { setBrandFilter("all"); }

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className="fixed top-[57px] left-0 w-[200px] h-[calc(100vh-57px)] bg-white border-r border-gray-200 flex flex-col z-10 overflow-y-auto">
      {/* Financial year + month selectors — global across all pages */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2.5">
        <div>
          <label className="text-[9px] font-semibold text-gray-300 uppercase tracking-[0.18em]">Financial Year</label>
          <select
            value={fy}
            onChange={e => setFy(e.target.value as FY)}
            className="w-full mt-1 text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {FY_LIST.map(f => <option key={f} value={f}>{FY_LABEL[f]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-semibold text-gray-300 uppercase tracking-[0.18em]">Month</label>
          <select
            value={wholeYear ? "all" : LATEST}
            onChange={e => setMonthSel(e.target.value)}
            className="w-full mt-1 text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Full Year</option>
            {[...monthOptions].reverse().map(mk => (
              <option key={mk} value={mk}>{monthLabels[monthKeys.indexOf(mk)]}{mk === fyLatest ? " (latest)" : ""}</option>
            ))}
          </select>
        </div>
      </div>
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
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        <p className="px-2 text-[9px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-1.5">Navigation</p>
        {visibleTabs.map(tab => {
          const isActive = active === tab.id && !(selectedBrand && active === "brands");
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-indigo-50 text-indigo-600 font-semibold shadow-sm ring-1 ring-indigo-100"
                  : "text-gray-500 hover:bg-gray-100/70 hover:text-gray-700"
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
  // Only the Brands tab opens the full brand detail page; on a channel tab,
  // picking a brand filters that channel in place instead of bouncing here.
  if (selectedBrand && active === "brands") {
    return (
      <>
        <Sidebar />
        <div className="ml-[200px]">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setActive("report")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Management Report (PDF)
            </button>
          </div>
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
            monthKeys={monthKeys}
            monthLabels={monthLabels}
            latest={LATEST}
            prevMonth={PREV_MO}
            fyLabel={fyLabel}
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
                {fyKpis.map(kpi => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <p className="text-xs text-gray-400">{kpi.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* Top 5 products — quick summary */}
              {topProducts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Top 5 Products</h2>
                    <span className="text-[11px] text-gray-400">{fyLabel} · gross sales</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {topProducts.slice(0, 5).map((p: any, i: number) => {
                      const brand = brands.find((b: any) => b.id === p.brand_id);
                      return (
                        <button
                          key={i}
                          onClick={() => openBrand(p.brand_id)}
                          className="text-left border border-gray-100 rounded-lg p-3 hover:bg-gray-50/60 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[11px] font-bold text-gray-300">#{i + 1}</span>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brand?.color ?? "#ccc" }} />
                            <span className="text-[11px] text-gray-500 truncate">{brand?.name ?? "—"}</span>
                          </div>
                          <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2 min-h-[2rem]" title={p.title}>{p.title}</p>
                          <p className="text-sm font-bold text-slate-900 mt-1.5">{fmt(p.gross_sales)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
                          const latestIg = instagramOrganic.filter((d: any) => d.brand_id === id && (d.followers ?? 0) > 0).sort((a: any, b: any) => b.month_key.localeCompare(a.month_key))[0];
                          const latestG  = googleAds.find((d: any) => d.brand_id === id && d.month_key === LATEST);
                          const latestM  = metaAds.find((d: any) => d.brand_id === id && d.month_key === LATEST);
                          const target   = targets.find((t: any) => t.brand_id === id && t.month_key === LATEST);
                          const gRoas    = latestG?.roas ?? 0;
                          const mRoas    = latestM && latestM.spend > 0 ? latestM.revenue / latestM.spend : 0;
                          const sum      = summaryMap[id];

                          // Period-specific revenue + growth + pacing
                          let periodRevenue: number | undefined;
                          let periodGrowth: number | null | undefined;
                          let periodLabel: string | undefined;
                          let pacePct: number | null = null;
                          if (brandPeriod === "weekly") {
                            const wkRev  = weekly.find((w: any) => w.brand_id === id && w.week_start === lastWkStart)?.revenue ?? 0;
                            const prevRev = weekly.find((w: any) => w.brand_id === id && w.week_start === prevWkStart)?.revenue ?? 0;
                            periodRevenue = wkRev;
                            periodGrowth  = prevRev > 0 ? ((wkRev - prevRev) / prevRev) * 100 : null;
                            periodLabel   = sortedWeeks[0] ? `Wk ${new Date(lastWkStart).toLocaleDateString("en-AU", { day:"numeric", month:"short" })}` : "Last week";
                          } else if (brandPeriod === "fy" || wholeYear) {
                            // Full year — whole-FY revenue vs whole-FY target
                            const fyRev    = monthly.filter((m: any) => m.brand_id === id).reduce((s: number, m: any) => s + (m.revenue ?? 0), 0);
                            const fyTarget = targets.filter((t: any) => t.brand_id === id).reduce((s: number, t: any) => s + (t.revenue_target ?? 0), 0);
                            periodRevenue = fyRev;
                            periodGrowth  = sum?.yoy_growth ?? null;
                            periodLabel   = fyLabel;
                            pacePct       = fyTarget > 0 ? Math.min((fyRev / fyTarget) * 100, 100) : null;
                          } else {
                            // monthly — reflect the selected month
                            const moRev    = monthly.find((m: any) => m.brand_id === id && m.month_key === LATEST)?.revenue ?? 0;
                            const prevRev  = monthly.find((m: any) => m.brand_id === id && m.month_key === PREV_MO)?.revenue ?? 0;
                            const moTarget = target?.revenue_target ?? 0;
                            periodRevenue = moRev;
                            periodGrowth  = prevRev > 0 ? ((moRev - prevRev) / prevRev) * 100 : null;
                            periodLabel   = latestLabel;
                            pacePct       = moTarget > 0 ? Math.min((moRev / moTarget) * 100, 100) : null;
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
                              pacePct={pacePct}
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
                  <p className="text-xs text-gray-400 mb-4">{fyLabel} gross sales across all brands</p>
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
                monthKeys={monthKeys}
                latest={LATEST}
              />
            </>
          )}

          {/* ── Campaign Calendar (portfolio Now/Next/Later roadmap) ── */}
          {active === "campaign-calendar" && <CampaignCalendar />}

          {/* ── Report (management report, per brand + portfolio, PDF) ── */}
          {active === "report" && (
            <>
              <div className="flex items-center justify-between gap-2 mb-3 no-print">
                <select
                  value={brandFilter === "all" ? "all" : String(brandFilter)}
                  onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands (Portfolio)</option>
                  {brands.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                  Download PDF
                </button>
              </div>
              <BrandReport r={buildReport(brandFilter, {
                brands, summaries, monthly, targets,
                marketingBudgets: marketingBudgets.filter((b: any) => b.fy === fy),
                marketingActuals: marketingActuals.filter((a: any) => monthKeys.includes(a.month_key)),
                googleAds, metaAds, monthKeys, monthLabels, fy,
              })} />
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
              <SalesTargetTracker brands={filteredBrands} monthly={filteredMonthly} targets={targets} monthKeys={monthKeys} monthLabels={monthLabels} latest={LATEST} fyLabel={fyLabel} />

              <SalesChart key={String(brandFilter) + fy} brands={filteredBrands} monthly={filteredMonthly} weekly={filteredWeekly} weekLabels={weekLabels} monthKeys={monthKeys} monthLabels={monthLabels} fyLabel={fyLabel} />

              <ShopifyInsights brands={filteredBrands} monthly={filteredMonthly} summaries={summaries} monthKeys={monthKeys} monthLabels={monthLabels} latest={LATEST} fyLabel={fyLabel} />

              {/* Shopify brand breakdown cards */}
              {brandFilter === "all" && (() => {
                const MK_ALL = monthKeys;

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
                    const revSpark    = history.map((r: any) => r?.revenue ?? 0);
                    const ordersSpark = history.map((r: any) => r?.orders ?? 0);
                    const monthCur = history[latestI];
                    const prev     = wholeYear ? null : history[latestI - 1];
                    if (!wholeYear && !monthCur) return null;
                    const cur = wholeYear ? { revenue: fySum(revSpark), orders: fySum(ordersSpark) } : monthCur;
                    if (wholeYear && cur.revenue === 0) return null;
                    const sum  = summaries.find((s: any) => s.brand_id === b.id);
                    const aov     = cur.orders > 0 ? cur.revenue / cur.orders : 0;
                    const prevAov = prev && prev.orders > 0 ? prev.revenue / prev.orders : 0;
                    return {
                      brand: b, cur, prev, sum,
                      aov,
                      revSpark, ordersSpark,
                      aovSpark:    history.map((r: any) => r && r.orders > 0 ? r.revenue / r.orders : 0),
                      fySpark:     history.map((_: any, i: number) => history.slice(0, i + 1).reduce((s: number, r: any) => s + (r?.revenue ?? 0), 0)),
                      revChg:    wholeYear ? null : (prev && prev.revenue > 0   ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null),
                      ordersChg: wholeYear ? null : (prev && prev.orders > 0    ? ((cur.orders - prev.orders) / prev.orders) * 100 : null),
                      aovChg:    wholeYear ? null : (prev && prevAov > 0        ? ((aov - prevAov) / prevAov) * 100 : null),
                      momGrowth: wholeYear ? null : (sum?.mom_growth ?? null),
                    };
                  })
                  .filter(Boolean)
                  .sort((a: any, b: any) => (b.cur?.revenue ?? 0) - (a.cur?.revenue ?? 0));

                if (!rows.length) return null;

                return (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — {wholeYear ? fyLabel : latestLabel}</p>
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
                                {col.chg !== null ? <>vs {prevLabel} <Chg pct={col.chg} /></> : fyLabel}
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
              <GoogleAdsChart key={fy} brands={filteredBrands} data={filteredAds} monthKeys={monthKeys} monthLabels={monthLabels} latest={LATEST} wholeYear={wholeYear} />

              {/* Brand KPI cards — only when all brands shown */}
              {brandFilter === "all" && (() => {
                const PREV = PREV_MO;
                const MK_ALL = monthKeys;

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
                    const spendSpark  = history.map(r => r?.spend ?? 0);
                    const revSpark    = history.map(r => r ? r.spend * r.roas : 0);
                    const roasSpark   = history.map(r => r?.roas ?? 0);
                    const clicksSpark = history.map(r => r?.clicks ?? 0);
                    const imprSpark   = history.map(r => r?.impressions ?? 0);
                    const monthCur = history[latestI];
                    const prev     = wholeYear ? null : history[latestI - 1];
                    if (!wholeYear && !monthCur) return null;
                    const fySpend = fySum(spendSpark);
                    const cur = wholeYear
                      ? { spend: fySpend, clicks: fySum(clicksSpark), impressions: fySum(imprSpark), roas: fySpend > 0 ? fySum(revSpark) / fySpend : 0 }
                      : monthCur;
                    if (wholeYear && cur.spend === 0) return null;
                    const revenue = wholeYear ? fySum(revSpark) : monthCur.spend * monthCur.roas;
                    const prevRev = prev ? prev.spend * prev.roas : 0;
                    return {
                      brand: b, cur, prev, revenue,
                      spendSpark, revSpark, roasSpark, clicksSpark, imprSpark,
                      spendChg:  wholeYear ? null : (prev && prev.spend > 0   ? ((cur.spend - prev.spend) / prev.spend) * 100 : null),
                      revChg:    wholeYear ? null : (prev && prevRev > 0       ? ((revenue - prevRev) / prevRev) * 100 : null),
                      roasChg:   wholeYear ? null : (prev && prev.roas > 0     ? ((cur.roas - prev.roas) / prev.roas) * 100 : null),
                      clicksChg: wholeYear ? null : (prev && prev.clicks > 0   ? ((cur.clicks - prev.clicks) / prev.clicks) * 100 : null),
                      imprChg:   wholeYear ? null : (prev && prev.impressions > 0 ? ((cur.impressions - prev.impressions) / prev.impressions) * 100 : null),
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
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — {wholeYear ? fyLabel : latestLabel}</p>
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
                              <p className="text-[10px] text-gray-400">vs {prevLabel} <Chg pct={col.getChg(r)} /></p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {brandFilter !== "all" && (
                <GoogleCampaignTable campaigns={googleAdsCampaigns} brandId={brandFilter as number} fyLabel={fyLabel} />
              )}
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
              <MetaAdsChart key={fy} brands={filteredBrands} data={filteredMeta} monthKeys={monthKeys} monthLabels={monthLabels} latest={LATEST} wholeYear={wholeYear} />

              {/* Brand KPI cards — only when all brands shown */}
              {brandFilter === "all" && (() => {
                const MK_ALL = monthKeys;

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
                    const spendSpark = history.map((r: any) => r?.spend ?? 0);
                    const revSpark   = history.map((r: any) => r?.revenue ?? 0);
                    const purchSpark = history.map((r: any) => r?.purchases ?? 0);
                    const monthCur = history[latestI];
                    const prev     = wholeYear ? null : history[latestI - 1];
                    if (!wholeYear && (!monthCur || monthCur.spend === 0)) return null;
                    const fySpend = fySum(spendSpark);
                    const cur = wholeYear
                      ? { spend: fySpend, revenue: fySum(revSpark), purchases: fySum(purchSpark) }
                      : monthCur;
                    if (wholeYear && cur.spend === 0) return null;
                    const roas     = cur.spend > 0 ? cur.revenue / cur.spend : 0;
                    const prevRoas = prev && prev.spend > 0 ? prev.revenue / prev.spend : 0;
                    return {
                      brand: b, cur, roas,
                      spendSpark, revSpark,
                      roasSpark:     history.map((r: any) => r && r.spend > 0 ? r.revenue / r.spend : 0),
                      purchSpark,
                      spendChg:  wholeYear ? null : (prev && prev.spend > 0     ? ((cur.spend - prev.spend) / prev.spend) * 100 : null),
                      revChg:    wholeYear ? null : (prev && prev.revenue > 0   ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null),
                      roasChg:   wholeYear ? null : (prevRoas > 0               ? ((roas - prevRoas) / prevRoas) * 100 : null),
                      purchChg:  wholeYear ? null : (prev && prev.purchases > 0 ? ((cur.purchases - prev.purchases) / prev.purchases) * 100 : null),
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
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — {wholeYear ? fyLabel : latestLabel}</p>
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
                              <p className="text-[10px] text-gray-400">vs {prevLabel} <Chg pct={col.getChg(r)} /></p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {brandFilter !== "all" && (
                <MetaPlatformBreakdown rows={metaAdsPlatform} brandId={brandFilter as number} fyLabel={fyLabel} />
              )}
            </>
          )}

          {/* ── Email (Klaviyo) ── */}
          {active === "email" && (
            <>
              <div className="flex items-center justify-between gap-2 mb-2 no-print">
                <select
                  value={brandFilter === "all" ? "all" : String(brandFilter)}
                  onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands</option>
                  {brands.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
                {brandFilter !== "all" && (
                  <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                    Download PDF
                  </button>
                )}
              </div>
              {brandFilter !== "all" ? (
                <EmailBrandDetail brand={brands.find((b: any) => b.id === brandFilter)!} klaviyo={klaviyo} monthly={monthly} monthKeys={monthKeys} monthLabels={monthLabels} />
              ) : (
              <>
              <EmailChart key={fy} brands={brands} data={klaviyo} monthly={monthly} monthKeys={monthKeys} monthLabels={monthLabels} latest={LATEST} wholeYear={wholeYear} />

              {/* Brand breakdown */}
              {(() => {
                const MK_ALL = monthKeys;

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
                const pctChg = (cur: number, prev: number | null | undefined) =>
                  wholeYear ? null : (prev && prev > 0 ? ((cur - prev) / prev) * 100 : null);

                const rows = brands
                  .map((b: any) => {
                    const history     = MK_ALL.map(mk => klaviyo.find((d: any) => d.brand_id === b.id && d.month_key === mk));
                    const sentSpark   = history.map(r => r?.emails_sent ?? 0);
                    const openSpark   = history.map(r => r?.open_rate   ?? 0);
                    const clickSpark  = history.map(r => r?.click_rate  ?? 0);
                    const revSpark    = history.map(r => r?.revenue     ?? 0);
                    const subSpark    = history.map(r => r?.list_size   ?? 0);
                    const ordersSpark = history.map(r => r?.orders       ?? 0);
                    const unsubSpark  = history.map(r => (r?.emails_sent ?? 0) > 0 ? ((r?.unsubscribes ?? 0) / r!.emails_sent) * 100 : 0);
                    const flowSpark   = history.map(r => r?.flow_revenue ?? 0);
                    const campSpark   = history.map(r => r?.campaign_revenue ?? 0);
                    // Subscribers is a point-in-time count — use the most recent month that has one.
                    const subscribers = [...history].reverse().find(r => (r?.list_size ?? 0) > 0)?.list_size ?? 0;
                    const monthCur = history[latestI];
                    const prev     = wholeYear ? null : history[latestI - 1];
                    if (!wholeYear && (!monthCur || monthCur.emails_sent === 0)) return null;
                    const fySent = fySum(sentSpark);
                    if (wholeYear && fySent === 0) return null;
                    // Blend rates by delivered volume across the FY
                    const fyOpen  = fySent > 0 ? history.reduce((s, r) => s + (r?.open_rate  ?? 0) * (r?.emails_sent ?? 0), 0) / fySent : 0;
                    const fyClick = fySent > 0 ? history.reduce((s, r) => s + (r?.click_rate ?? 0) * (r?.emails_sent ?? 0), 0) / fySent : 0;
                    const cur = wholeYear
                      ? { emails_sent: fySent, open_rate: fyOpen, click_rate: fyClick, revenue: fySum(revSpark),
                          orders: fySum(ordersSpark), unsubscribes: fySum(history.map(r => r?.unsubscribes ?? 0)),
                          flow_revenue: fySum(flowSpark), campaign_revenue: fySum(campSpark) }
                      : monthCur;
                    // Store revenue (Shopify) for the same period → email's share of total
                    const storeRev = wholeYear
                      ? monthly.filter((m: any) => m.brand_id === b.id).reduce((s: number, m: any) => s + (m.revenue ?? 0), 0)
                      : (monthly.find((m: any) => m.brand_id === b.id && m.month_key === LATEST)?.revenue ?? 0);
                    const orders    = cur.orders ?? 0;
                    const aov       = orders > 0 ? cur.revenue / orders : 0;
                    const unsubRate = cur.emails_sent > 0 ? ((cur.unsubscribes ?? 0) / cur.emails_sent) * 100 : 0;
                    const fc        = (cur.flow_revenue ?? 0) + (cur.campaign_revenue ?? 0);
                    const flowShare = fc > 0 ? ((cur.flow_revenue ?? 0) / fc) * 100 : 0;
                    const pctOfRev  = storeRev > 0 ? (cur.revenue / storeRev) * 100 : 0;
                    const storeSpark = MK_ALL.map(mk => monthly.find((m: any) => m.brand_id === b.id && m.month_key === mk)?.revenue ?? 0);
                    const aovSpark   = revSpark.map((r, i) => ordersSpark[i] > 0 ? r / ordersSpark[i] : 0);
                    const flowShareSpark = flowSpark.map((f, i) => (f + campSpark[i]) > 0 ? (f / (f + campSpark[i])) * 100 : 0);
                    const pctSpark   = revSpark.map((r, i) => storeSpark[i] > 0 ? (r / storeSpark[i]) * 100 : 0);
                    return {
                      brand: b, cur, subscribers, sentSpark, openSpark, clickSpark, revSpark, subSpark,
                      ordersSpark, unsubSpark, flowSpark, campSpark, aovSpark, flowShareSpark, pctSpark,
                      orders, aov, unsubRate, flowShare, pctOfRev, hasFc: fc > 0, hasStore: storeRev > 0,
                      sentChg:  pctChg(cur.emails_sent, prev?.emails_sent),
                      openChg:  pctChg(cur.open_rate,   prev?.open_rate),
                      clickChg: pctChg(cur.click_rate,  prev?.click_rate),
                      revChg:   pctChg(cur.revenue,     prev?.revenue),
                      ordersChg: pctChg(orders, prev?.orders),
                    };
                  })
                  .filter(Boolean)
                  .sort((a: any, b: any) => (b.cur.revenue ?? 0) - (a.cur.revenue ?? 0));

                if (!rows.length) return null;

                const cols = [
                  { label: "Email Revenue", getValue: (r: any) => fmt(r.cur.revenue),                       getSpark: (r: any) => r.revSpark,   getChg: (r: any) => r.revChg },
                  { label: "Subscribers",   getValue: (r: any) => r.subscribers > 0 ? r.subscribers.toLocaleString() : "—", getSpark: (r: any) => r.subSpark, getChg: () => null },
                  { label: "Delivered",     getValue: (r: any) => r.cur.emails_sent.toLocaleString(),       getSpark: (r: any) => r.sentSpark,  getChg: (r: any) => r.sentChg },
                  { label: "Open Rate",     getValue: (r: any) => r.cur.open_rate.toFixed(1) + "%",          getSpark: (r: any) => r.openSpark,  getChg: (r: any) => r.openChg },
                  { label: "Click Rate",    getValue: (r: any) => r.cur.click_rate.toFixed(1) + "%",         getSpark: (r: any) => r.clickSpark, getChg: (r: any) => r.clickChg },
                ];
                const cols2 = [
                  { label: "Email Orders",  getValue: (r: any) => r.orders.toLocaleString(),                                getSpark: (r: any) => r.ordersSpark,    getChg: (r: any) => r.ordersChg },
                  { label: "Avg Order Value", getValue: (r: any) => r.orders > 0 ? fmt(r.aov) : "—",                       getSpark: (r: any) => r.aovSpark,       getChg: () => null },
                  { label: "Unsub Rate",    getValue: (r: any) => r.unsubRate.toFixed(2) + "%",                            getSpark: (r: any) => r.unsubSpark,     getChg: () => null },
                  { label: "Flow Share",    getValue: (r: any) => r.hasFc ? r.flowShare.toFixed(0) + "%" : "—",            getSpark: (r: any) => r.flowShareSpark, getChg: () => null },
                  { label: "% of Total Rev", getValue: (r: any) => r.hasStore ? r.pctOfRev.toFixed(1) + "%" : "—",         getSpark: (r: any) => r.pctSpark,       getChg: () => null },
                ];

                const Metric = ({ col, r }: { col: any; r: any }) => (
                  <div className="px-5 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{col.label}</p>
                    <p className="text-lg font-semibold text-slate-800 leading-none">{col.getValue(r)}</p>
                    <div className="my-1.5"><Spark values={col.getSpark(r)} color={r.brand.color} /></div>
                    <p className="text-[10px] text-gray-400">vs {prevLabel} <Chg pct={col.getChg(r)} /></p>
                  </div>
                );

                return (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">Brand Breakdown — {wholeYear ? fyLabel : latestLabel}</p>
                    {rows.map((r: any) => (
                      <div key={r.brand.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-50" style={{ borderLeft: `3px solid ${r.brand.color}` }}>
                          <span className="text-sm font-bold text-slate-700">{r.brand.name}</span>
                        </div>
                        <div className="grid grid-cols-5 divide-x divide-gray-50">
                          {cols.map(col => <Metric key={col.label} col={col} r={r} />)}
                        </div>
                        <div className="grid grid-cols-5 divide-x divide-gray-50 border-t border-gray-50 bg-gray-50/30">
                          {cols2.map(col => <Metric key={col.label} col={col} r={r} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              </>
              )}
            </>
          )}

          {/* ── SEO (Search Console, portfolio + per-brand) ── */}
          {active === "seo" && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={brandFilter === "all" ? "all" : String(brandFilter)}
                  onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands (Portfolio)</option>
                  {brands.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
              </div>
              <SeoPanel scope={brandFilter} brands={brands} gscMetrics={gscMetrics} gscQueries={gscQueries} gscInsights={gscInsights} monthKeys={monthKeys} monthLabels={monthLabels} />
            </>
          )}

          {/* ── Tradeshows ── */}
          {active === "tradeshows" && (
            <div className="space-y-8">
              <TradeshowAccordion
                tradeshows={tradeshows}
                tradeshowBrands={tradeshowBrands}
                tradeshowSales={tradeshowSales}
                brands={brands}
                monthKeys={monthKeys}
              />
              <BoothFunnel data={boothFunnel} />
            </div>
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
              targets={targets}
              fyLabel={fyLabel}
              monthKeys={monthKeys}
              monthLabels={monthLabels}
              latest={LATEST}
            />
          )}

          {/* ── Content planner ── */}
          {active === "content" && (
            <ContentPlanner brands={brands} brandFilter={brandFilter} monthKey={LATEST} />
          )}

          {/* ── Influencer tracker ── */}
          {active === "influencer" && <InfluencerTracker />}

          {/* ── Team & access (admin only) ── */}
          {active === "team" && role === "admin" && <TeamPanel />}

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
