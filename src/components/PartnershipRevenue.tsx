"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtFull } from "@/lib/format";

type Entry = { id: number; company: string | null; brand: string | null; affiliate_code: string | null; cin7_email: string | null; kind: string; status: string | null; created_at: string };
type SaleRow = { brand_id: number; code: string; month_key: string; orders: number; revenue: number };
type Cin7SaleRow = { customer_email: string; month_key: string; orders: number; revenue: number };

// Real performance for every tracked partnership. Two tracking mechanisms,
// merged into one view: most partners have a Shopify discount code
// (influencer_sales, joined by brand_id+code since the same code can span
// multiple brands — e.g. MM15 sells on UPPAbaby, MiaMily and Matchstick
// Monkey at once, so a code-only join would show every brand's row the
// same combined total). A wholesale/reseller account with no code of its
// own (e.g. Baby and Car) is tracked by its Cin7 customer email instead
// (cin7_customer_sales). Both are auto-synced; nothing here is manual.
export function PartnershipRevenue({ brands }: { brands: { id: number; name: string }[] }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [cin7Sales, setCin7Sales] = useState<Cin7SaleRow[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/partnerships/sales").then(r => r.json()).then(d => {
      if (d.ok) { setEntries(d.entries ?? []); setSales(d.sales ?? []); setCin7Sales(d.cin7Sales ?? []); setNeedsSetup(!!d.needsSetup); }
    });
  }, []);

  const brandIdByName = useMemo(() => new Map(brands.map(b => [b.name.toLowerCase(), b.id])), [brands]);

  const byBrandCode = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    for (const s of sales) {
      const key = `${s.brand_id}::${(s.code || "").toUpperCase()}`;
      const cur = m.get(key) ?? { orders: 0, revenue: 0 };
      cur.orders += s.orders; cur.revenue += s.revenue;
      m.set(key, cur);
    }
    return m;
  }, [sales]);

  const byCin7Email = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    for (const s of cin7Sales) {
      const key = (s.customer_email || "").toLowerCase();
      const cur = m.get(key) ?? { orders: 0, revenue: 0 };
      cur.orders += s.orders; cur.revenue += s.revenue;
      m.set(key, cur);
    }
    return m;
  }, [cin7Sales]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries ?? [])
      .filter(e => !q || e.company?.toLowerCase().includes(q) || e.brand?.toLowerCase().includes(q) || e.affiliate_code?.toLowerCase().includes(q) || e.cin7_email?.toLowerCase().includes(q))
      .map(e => {
        if (e.cin7_email) {
          return { ...e, source: "Cin7 account" as const, perf: byCin7Email.get(e.cin7_email.toLowerCase()) ?? { orders: 0, revenue: 0 } };
        }
        const bid = e.brand ? brandIdByName.get(e.brand.toLowerCase()) : undefined;
        const key = `${bid}::${(e.affiliate_code || "").toUpperCase()}`;
        return { ...e, source: e.affiliate_code as string, perf: (bid != null ? byBrandCode.get(key) : undefined) ?? { orders: 0, revenue: 0 } };
      })
      .sort((a, b) => b.perf.revenue - a.perf.revenue);
  }, [entries, byBrandCode, byCin7Email, brandIdByName, search]);

  const totals = useMemo(() => rows.reduce((s, r) => ({ orders: s.orders + r.perf.orders, revenue: s.revenue + r.perf.revenue }), { orders: 0, revenue: 0 }), [rows]);

  if (needsSetup) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Partner revenue</h2>
          <p className="text-xs text-gray-400 mt-0.5">Real performance per partner — Shopify discount codes and Cin7-tracked wholesale accounts, auto-tracked on every sync</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partner, brand or code…" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
      </div>

      {entries === null && <p className="text-sm text-gray-400">Loading…</p>}
      {entries && entries.length === 0 && <p className="text-sm text-gray-400">No partners recorded yet — add one with an affiliate code or Cin7 email in the Tracker sub-tab.</p>}

      {entries && entries.length > 0 && (
        <>
          <div className="flex gap-6 mb-4 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total orders</p><p className="text-lg font-bold text-slate-700 tabular-nums">{totals.orders.toLocaleString()}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total revenue</p><p className="text-lg font-bold text-emerald-600 tabular-nums">{fmtFull(totals.revenue)}</p></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2 pr-3">Partner</th>
                  <th className="text-left font-semibold py-2 pr-3">Brand</th>
                  <th className="text-left font-semibold py-2 pr-3">Code / Source</th>
                  <th className="text-right font-semibold py-2 pr-3">Orders</th>
                  <th className="text-right font-semibold py-2 pr-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">{r.company || "—"}</td>
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{r.brand || (r.cin7_email ? "All brands" : "—")}</td>
                    <td className="py-2 pr-3 font-mono text-[12px] text-slate-600">{r.cin7_email ? <span className="italic text-gray-400 font-sans">Cin7 · {r.cin7_email}</span> : r.source}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{r.perf.orders || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold text-slate-700">{r.perf.revenue ? fmtFull(r.perf.revenue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
