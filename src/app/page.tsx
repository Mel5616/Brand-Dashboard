import { getDashboardData } from "@/lib/db";
import { BrandCard } from "@/components/BrandCard";
import { SalesChart } from "@/components/SalesChart";
import { TradeshowAccordion } from "@/components/TradeshowAccordion";
import { ProductsTable } from "@/components/ProductsTable";
import { SyncStatus } from "@/components/SyncStatus";

export const revalidate = 0;

export default async function Dashboard() {
  const {
    brands, summaries, monthly, weekly, products,
    tradeshows, tradeshowBrands, tradeshowSales,
    weekLabels, lastSync,
  } = await getDashboardData();

  const summaryMap = Object.fromEntries(summaries.map(s => [s.brand_id, s]));
  const liveBrands = brands.filter(b => b.live);

  const totalFY = summaries.reduce((s, b) => s + (b.fy_revenue ?? 0), 0);
  const totalOrders = summaries.reduce((s, b) => s + (b.last_month_orders ?? 0), 0);

  function fmt(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

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

      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "FY 2025–26 Revenue", value: fmt(totalFY), sub: "ex-GST, all brands" },
            { label: "Active Brands", value: liveBrands.length.toString(), sub: `of ${brands.length} total` },
            { label: "Last Month Orders", value: totalOrders.toLocaleString(), sub: summaries[0]?.last_month_label ?? "" },
            { label: "Tradeshows", value: tradeshows.length.toString(), sub: `${tradeshows.filter(t => new Date() < new Date(t.date_start)).length} upcoming` },
          ].map(kpi => (
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
            {brands.map(brand => (
              <BrandCard key={brand.id} brand={brand} summary={summaryMap[brand.id]} />
            ))}
          </div>
        </div>

        <SalesChart brands={brands} monthly={monthly} weekly={weekly} weekLabels={weekLabels} />

        <ProductsTable brands={brands} products={products} />

        <TradeshowAccordion
          tradeshows={tradeshows}
          tradeshowBrands={tradeshowBrands}
          tradeshowSales={tradeshowSales}
          brands={brands}
        />

        <p className="text-center text-xs text-gray-300 pb-4">
          Coolkidz Australia · All revenue figures ex-GST
        </p>
      </main>
    </div>
  );
}
