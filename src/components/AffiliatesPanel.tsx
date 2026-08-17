"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt, fmtFull } from "@/lib/format";

// Commission Factory affiliate performance.
//
// Deliberate: sale value is ATTRIBUTED revenue — those orders already sit in the
// brand's Shopify revenue, so it is never added to store revenue anywhere. The
// number that is genuinely new is the COST: commission + CF's override fee.
// Only these brands run a Commission Factory program. Everyone else has no CF
// merchant account, so showing them an empty affiliate view would imply
// "coming soon" rather than "not applicable". Add an id here if a program launches.
export const CF_BRAND_IDS = [0, 5]; // Nanit, UPPAbaby

type CFRow = { brand_id: number; month_key: string; status: string; transactions: number; sale_value: number; commission: number; override_fee: number };
type Brand = { id: number; name: string; color?: string };
type Roll = { name: string; transactions: number; sale_value: number; cost: number };

export function AffiliatesPanel({ rows, brands, brandFilter, monthKeys, fyLabel }: {
  rows: CFRow[]; brands: Brand[]; brandFilter: "all" | number; monthKeys: string[]; fyLabel: string;
}) {
  const [tops, setTops] = useState<{ affiliates: Roll[]; coupons: Roll[]; distinctAffiliates: number; invoices: { invoice_id: string; transactions: number; cost: number }[] } | null>(null);
  const from = `${monthKeys[0]}-01`;
  const to = (() => { const [y, m] = monthKeys[monthKeys.length - 1].split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`; })();

  useEffect(() => {
    const b = brandFilter === "all" ? "all" : String(brandFilter);
    fetch(`/api/affiliates?from=${from}&to=${to}&brand=${b}`, { cache: "no-store" })
      .then(r => r.json()).then(d => { if (d.ok) setTops({ affiliates: d.affiliates ?? [], coupons: d.coupons ?? [], distinctAffiliates: d.distinctAffiliates ?? 0, invoices: d.invoices ?? [] }); })
      .catch(() => { /* panel still works from the monthly rollup */ });
  }, [from, to, brandFilter]);

  const inScope = useMemo(
    () => rows.filter(r => (brandFilter === "all" || r.brand_id === brandFilter) && monthKeys.includes(r.month_key)),
    [rows, brandFilter, monthKeys]);

  // Void = cancelled. Costs nothing, earned nothing.
  const live = inScope.filter(r => r.status !== "Void");
  const approved = live.filter(r => r.status === "Approved");
  const pending = live.filter(r => r.status !== "Approved");
  const sum = (a: CFRow[], f: (r: CFRow) => number) => a.reduce((s, r) => s + (f(r) || 0), 0);

  const sales = sum(live, r => r.sale_value);
  const cost = sum(live, r => r.commission + r.override_fee);
  const commission = sum(live, r => r.commission);
  const fees = sum(live, r => r.override_fee);
  const txns = sum(live, r => r.transactions);
  const rate = sales > 0 ? (cost / sales) * 100 : 0;
  const roi = cost > 0 ? sales / cost : 0;

  if (inScope.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-slate-600 font-medium">No affiliate transactions yet</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-lg mx-auto">
          Commission Factory runs for <strong className="font-semibold text-gray-500">UPPAbaby and Nanit</strong> only, and both
          programs are newly launched. Real transactions appear here as they come in — Commission Factory&apos;s own test
          transactions are excluded on purpose.
        </p>
      </div>
    );
  }

  const kpis = [
    { label: "Attributed sales", value: fmtFull(sales), sub: "already in store revenue" },
    { label: "Affiliate cost", value: fmtFull(cost), sub: `${fmtFull(commission)} commission + ${fmtFull(fees)} fees` },
    { label: "Effective rate", value: `${rate.toFixed(1)}%`, sub: "cost ÷ attributed sales" },
    { label: "Return on cost", value: `${roi.toFixed(1)}×`, sub: "attributed sales per $1" },
    { label: "Transactions", value: txns.toLocaleString(), sub: `${sum(pending, r => r.transactions)} not yet approved` },
    { label: "Affiliates", value: (tops?.distinctAffiliates ?? 0).toLocaleString(), sub: brandFilter === "all" ? "across both sites" : "have driven a sale" },
  ];

  // Monthly invoice cost per brand — what Commission Factory actually bills
  // (commission + its platform fee) for approved transactions, by month.
  // Pending/Void aren't a real invoiced cost yet, so they're excluded here
  // even though they still show in the KPI band above.
  const brandName = (id: number) => brands.find(b => b.id === id)?.name ?? `Brand ${id}`;
  const invoiceRows = useMemo(() => {
    const m = new Map<string, { month_key: string; brand_id: number; cost: number }>();
    for (const r of inScope) {
      if (r.status !== "Approved") continue;
      const k = `${r.month_key}:${r.brand_id}`;
      const cur = m.get(k) ?? { month_key: r.month_key, brand_id: r.brand_id, cost: 0 };
      cur.cost += r.commission + r.override_fee;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.month_key.localeCompare(a.month_key) || a.brand_id - b.brand_id);
  }, [inScope]);

  const Top = ({ title, items, empty }: { title: string; items: Roll[]; empty: string }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">{title}</p>
      {items.length === 0 ? <p className="text-sm text-gray-400">{empty}</p> : (
        <div className="space-y-1.5">
          {items.map(a => {
            const max = Math.max(1, ...items.map(x => x.sale_value));
            return (
              <div key={a.name} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs font-medium text-slate-600 truncate" title={a.name}>{a.name}</span>
                <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(a.sale_value / max) * 100}%`, background: "#8a79ad" }} />
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">{fmt(a.sale_value)}</span>
                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{fmtFull(a.cost)} cost</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Commission Factory <span className="font-normal text-gray-400 normal-case tracking-normal">· {fyLabel}</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-gray-50/70 rounded-xl px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">{k.label}</p>
              <p className="text-lg font-bold text-slate-800 leading-none mt-1">{k.value}</p>
              <p className="text-[10px] text-gray-400 mt-1 leading-tight">{k.sub}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
          Attributed sales are <strong className="font-semibold text-gray-500">not extra revenue</strong> — those orders already sit in the brand&apos;s
          Shopify total. The new number here is the cost: affiliate commission plus Commission Factory&apos;s platform fee.
          Cancelled (Void) transactions are excluded.
          {pending.length > 0 && <> {sum(pending, r => r.transactions)} transaction{sum(pending, r => r.transactions) === 1 ? " is" : "s are"} not yet approved, so the cost may still move.</>}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Top title="Top affiliates" items={tops?.affiliates ?? []} empty="No affiliate activity yet." />
        <Top title="Coupon performance" items={tops?.coupons ?? []} empty="No coupon-attributed sales yet." />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Monthly invoice cost</p>
        <p className="text-xs text-gray-400 mb-3">Commission + platform fee on Approved transactions — Pending and Void aren&apos;t a real invoiced cost yet.</p>
        {invoiceRows.length === 0 ? (
          <p className="text-sm text-gray-400">No approved transactions in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left border-b border-gray-100">
                <th className="font-medium py-1.5">Month</th><th className="font-medium">Brand</th><th className="font-medium text-right">Invoiced cost</th>
              </tr>
            </thead>
            <tbody>
              {invoiceRows.map(r => (
                <tr key={`${r.month_key}-${r.brand_id}`} className="border-b border-gray-50 text-slate-700">
                  <td className="py-1.5">{r.month_key}</td><td>{brandName(r.brand_id)}</td>
                  <td className="text-right font-semibold">{fmtFull(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Invoices</p>
        <p className="text-xs text-gray-400 mb-3">Commission Factory&apos;s own invoice numbers, once it issues a payout invoice covering a transaction — not every approved transaction has one immediately.</p>
        {(tops?.invoices ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No invoices issued yet for transactions in this range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left border-b border-gray-100">
                <th className="font-medium py-1.5">Invoice #</th><th className="font-medium text-right">Transactions</th><th className="font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(tops?.invoices ?? []).map(inv => (
                <tr key={inv.invoice_id} className="border-b border-gray-50 text-slate-700">
                  <td className="py-1.5 font-mono text-[12.5px]">{inv.invoice_id}</td>
                  <td className="text-right">{inv.transactions}</td>
                  <td className="text-right font-semibold">{fmtFull(inv.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
