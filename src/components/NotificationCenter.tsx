"use client";

import { useState, useRef, useEffect } from "react";
import { fmt } from "@/lib/format";

type Alert = {
  id: string;
  brand: string;
  brandColor: string;
  level: "warning" | "info";
  title: string;
  detail: string;
};

interface Props {
  brands: any[];
  summaries: any[];
  googleAds: any[];
  metaAds: any[];
  targets: any[];
  marketingBudgets: any[];
  marketingActuals: any[];
}

const LATEST = "2026-05";

export function NotificationCenter({ brands, summaries, googleAds, metaAds, targets, marketingBudgets, marketingActuals }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const alerts: Alert[] = [];

  for (const brand of brands.filter(b => b.live)) {
    const color  = brand.color ?? "#6366f1";
    const sum    = summaries.find(s => s.brand_id === brand.id);
    const gAds   = googleAds.find(d => d.brand_id === brand.id && d.month_key === LATEST);
    const mAds   = metaAds.find(d => d.brand_id === brand.id && d.month_key === LATEST);
    const target  = targets.find(t => t.brand_id === brand.id && t.month_key === LATEST);

    // Low Google ROAS
    if (gAds && gAds.roas > 0 && gAds.roas < 1.5) {
      alerts.push({
        id: `groas-${brand.id}`,
        brand: brand.name, brandColor: color, level: "warning",
        title: "Low Google ROAS",
        detail: `${gAds.roas.toFixed(2)}× on ${fmt(gAds.spend)} spend in May`,
      });
    }

    // Low Meta ROAS
    if (mAds && mAds.spend > 0) {
      const mRoas = mAds.revenue / mAds.spend;
      if (mRoas < 1.5) {
        alerts.push({
          id: `mroas-${brand.id}`,
          brand: brand.name, brandColor: color, level: "warning",
          title: "Low Meta ROAS",
          detail: `${mRoas.toFixed(2)}× on ${fmt(mAds.spend)} spend in May`,
        });
      }
    }

    // MoM revenue drop > 20%
    if (sum && (sum.mom_growth ?? 0) < -20) {
      alerts.push({
        id: `mom-${brand.id}`,
        brand: brand.name, brandColor: color, level: "warning",
        title: "Revenue down MoM",
        detail: `${sum.mom_growth.toFixed(1)}% vs prior month`,
      });
    }

    // Behind on monthly revenue target
    if (target && target.revenue_target > 0 && sum) {
      const pct = (sum.last_month_rev / target.revenue_target) * 100;
      if (pct < 70) {
        alerts.push({
          id: `target-${brand.id}`,
          brand: brand.name, brandColor: color, level: "warning",
          title: "Behind revenue target",
          detail: `${pct.toFixed(0)}% of ${fmt(target.revenue_target)} May target`,
        });
      }
    }

    // Marketing budget overspend
    const budgets = marketingBudgets.filter(b => b.brand_id === brand.id);
    for (const budget of budgets) {
      const monthlyBudget = budget.annual_budget / 12;
      const actual = marketingActuals
        .filter(a => a.brand_id === brand.id && a.channel === budget.channel && a.month_key === LATEST)
        .reduce((s: number, a: any) => s + a.spend, 0);
      if (actual > monthlyBudget * 1.1) {
        alerts.push({
          id: `budget-${brand.id}-${budget.channel}`,
          brand: brand.name, brandColor: color, level: "warning",
          title: `${budget.channel} budget overspend`,
          detail: `${fmt(actual)} vs ${fmt(monthlyBudget)} monthly budget`,
        });
      }
    }
  }

  const count = alerts.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Alerts</h3>
            <span className="text-xs text-gray-400">{count} active</span>
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">All brands looking good</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {alerts.map(a => (
                <div key={a.id} className="px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors">
                  <div className="w-1 rounded-full flex-shrink-0 self-stretch" style={{ background: a.brandColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-700 truncate">{a.brand}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold flex-shrink-0">⚠ Warning</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-800 mt-0.5">{a.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{a.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
