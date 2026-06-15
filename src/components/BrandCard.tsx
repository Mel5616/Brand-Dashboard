"use client";
import { fmt, fmtPct } from "@/lib/format";
import type { Brand, BrandSummary, BrandTarget } from "@/lib/db";

export const BRAND_LOGOS: Record<number, string> = {
  0:  "/logos/Nanit_Logo Lockup_Midnight Mist.svg",
  1:  "/logos/MCC_logo_MAGIC_black_c.png",
  2:  "/logos/hannie.jpg",
  3:  "/logos/GaiaBaby-Logo-Portrait-Colour.jpg",
  4:  "/logos/220420 Logo.jpg",
  5:  "/logos/UPPAbaby Logo.jpg",
  6:  "/logos/ZAZU logo_HR.jpg",
  7:  "/logos/MiaMily_logo+flag_1.png",
  8:  "/logos/Frida_logo_main.png",
  9:  "/logos/Coolkidz Logo.png",
  10: "/logos/Matchstick Monkey Logo.jpg",
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
  periodRevenue?: number;
  periodGrowth?: number | null;
  periodLabel?: string;
}

export function BrandCard({ brand, summary, onClick, hasGoogle, hasMeta, hasInstagram, igFollowers, target, roasAlert, period = "monthly", periodRevenue, periodGrowth, periodLabel }: Props) {
  const logo = BRAND_LOGOS[brand.id];

  const displayRevenue = periodRevenue ?? (period === "fy" ? (summary?.fy_revenue ?? 0) : (summary?.last_month_rev ?? 0));
  const displayGrowth  = periodGrowth  ?? (period === "monthly" ? (summary?.mom_growth ?? null) : null);
  const displayLabel   = periodLabel   ?? (period === "fy" ? "FY 2025–26" : period === "weekly" ? "Last week" : (summary?.last_month_label ?? "Last month"));

  const growthPos  = (displayGrowth ?? 0) >= 0;
  const momAlert   = (summary?.mom_growth ?? 0) < -20;
  const revenuePct = period === "monthly" && target && target.revenue_target > 0 && summary
    ? Math.min((summary.last_month_rev / target.revenue_target) * 100, 100)
    : null;
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
            className="w-28 h-12 object-contain"
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

            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-light text-slate-800 leading-none">{fmt(displayRevenue)}</p>
                <p className="text-[10px] text-gray-400 mt-1">{displayLabel}</p>
              </div>
              {displayGrowth !== null && (
                <p className={`text-sm font-bold mb-0.5 ${growthPos ? "text-emerald-500" : "text-red-500"}`}>
                  {fmtPct(displayGrowth)}
                </p>
              )}
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
