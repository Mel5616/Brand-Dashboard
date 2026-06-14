import { fmt, fmtPct } from "@/lib/format";
import type { Brand, BrandSummary } from "@/lib/db";

export function BrandCard({ brand, summary }: { brand: Brand; summary: BrandSummary | undefined }) {
  const color = brand.color ?? "#6366f1";

  if (!brand.live || !summary) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm opacity-50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: color }}>
            {brand.init}
          </div>
          <span className="font-semibold text-sm text-gray-700">{brand.name}</span>
        </div>
        <p className="text-xs text-gray-400">Not connected</p>
      </div>
    );
  }

  const momColor = summary.mom_growth >= 0 ? "text-green-600" : "text-red-500";
  const yoyColor = summary.yoy_growth >= 0 ? "text-green-600" : "text-red-500";

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: color }}>
          {brand.init}
        </div>
        <span className="font-semibold text-sm text-gray-800 truncate">{brand.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <p className="text-gray-400">{summary.last_month_label} Revenue</p>
          <p className="font-bold text-base text-gray-900">{fmt(summary.last_month_rev)}</p>
        </div>
        <div>
          <p className="text-gray-400">FY Total</p>
          <p className="font-bold text-base text-gray-900">{fmt(summary.fy_revenue)}</p>
        </div>
        <div>
          <p className="text-gray-400">MoM</p>
          <p className={`font-semibold ${momColor}`}>{fmtPct(summary.mom_growth)}</p>
        </div>
        <div>
          <p className="text-gray-400">YoY (FY)</p>
          <p className={`font-semibold ${yoyColor}`}>{fmtPct(summary.yoy_growth)}</p>
        </div>
        <div>
          <p className="text-gray-400">Orders</p>
          <p className="font-semibold text-gray-700">{summary.last_month_orders.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-400">AOV</p>
          <p className="font-semibold text-gray-700">{fmt(summary.aov)}</p>
        </div>
      </div>
    </div>
  );
}
