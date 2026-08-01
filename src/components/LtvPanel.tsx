"use client";

import React from "react";
import { fmtFull } from "@/lib/format";
import { SkeletonCard } from "./Skeleton";

// Customer value: repeat-purchase cohorts from Shopify order history. Answers
// "what's a new customer worth over a year, and do they come back?" per brand.

type Row = {
  brand_id: number; cohort_month: string; customers: number; repeat_customers: number;
  orders_total: number; revenue_first: number; revenue_90d: number; revenue_365d: number;
};

const mLabel = (mk: string) => { const [y, m] = mk.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }); };

export function LtvPanel({ brands }: { brands: { id: number; name: string; color: string }[] }) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [sel, setSel] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch("/api/ltv").then(r => r.json()).then(d => { setRows(d.rows ?? []); setNeedsSetup(!!d.needsSetup); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <SkeletonCard title="Customer value (LTV)" lines={5} />;
  if (needsSetup) return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Customer value (LTV)</h2>
      <p className="text-sm text-gray-400">Run <code className="bg-gray-100 px-1 rounded">supabase/add_ltv_cohorts.sql</code>, then the ltv-cohorts workflow fills this in.</p>
    </div>
  );
  if (rows.length === 0) return null;

  const withData = brands.filter(b => rows.some(r => r.brand_id === b.id && r.customers > 0));
  const active = sel ?? withData[0]?.id ?? null;
  if (active == null) return null;
  const bRows = rows.filter(r => r.brand_id === active && r.customers > 0);

  // Brand summary across mature cohorts (12+ months old, so revenue_365d is complete)
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
  const cutKey = cutoff.toISOString().slice(0, 7);
  const summary = (list: Row[]) => {
    const mature = list.filter(r => r.cohort_month <= cutKey);
    const src = mature.length >= 3 ? mature : list;
    const cust = src.reduce((s, r) => s + r.customers, 0);
    if (!cust) return null;
    return {
      mature: mature.length >= 3,
      ltv365: src.reduce((s, r) => s + r.revenue_365d, 0) / cust,
      first: src.reduce((s, r) => s + r.revenue_first, 0) / cust,
      repeat: src.reduce((s, r) => s + r.repeat_customers, 0) / cust,
      orders: src.reduce((s, r) => s + r.orders_total, 0) / cust,
    };
  };
  const sum = summary(bRows);
  const recent = bRows.slice(-13).reverse();

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Customer value (LTV)</h2>
          <p className="text-xs text-gray-400 mt-0.5">What a new customer is worth — grouped by the month they first bought</p>
        </div>
        <select value={active} onChange={e => setSel(Number(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
          {withData.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {sum && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "12-month value / customer", value: fmtFull(Math.round(sum.ltv365)), sub: sum.mature ? "mature cohorts" : "early read — young cohorts" },
            { label: "First order", value: fmtFull(Math.round(sum.first)), sub: "avg first purchase" },
            { label: "Come back & buy again", value: (sum.repeat * 100).toFixed(1) + "%", sub: "within the window" },
            { label: "Orders / customer", value: sum.orders.toFixed(2), sub: "lifetime so far" },
          ].map(k => (
            <div key={k.label} className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 leading-tight">{k.label}</p>
              <p className="text-lg font-bold text-gray-900">{k.value}</p>
              <p className="text-[10.5px] text-gray-400">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="text-left py-1.5">First bought</th>
              <th className="text-right py-1.5">New customers</th>
              <th className="text-right py-1.5">Repeat %</th>
              <th className="text-right py-1.5">90-day $/cust</th>
              <th className="text-right py-1.5">12-mo $/cust</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(r => {
              const young = r.cohort_month > cutKey;
              return (
                <tr key={r.cohort_month} className="border-b border-gray-50">
                  <td className="py-1.5 font-semibold text-slate-700">{mLabel(r.cohort_month)}{young && <span className="text-[9.5px] text-gray-300 ml-1">(still maturing)</span>}</td>
                  <td className="py-1.5 text-right text-slate-600">{r.customers.toLocaleString()}</td>
                  <td className="py-1.5 text-right text-slate-600">{((r.repeat_customers / r.customers) * 100).toFixed(1)}%</td>
                  <td className="py-1.5 text-right text-slate-600">{fmtFull(Math.round(r.revenue_90d / r.customers))}</td>
                  <td className={`py-1.5 text-right font-semibold ${young ? "text-gray-300" : "text-slate-800"}`}>{fmtFull(Math.round(r.revenue_365d / r.customers))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-gray-300 mt-2">Logged-in customers only (guests can't be tracked across orders) · revenue ex-GST · refreshed monthly</p>
    </div>
  );
}
