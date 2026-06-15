"use client";

import { useState } from "react";
import { fmt, fmtFull, fmtPct } from "@/lib/format";
import { BRAND_LOGOS } from "./BrandCard";
import type { Brand, BrandSummary, BrandMonthly, GoogleAdsRow, MetaAdsRow, InstagramOrganicRow } from "@/lib/db";

type SortKey = "fy_revenue" | "last_month_rev" | "mom_growth" | "google_roas" | "meta_roas" | "ig_followers";

const DEFAULT_MONTH_KEYS = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const nonZero = data.filter(v => v > 0);
  if (nonZero.length < 2) return <span className="text-gray-200 text-xs">—</span>;
  const min = Math.min(...nonZero);
  const max = Math.max(...nonZero);
  const range = max - min || 1;
  const W = 64, H = 22;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = v === 0 ? H : H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const trend = data[data.length - 1] > data.find(v => v > 0)! ? color : "#f87171";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={trend} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  brands: Brand[];
  summaries: BrandSummary[];
  monthly: BrandMonthly[];
  googleAds: GoogleAdsRow[];
  metaAds: MetaAdsRow[];
  instagramOrganic: InstagramOrganicRow[];
  onBrandClick: (id: number) => void;
  monthKeys?: string[];
  latest?: string;
}

export function Leaderboard({ brands, summaries, monthly, googleAds, metaAds, instagramOrganic, onBrandClick, monthKeys = DEFAULT_MONTH_KEYS, latest }: Props) {
  const LATEST = latest ?? monthKeys[monthKeys.length - 1];
  const MONTH_KEYS = monthKeys;
  const [sortKey, setSortKey] = useState<SortKey>("fy_revenue");
  const [asc, setAsc] = useState(false);

  const rows = brands
    .filter(b => b.live)
    .map(b => {
      const s = summaries.find(s => s.brand_id === b.id);
      const gLatest = googleAds.find(d => d.brand_id === b.id && d.month_key === LATEST);
      const mLatest = metaAds.find(d => d.brand_id === b.id && d.month_key === LATEST);
      const igLatest = instagramOrganic.find(d => d.brand_id === b.id && d.month_key === LATEST);
      const metaRoas = mLatest && mLatest.spend > 0 ? mLatest.revenue / mLatest.spend : 0;
      const revSpark = MONTH_KEYS.map(mk => monthly.find(m => m.brand_id === b.id && m.month_key === mk)?.revenue ?? 0);
      const gRoas = gLatest?.roas ?? 0;
      const roasAlert = (gRoas > 0 && gRoas < 1.5) || (metaRoas > 0 && metaRoas < 1.5);
      const momAlert = (s?.mom_growth ?? 0) < -20;
      return {
        brand: b,
        fy_revenue:     s?.fy_revenue ?? 0,
        last_month_rev: s?.last_month_rev ?? 0,
        mom_growth:     s?.mom_growth ?? 0,
        google_roas:    gRoas,
        meta_roas:      metaRoas,
        ig_followers:   igLatest?.followers ?? 0,
        revSpark,
        alert: roasAlert || momAlert,
      };
    })
    .sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return asc ? diff : -diff;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
        style={{ color: active ? "#2dc8a5" : "#94a3b8" }}
      >
        {label} {active ? (asc ? "↑" : "↓") : ""}
      </th>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50">
        <h2 className="font-semibold text-gray-800">Brand Leaderboard</h2>
        <p className="text-xs text-gray-400 mt-0.5">Click any column to sort · Click a brand to view</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-8">#</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Brand</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Trend</th>
              <Th label="FY Revenue" k="fy_revenue" />
              <Th label="May Revenue" k="last_month_rev" />
              <Th label="MoM" k="mom_growth" />
              <Th label="Google ROAS" k="google_roas" />
              <Th label="Meta ROAS" k="meta_roas" />
              <Th label="IG Followers" k="ig_followers" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => {
              const logo = BRAND_LOGOS[row.brand.id];
              const momPos = row.mom_growth >= 0;
              return (
                <tr
                  key={row.brand.id}
                  onClick={() => onBrandClick(row.brand.id)}
                  className="hover:bg-gray-50/60 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3 text-center">
                    {i < 3
                      ? <span className="text-base">{medals[i]}</span>
                      : <span className="text-xs text-gray-400 font-medium">{i + 1}</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                        {logo
                          ? <img src={logo} alt={row.brand.name} className="max-h-6 max-w-7 object-contain" />
                          : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: row.brand.color }}>{row.brand.init}</div>
                        }
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">{row.brand.name}</span>
                        {row.alert && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Performance alert" />}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <MiniSparkline data={row.revSpark} color={row.brand.color} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(row.fy_revenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmt(row.last_month_rev)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${momPos ? "text-emerald-500" : "text-red-500"}`}>
                    {fmtPct(row.mom_growth)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.google_roas > 0
                      ? <span className={row.google_roas < 1.5 ? "text-amber-500 font-semibold" : ""}>{row.google_roas.toFixed(1)}×</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.meta_roas > 0
                      ? <span className={row.meta_roas < 1.5 ? "text-amber-500 font-semibold" : ""}>{row.meta_roas.toFixed(1)}×</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.ig_followers > 0
                      ? <span className="text-pink-600 font-medium">{row.ig_followers >= 1000 ? `${(row.ig_followers / 1000).toFixed(1)}K` : row.ig_followers}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
