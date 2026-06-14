"use client";

import { useState } from "react";
import { SalesChart } from "./SalesChart";
import { GoogleAdsChart } from "./GoogleAdsChart";
import { MetaAdsChart } from "./MetaAdsChart";
import { ProductsTable } from "./ProductsTable";
import { TradeshowAccordion } from "./TradeshowAccordion";
import { BrandCard } from "./BrandCard";
import { Leaderboard } from "./Leaderboard";
import { BrandPage } from "./BrandPage";

const TABS = [
  { id: "brands",      label: "Brands" },
  { id: "shopify",     label: "Shopify" },
  { id: "google-ads",  label: "Google Ads" },
  { id: "meta-ads",    label: "Meta Ads" },
  { id: "tradeshows",  label: "Tradeshows" },
] as const;

type TabId = typeof TABS[number]["id"];

const LATEST = "2026-05";

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
  kpis: { label: string; value: string; sub: string }[];
}

export function DashboardTabs({
  brands, summaries, monthly, weekly, products,
  tradeshows, tradeshowBrands, tradeshowSales,
  weekLabels, googleAds, metaAds, metaAdsPlatform, instagramOrganic, kpis,
}: Props) {
  const [active, setActive] = useState<TabId>("brands");
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");

  const summaryMap = Object.fromEntries(summaries.map((s: any) => [s.brand_id, s]));
  const selectedBrand   = brandFilter !== "all" ? brands.find((b: any) => b.id === brandFilter) : null;
  const selectedSummary = brandFilter !== "all" ? summaries.find((s: any) => s.brand_id === brandFilter) : null;

  const filteredBrands   = brandFilter === "all" ? brands   : brands.filter((b: any) => b.id === brandFilter);
  const filteredMonthly  = brandFilter === "all" ? monthly  : monthly.filter((m: any) => m.brand_id === brandFilter);
  const filteredWeekly   = brandFilter === "all" ? weekly   : weekly.filter((w: any) => w.brand_id === brandFilter);
  const filteredProducts = brandFilter === "all" ? products : products.filter((p: any) => p.brand_id === brandFilter);
  const filteredAds      = brandFilter === "all" ? googleAds : googleAds.filter((d: any) => d.brand_id === brandFilter);
  const filteredMeta     = brandFilter === "all" ? metaAds  : metaAds.filter((d: any) => d.brand_id === brandFilter);

  function openBrand(id: number) {
    setBrandFilter(id);
  }

  // ── Brand page view ────────────────────────────────────────────────────────
  if (selectedBrand) {
    return (
      <>
        <div className="border-b border-gray-200 bg-white sticky top-[57px] z-10">
          <div className="max-w-screen-2xl mx-auto px-6 flex items-center justify-between py-2.5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBrandFilter("all")}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                ← All Brands
              </button>
              <span className="text-gray-200 text-sm">|</span>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedBrand.color }} />
                <span className="text-sm font-medium text-gray-700">{selectedBrand.name}</span>
              </div>
            </div>
            <select
              value={String(brandFilter)}
              onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {brands.map((b: any) => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
          </div>
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
        />
      </>
    );
  }

  // ── All-brands tab view ────────────────────────────────────────────────────
  return (
    <>
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white sticky top-[57px] z-10">
        <div className="max-w-screen-2xl mx-auto px-6 flex items-end">
          <nav className="flex gap-1 -mb-px flex-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active === tab.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-8">

        {/* ── Brands home ── */}
        {active === "brands" && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {kpis.map(kpi => (
                <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400">{kpi.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Brand logo grid */}
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Brands — click to explore</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {brands.filter((b: any) => b.live).map((brand: any) => {
                  const latestIg = instagramOrganic.find((d: any) => d.brand_id === brand.id && d.month_key === LATEST);
                  return (
                    <BrandCard
                      key={brand.id}
                      brand={brand}
                      summary={summaryMap[brand.id]}
                      onClick={() => openBrand(brand.id)}
                      hasGoogle={googleAds.some((d: any) => d.brand_id === brand.id)}
                      hasMeta={metaAds.some((d: any) => d.brand_id === brand.id)}
                      hasInstagram={instagramOrganic.some((d: any) => d.brand_id === brand.id)}
                      igFollowers={latestIg?.followers}
                    />
                  );
                })}
              </div>
            </div>

            {/* Leaderboard */}
            <Leaderboard
              brands={brands}
              summaries={summaries}
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
                {brands.map((b: any) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
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
                {brands.map((b: any) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </div>
            <GoogleAdsChart brands={filteredBrands} data={filteredAds} />
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
                {brands.map((b: any) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
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

        <p className="text-center text-xs text-gray-300 pb-4">
          Coolkidz Australia · All revenue figures ex-GST
        </p>
      </main>
    </>
  );
}
