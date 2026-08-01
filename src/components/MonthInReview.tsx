"use client";

import React from "react";
import { fmtFull, fmt } from "@/lib/format";
import { KIND_META, type Annotation } from "./AnnotationsCard";

// Reports > Month in Review — the auto-written permanent record: one page per
// brand per month, assembled live from the data the dashboard already holds
// (revenue vs target & last year, ad spend/ROAS, email, events). The page you
// hand someone to understand a brand's month in five minutes. Print → PDF.

const NAVY = "#132741";
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const Delta = ({ v, suffix = "" }: { v: number | null; suffix?: string }) =>
  v == null ? <span className="text-slate-300">—</span>
    : <span className={`font-semibold ${v >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}%{suffix}</span>;

export function MonthInReview({ brands, monthly, targets, googleAds, metaAds, pinterestAds, klaviyo, annotations, monthKeys, monthLabels, latest }: {
  brands: any[]; monthly: any[]; targets: any[]; googleAds: any[]; metaAds: any[]; pinterestAds: any[];
  klaviyo: any[]; annotations: Annotation[]; monthKeys: string[]; monthLabels: string[]; latest: string;
}) {
  // Default to the last *completed* month with data
  const withData = monthKeys.filter(mk => monthly.some(m => m.month_key === mk && m.revenue > 0));
  const [mk, setMk] = React.useState<string>(withData[withData.length - 1] ?? latest);
  const mLabel = monthLabels[monthKeys.indexOf(mk)] ?? mk;

  const live = brands.filter((b: any) => b.live);

  const rows = live.map((b: any) => {
    const m = monthly.find((r: any) => r.brand_id === b.id && r.month_key === mk);
    const rev = Number(m?.revenue) || 0;
    const prevYear = Number(m?.prev_revenue) || 0;
    const target = Number(targets.find((t: any) => t.brand_id === b.id && t.month_key === mk)?.revenue_target) || 0;
    const prevIdx = monthKeys.indexOf(mk) - 1;
    const prevRev = prevIdx >= 0 ? Number(monthly.find((r: any) => r.brand_id === b.id && r.month_key === monthKeys[prevIdx])?.revenue) || 0 : 0;
    const g = googleAds.find((r: any) => r.brand_id === b.id && r.month_key === mk);
    const mt = metaAds.find((r: any) => r.brand_id === b.id && r.month_key === mk);
    const p = pinterestAds.find((r: any) => r.brand_id === b.id && r.month_key === mk);
    const spend = (Number(g?.spend) || 0) + (Number(mt?.spend) || 0) + (Number(p?.spend) || 0);
    const adRev = (Number(g?.revenue) || 0) + (Number(mt?.revenue) || 0) + (Number(p?.revenue) || 0);
    const kv = klaviyo.find((r: any) => r.brand_id === b.id && r.month_key === mk);
    const events = annotations.filter(a => a.day.slice(0, 7) === mk && (!a.brand || a.brand === b.name));
    return { b, rev, prevYear, target, prevRev, spend, adRev, kv, events };
  }).filter(r => r.rev > 0 || r.spend > 0).sort((a, b) => b.rev - a.rev);

  // Narrative sentences — plain words, computed from the numbers
  const story = (r: (typeof rows)[number]) => {
    const bits: string[] = [];
    if (r.target > 0) {
      const hit = Math.round((r.rev / r.target) * 100);
      bits.push(hit >= 100 ? `Beat target — ${hit}% of the ${fmtFull(r.target)} goal.` : `Reached ${hit}% of the ${fmtFull(r.target)} target.`);
    }
    const yoy = pct(r.rev, r.prevYear);
    if (yoy != null) bits.push(`${yoy >= 0 ? "Up" : "Down"} ${Math.abs(yoy)}% on the same month last year.`);
    const mom = pct(r.rev, r.prevRev);
    if (mom != null && Math.abs(mom) >= 15) bits.push(`${mom >= 0 ? "Jumped" : "Fell"} ${Math.abs(mom)}% month-on-month.`);
    if (r.spend > 0) {
      const roas = r.adRev / r.spend;
      bits.push(`${fmtFull(r.spend)} of paid media returned ${fmtFull(r.adRev)} (${roas.toFixed(1)}× ROAS)${roas < 1.5 ? " — worth a look" : ""}.`);
    }
    if (r.kv && Number(r.kv.revenue) > 0) bits.push(`Email drove ${fmtFull(Number(r.kv.revenue))}${r.kv.open_rate ? ` at ${(Number(r.kv.open_rate) * 100).toFixed(0)}% opens` : ""}.`);
    return bits.join(" ");
  };

  const totalRev = rows.reduce((s, r) => s + r.rev, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalPrevYear = rows.reduce((s, r) => s + r.prevYear, 0);

  return (
    <div className="space-y-3 max-w-[900px]">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <select value={mk} onChange={e => setMk(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
          {withData.map(k => <option key={k} value={k}>{monthLabels[monthKeys.indexOf(k)]}</option>)}
        </select>
        <button onClick={() => window.print()} className="text-sm font-semibold text-white rounded-lg px-4 py-2" style={{ background: NAVY }}>Print / PDF</button>
      </div>

      <article className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden print:shadow-none print:ring-0">
        <div className="px-8 py-6 text-white" style={{ background: `linear-gradient(120deg, ${NAVY}, #1d3a5f)` }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300">Coolkidz Australia · Month in Review</p>
          <h1 className="text-2xl font-bold mt-1">{mLabel}</h1>
          <div className="flex gap-8 mt-4 flex-wrap">
            <div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">D2C Revenue</p><p className="text-2xl font-bold">{fmtFull(totalRev)}</p></div>
            {totalTarget > 0 && <div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">vs Target</p><p className="text-2xl font-bold">{Math.round((totalRev / totalTarget) * 100)}%</p></div>}
            {totalPrevYear > 0 && <div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">vs Last Year</p><p className="text-2xl font-bold">{(pct(totalRev, totalPrevYear) ?? 0) >= 0 ? "+" : ""}{pct(totalRev, totalPrevYear)}%</p></div>}
            {totalSpend > 0 && <div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Paid media</p><p className="text-2xl font-bold">{fmt(totalSpend)}</p></div>}
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          {rows.map(r => (
            <div key={r.b.id} className="border border-gray-100 rounded-xl p-5 break-inside-avoid">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: r.b.color }} />
                  <span className="font-bold text-slate-800">{r.b.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-slate-900">{fmtFull(r.rev)}</span>
                  <span className="text-[12px]"><Delta v={pct(r.rev, r.prevYear)} suffix=" YoY" /></span>
                  {r.target > 0 && (
                    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${r.rev >= r.target ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {Math.round((r.rev / r.target) * 100)}% of target
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed">{story(r) || "Quiet month — no paid activity and no target set."}</p>
              {r.events.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.events.map(e => (
                    <span key={e.id} className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                      {KIND_META[e.kind]?.emoji ?? "📌"} {e.day.slice(8)} {mLabel.split(" ")[0]} · {e.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <p className="text-center text-[11px] text-gray-300 pt-1">Assembled live from dashboard data · revenue is D2C ex-GST · paid media = Google + Meta + Pinterest</p>
        </div>
      </article>
    </div>
  );
}
