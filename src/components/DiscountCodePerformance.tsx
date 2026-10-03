"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtFull } from "@/lib/format";

type Row = {
  brand_id: number; code: string; batch: boolean; code_count: number; orders: number; net_revenue: number; aov: number;
  discount_given: number; discount_pct: number; new_customer_pct: number; cost_coverage: number; est_margin_pct: number | null;
};
type Brand = { id: number; name: string };
type SortKey = "net_revenue" | "orders" | "aov" | "discount_given" | "discount_pct" | "new_customer_pct" | "est_margin_pct";

const PERIODS: { id: string; label: string }[] = [
  { id: "this", label: "This month" }, { id: "last", label: "Last month" }, { id: "3m", label: "Last 3 months" },
];
const COLS: { key: SortKey; label: string; tip?: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "net_revenue", label: "Revenue", tip: "Ex-GST, after the discount" },
  { key: "aov", label: "AOV" },
  { key: "discount_given", label: "Discount given", tip: "Ex-GST, what the code cost you" },
  { key: "discount_pct", label: "% of gross", tip: "Discount as a share of revenue before the discount" },
  { key: "new_customer_pct", label: "New customers", tip: "Share of orders from a customer's first order" },
  { key: "est_margin_pct", label: "Est. margin", tip: "From the cost sheet by SKU prefix. Hidden when under 60% of items could be costed." },
];

export function DiscountCodePerformance({ brands }: { brands: Brand[] }) {
  const [period, setPeriod] = useState("3m");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandF, setBrandF] = useState("");
  const [sort, setSort] = useState<SortKey>("net_revenue");
  const [q, setQ] = useState("");
  const brandName = useMemo(() => new Map(brands.map(b => [b.id, b.name])), [brands]);

  useEffect(() => {
    fetch(`/api/discount-code-performance?period=${period}`, { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true); else setRows(d.rows ?? []);
    }).catch(() => setRows([]));
  }, [period]);

  const shown = useMemo(() => {
    const list = (rows ?? []).filter(r => (!brandF || String(r.brand_id) === brandF) && (!q || r.code.toLowerCase().includes(q.toLowerCase())));
    return [...list].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1)).slice(0, 40);
  }, [rows, brandF, q, sort]);

  const totals = useMemo(() => {
    const list = (rows ?? []).filter(r => !brandF || String(r.brand_id) === brandF);
    return { orders: list.reduce((s, r) => s + r.orders, 0), rev: list.reduce((s, r) => s + r.net_revenue, 0), disc: list.reduce((s, r) => s + r.discount_given, 0) };
  }, [rows, brandF]);

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-sm text-gray-500">
      Run <code className="bg-gray-100 px-1 rounded">supabase/add_discount_code_performance.sql</code> in Supabase, then the next sync fills in code performance.
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Code performance</h3>
          <p className="text-xs text-gray-400 mt-0.5">What each code actually brought in, from real orders. Revenue and discount are ex-GST.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={brandF} onChange={e => setBrandF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
            <option value="">All brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code" className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-32" />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => { if (p.id !== period) { setRows(null); setPeriod(p.id); } }} className={`text-xs font-semibold px-3 py-1.5 ${period === p.id ? "bg-slate-800 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {rows === null ? <p className="text-sm text-gray-400 py-8 text-center">Loading…</p> : (
        <>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[["Orders with a code", totals.orders.toLocaleString()], ["Revenue through codes", fmtFull(totals.rev)], ["Discount given", fmtFull(totals.disc)]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{l}</div>
                <div className="text-lg font-extrabold text-slate-800 tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Brand</th>
                  {COLS.map(c => (
                    <th key={c.key} title={c.tip} className="py-2 pr-3 text-right">
                      <button onClick={() => setSort(c.key)} className={`uppercase tracking-wide font-bold ${sort === c.key || (c.key === "net_revenue" && sort === "net_revenue") ? "text-slate-800" : "text-gray-400 hover:text-gray-600"}`}>{c.label}{sort === c.key ? " ↓" : ""}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={`${r.brand_id}|${r.code}`} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-[13px] font-semibold text-slate-700">
                      {r.code}{r.batch && <span className="ml-1.5 font-sans text-[11px] font-medium text-gray-400">{r.code_count} codes</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500">{brandName.get(r.brand_id) ?? r.brand_id}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{r.orders}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-slate-800">{fmtFull(r.net_revenue)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{fmtFull(r.aov)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{fmtFull(r.discount_given)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{r.discount_pct}%</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{r.new_customer_pct}%</td>
                    <td className="py-2.5 text-right tabular-nums" title={`${r.cost_coverage}% of items costed`}>
                      {r.est_margin_pct == null ? <span className="text-gray-300">—</span> : <span className={r.est_margin_pct < 25 ? "text-rose-600 font-semibold" : ""}>{r.est_margin_pct}%</span>}
                    </td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={9} className="py-10 text-center text-gray-400">No code orders in this period yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Single-use code batches (like UBL-xxxx) are grouped on one row. New customers counts first-ever orders as of the last sync. Est. margin uses cost-sheet landed costs matched by SKU prefix, so treat it as a guide, and it shows a dash when less than 60% of items could be costed.
          </p>
        </>
      )}
    </div>
  );
}
