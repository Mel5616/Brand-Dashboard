"use client";
import { useState } from "react";
import { fmt } from "@/lib/format";
import { BRAND_LOGOS } from "./BrandCard";

type Period = "day" | "week" | "month";

// Per-brand Shopify sales at a glance, switchable Day / Week / Month.
// Week uses brand_weekly, Month uses brand_monthly. Daily has no synced table yet.
export function ShopifyBrandSales({ brands, monthly, weekly, months, latestI }: {
  brands: any[]; monthly: any[]; weekly: any[]; months: string[]; latestI: number;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const live = brands.filter((b: any) => b.live);

  const curM = months[latestI], prevM = months[latestI - 1];
  const weeks = [...new Set(weekly.map((w: any) => w.week_start))].sort();
  const curW = weeks[weeks.length - 1], prevW = weeks[weeks.length - 2];

  const monRev = (id: number, mk?: string) => mk ? (monthly.find((r: any) => r.brand_id === id && r.month_key === mk)?.revenue ?? 0) : 0;
  const wkRev  = (id: number, ws?: string) => ws ? (weekly.find((r: any) => r.brand_id === id && r.week_start === ws)?.revenue ?? 0) : 0;

  const fmtWeek = (s?: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
  const fmtMonth = (mk?: string) => mk ? new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "—";

  const cards = live.map((b: any) => {
    let cur = 0, prev = 0;
    if (period === "month") { cur = monRev(b.id, curM); prev = monRev(b.id, prevM); }
    else if (period === "week") { cur = wkRev(b.id, curW); prev = wkRev(b.id, prevW); }
    const chg = period !== "day" && prev > 0 ? ((cur - prev) / prev) * 100 : null;
    return { b, cur, chg };
  }).sort((a, b) => b.cur - a.cur);

  const periodLabel = period === "month" ? fmtMonth(curM) : period === "week" ? `Week of ${fmtWeek(curW)}` : "Today";
  const total = cards.reduce((s, c) => s + c.cur, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Brand sales <span className="font-normal text-gray-400 normal-case tracking-normal">· {periodLabel}{period !== "day" && total > 0 ? ` · ${fmt(total)} total` : ""}</span></p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(["day", "week", "month"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 capitalize transition ${period === p ? "bg-indigo-600 text-white font-semibold" : "text-gray-500 hover:bg-gray-50"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {period === "day" ? (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800">
          Daily sales aren’t synced yet — the data only comes in weekly and monthly. I can add a daily Shopify sync if you’d like per-day figures here.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {cards.map(({ b, cur, chg }) => (
            <div key={b.id} className="rounded-xl border border-gray-100 p-3" style={{ borderBottom: `2px solid ${b.color || "#e5e7eb"}` }}>
              <div className="flex items-center gap-2 mb-1.5 h-5">
                {BRAND_LOGOS[b.id]
                  ? <img src={BRAND_LOGOS[b.id]} alt={b.name} className="h-4 max-w-[70px] object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : <span className="text-[11px] font-semibold text-gray-500 truncate">{b.name}</span>}
              </div>
              <p className="text-lg font-bold text-slate-800 leading-none">{fmt(cur)}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-400 truncate">{b.name}</span>
                {chg !== null
                  ? <span className={`text-[10px] font-semibold shrink-0 ${chg >= 0 ? "text-emerald-500" : "text-red-500"}`}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(0)}%</span>
                  : <span className="text-[10px] text-gray-300 shrink-0">—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
