import { getDashboardData } from "@/lib/db";
import { SyncStatus } from "@/components/SyncStatus";
import { DashboardTabs } from "@/components/DashboardTabs";

export const revalidate = 0;

export default async function Dashboard() {
  const {
    brands, summaries, monthly, weekly, products,
    tradeshows, tradeshowBrands, tradeshowSales,
    weekLabels, lastSync, googleAds, metaAds, metaAdsPlatform,
    instagramOrganic, targets, klaviyo, ga4,
  } = await getDashboardData();

  const liveBrands = brands.filter(b => b.live);
  const totalFY = summaries.reduce((s: number, b: any) => s + (b.fy_revenue ?? 0), 0);
  const totalOrders = summaries.reduce((s: number, b: any) => s + (b.last_month_orders ?? 0), 0);

  function fmt(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  const kpis = [
    { label: "FY 2025–26 Revenue", value: fmt(totalFY), sub: "ex-GST, all brands" },
    { label: "Active Brands", value: liveBrands.length.toString(), sub: `of ${brands.length} total` },
    { label: "Last Month Orders", value: totalOrders.toLocaleString(), sub: summaries[0]?.last_month_label ?? "" },
    { label: "Tradeshows", value: tradeshows.length.toString(), sub: `${tradeshows.filter((t: any) => new Date() < new Date(t.date_start)).length} upcoming` },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">CK</div>
            <div>
              <h1 className="font-semibold text-gray-900 text-sm leading-tight">Brand Dashboard</h1>
              <p className="text-xs text-gray-400">Coolkidz Australia · {liveBrands.length} brands</p>
            </div>
          </div>
          <SyncStatus lastSync={lastSync} />
        </div>
      </header>

      <DashboardTabs
        brands={brands}
        summaries={summaries}
        monthly={monthly}
        weekly={weekly}
        products={products}
        tradeshows={tradeshows}
        tradeshowBrands={tradeshowBrands}
        tradeshowSales={tradeshowSales}
        weekLabels={weekLabels}
        googleAds={googleAds}
        metaAds={metaAds}
        metaAdsPlatform={metaAdsPlatform}
        instagramOrganic={instagramOrganic}
        targets={targets}
        klaviyo={klaviyo}
        ga4={ga4}
        kpis={kpis}
      />
    </div>
  );
}
