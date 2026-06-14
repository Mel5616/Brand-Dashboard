"use client";

import { useState } from "react";
import { SalesChart } from "./SalesChart";
import { GoogleAdsChart } from "./GoogleAdsChart";
import { ProductsTable } from "./ProductsTable";
import { TradeshowAccordion } from "./TradeshowAccordion";
import { BrandCard } from "./BrandCard";

const TABS = [
  { id: "overview",   label: "Overview" },
  { id: "shopify",    label: "Shopify" },
  { id: "google-ads", label: "Google Ads" },
  { id: "tradeshows", label: "Tradeshows" },
] as const;

type TabId = typeof TABS[number]["id"];

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
  kpis: { label: string; value: string; sub: string }[];
}

export function DashboardTabs({
  brands, summaries, monthly, weekly, products,
  tradeshows, tradeshowBrands, tradeshowSales,
  weekLabels, googleAds, kpis,
}: Props) {
  const [active, setActive] = useState<TabId>("overview");
  const summaryMap = Object.fromEntries(summaries.map((s: any) => [s.brand_id, s]));

  return (
    <>
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white sticky top-[57px] z-10">
        <div className="max-w-screen-2xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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

        {active === "overview" && (
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
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Brands</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {brands.map((brand: any) => (
                  <BrandCard key={brand.id} brand={brand} summary={summaryMap[brand.id]} />
                ))}
              </div>
            </div>
          </>
        )}

        {active === "shopify" && (
          <>
            <SalesChart brands={brands} monthly={monthly} weekly={weekly} weekLabels={weekLabels} />
            <ProductsTable brands={brands} products={products} />
          </>
        )}

        {active === "google-ads" && (
          <GoogleAdsChart brands={brands} data={googleAds} />
        )}

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
