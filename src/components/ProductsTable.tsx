import { fmtFull } from "@/lib/format";
import type { Brand, BrandProduct } from "@/lib/db";

export function ProductsTable({ brands, products }: { brands: Brand[]; products: BrandProduct[] }) {
  const liveBrands = brands.filter(b => b.live);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="font-semibold text-gray-800 mb-4">Top Products by Brand</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {liveBrands.map(brand => {
          const brandProducts = products.filter(p => p.brand_id === brand.id).slice(0, 5);
          if (brandProducts.length === 0) return null;
          return (
            <div key={brand.id} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: brand.color }}>
                  {brand.init}
                </div>
                <span className="font-medium text-sm text-gray-800">{brand.name}</span>
              </div>
              <div className="space-y-2">
                {brandProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-4 shrink-0">{p.rank}.</span>
                    <span className="flex-1 text-gray-600 truncate" title={p.title}>{p.title}</span>
                    <span className="font-semibold text-gray-800 shrink-0">{fmtFull(p.gross_sales)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
