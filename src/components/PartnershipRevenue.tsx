"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtFull } from "@/lib/format";

type Entry = { id: number; company: string | null; brand: string | null; affiliate_code: string; kind: string; status: string | null; created_at: string };
type SaleRow = { brand_id: number; code: string; month_key: string; orders: number; revenue: number };

// Real Shopify performance for every partner/affiliate discount code — one
// row per (brand, code), aggregated across every month it's ever sold.
// Auto-tracked via scripts/sync_influencer_sales.py; nothing here is
// manually entered. Joined by brand_id + code, not code alone — the same
// code can span multiple brands (e.g. MM15 sells on UPPAbaby, MiaMily and
// Matchstick Monkey at once), so a code-only join would show every brand's
// row the same combined total.
export function PartnershipRevenue({ brands }: { brands: { id: number; name: string }[] }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/partnerships/sales").then(r => r.json()).then(d => {
      if (d.ok) { setEntries(d.entries ?? []); setSales(d.sales ?? []); setNeedsSetup(!!d.needsSetup); }
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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries ?? [])
      .filter(e => !q || e.company?.toLowerCase().includes(q) || e.brand?.toLowerCase().includes(q) || e.affiliate_code.toLowerCase().includes(q))
      .map(e => {
        const bid = e.brand ? brandIdByName.get(e.brand.toLowerCase()) : undefined;
        const key = `${bid}::${e.affiliate_code.toUpperCase()}`;
        return { ...e, perf: (bid != null ? byBrandCode.get(key) : undefined) ?? { orders: 0, revenue: 0 } };
      })
      .sort((a, b) => b.perf.revenue - a.perf.revenue);
  }, [entries, byBrandCode, brandIdByName, search]);

  const totals = useMemo(() => rows.reduce((s, r) => ({ orders: s.orders + r.perf.orders, revenue: s.revenue + r.perf.revenue }), { orders: 0, revenue: 0 }), [rows]);

  if (needsSetup) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Partner code revenue</h2>
          <p className="text-xs text-gray-400 mt-0.5">Real Shopify performance per affiliate/partner discount code — auto-tracked, updated on every sync</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partner, brand or code…" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
      </div>

      {entries === null && <p className="text-sm text-gray-400">Loading…</p>}
      {entries && entries.length === 0 && <p className="text-sm text-gray-400">No partner codes recorded yet — add one with an affiliate code in the Tracker sub-tab.</p>}

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
                  <th className="text-left font-semibold py-2 pr-3">Code</th>
                  <th className="text-right font-semibold py-2 pr-3">Orders</th>
                  <th className="text-right font-semibold py-2 pr-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">{r.company || "—"}</td>
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{r.brand || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-[12px] text-slate-600">{r.affiliate_code}</td>
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
