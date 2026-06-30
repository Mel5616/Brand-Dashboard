"use client";
import { fmt } from "@/lib/format";
import type { Brand, BrandSummary, BrandTarget } from "@/lib/db";
import { BRAND_LOGOS } from "@/lib/brandLogos";

// Single source of truth lives in a server-safe lib; re-exported here so existing
// client importers (Leaderboard, NewProducts, ShopifyBrandSales) keep working.
export { BRAND_LOGOS };

// Per-brand logo size overrides (default is "w-28 h-12"). Use for logos that
// render visually larger/smaller than the others at the same box size.
const LOGO_SIZE: Record<number, string> = {
  8:  "w-16 h-8", // Frida — noticeably smaller (logo has little built-in padding)
};

export type BrandPeriod = "monthly" | "weekly" | "fy";

interface Props {
  brand: Brand;
  summary: BrandSummary | undefined;
  onClick?: () => void;
  hasGoogle?: boolean;
  hasMeta?: boolean;
  hasInstagram?: boolean;
  igFollowers?: number;
  target?: BrandTarget;
  roasAlert?: boolean;
  period?: BrandPeriod;
  pacePct?: number | null;
  // Whole-business FY revenue across all channels — the card's headline figure.
  wholeRevenue?: number;
  wholeLabel?: string;
}

export function BrandCard({ brand, summary, onClick, hasGoogle, hasMeta, hasInstagram, igFollowers, target, roasAlert, pacePct, wholeRevenue, wholeLabel }: Props) {
  const logo = BRAND_LOGOS[brand.id];

  const headlineRevenue = wholeRevenue ?? summary?.fy_revenue ?? 0;
  const momAlert   = (summary?.mom_growth ?? 0) < -20;
  const revenuePct = pacePct ?? (target && target.revenue_target > 0 && summary ? Math.min((summary.last_month_rev / target.revenue_target) * 100, 100) : null);
  const onTrack = revenuePct !== null && revenuePct >= 80;

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col relative"
      style={{ borderBottom: `3px solid ${brand.color}` }}
    >
      {/* Alert badge */}
      {(roasAlert || momAlert) && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5" title="Performance alert">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">Alert</span>
        </div>
      )}

      {/* Logo area — compact */}
      <div className="flex items-center justify-center px-6 pt-5 pb-3 h-20">
        {logo ? (
          <img
            src={logo}
            alt={brand.name}
            className={`${LOGO_SIZE[brand.id] ?? "w-28 h-12"} object-contain`}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
            style={{ background: brand.color }}
          >
            {brand.init}
          </div>
        )}
      </div>

      {/* Brand name */}
      <div className="px-5 pb-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{brand.name}</p>
      </div>

      {/* Metrics */}
      <div className="px-5 pb-4 mt-1 flex-1">
        {summary ? (
          <>
            {/* Revenue pacing bar (monthly only) */}
            {revenuePct !== null && (
              <div className="mb-2.5">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-400">vs target</span>
                  <span className={onTrack ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>
                    {revenuePct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${revenuePct}%`, background: onTrack ? "#2dc8a5" : "#f59e0b" }} />
                </div>
              </div>
            )}

            <div>
              <p className="text-2xl font-light text-slate-800 leading-none">{fmt(headlineRevenue)}</p>
              <p className="text-[10px] text-gray-400 mt-1">{wholeLabel ?? "FY · all channels"}</p>
            </div>

            {/* Channel tags */}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600">Shopify</span>
              {hasGoogle    && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">G Ads</span>}
              {hasMeta      && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-600">Meta</span>}
              {hasInstagram && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-50 text-pink-600">
                  {igFollowers && igFollowers >= 1000 ? `${(igFollowers / 1000).toFixed(1)}K IG` : "IG"}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 mt-2">Not connected</p>
        )}
      </div>
    </div>
  );
}
