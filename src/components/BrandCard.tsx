"use client";
import { fmt, fmtPct } from "@/lib/format";
import type { Brand, BrandSummary } from "@/lib/db";

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

interface Props {
  brand: Brand;
  summary: BrandSummary | undefined;
  onClick?: () => void;
  hasGoogle?: boolean;
  hasMeta?: boolean;
  hasInstagram?: boolean;
  igFollowers?: number;
}

export function BrandCard({ brand, summary, onClick, hasGoogle, hasMeta, hasInstagram, igFollowers }: Props) {
  const logo = BRAND_LOGOS[brand.id];
  const momPos = (summary?.mom_growth ?? 0) >= 0;

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col"
      style={{ borderBottom: `3px solid ${brand.color}` }}
    >
      {/* Logo area */}
      <div className="flex items-center justify-center px-6 pt-7 pb-4 h-28">
        {logo ? (
          <img
            src={logo}
            alt={brand.name}
            className="max-h-16 max-w-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold"
            style={{ background: brand.color }}
          >
            {brand.init}
          </div>
        )}
      </div>

      {/* Brand name */}
      <div className="px-5 pb-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{brand.name}</p>
      </div>

      {/* Metrics */}
      <div className="px-5 pb-5 mt-1 flex-1">
        {summary ? (
          <>
            <p className="text-2xl font-light text-slate-800">{fmt(summary.fy_revenue)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 mb-3">FY 2025–26 revenue</p>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400">{summary.last_month_label}</p>
                <p className="text-sm font-semibold text-slate-700">{fmt(summary.last_month_rev)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400">MoM</p>
                <p className={`text-sm font-bold ${momPos ? "text-emerald-500" : "text-red-500"}`}>
                  {fmtPct(summary.mom_growth)}
                </p>
              </div>
            </div>

            {/* Channel dots */}
            <div className="flex gap-1.5 mt-3">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-600">SHOP</span>
              {hasGoogle    && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600">GADS</span>}
              {hasMeta      && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-600">META</span>}
              {hasInstagram && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-pink-50 text-pink-600">
                {igFollowers && igFollowers >= 1000 ? `${(igFollowers / 1000).toFixed(1)}K` : igFollowers?.toLocaleString() ?? "IG"}
              </span>}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 mt-2">Not connected</p>
        )}
      </div>
    </div>
  );
}
