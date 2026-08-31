"use client";

import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Entry = { id: number; company: string | null; brand: string | null; affiliate_code: string | null; cin7_email: string | null; kind: string; status: string | null; created_at: string };
type SaleRow = { brand_id: number; code: string; month_key: string; orders: number; revenue: number };
type Cin7SaleRow = { customer_email: string; month_key: string; orders: number; revenue: number };
type CfAffiliate = { name: string; transactions: number; sale_value: number };

// Real performance for every tracked partnership, from three different
// tracking mechanisms merged into one view:
//  - most partners have a Shopify discount code (influencer_sales, joined
//    by brand_id+code since the same code can span multiple brands — e.g.
//    MM15 sells on UPPAbaby, MiaMily and Matchstick Monkey at once, so a
//    code-only join would show every brand's row the same combined total)
//  - a wholesale/reseller account with no code of its own (e.g. Baby and
//    Car) is tracked by its Cin7 customer email instead (cin7_customer_sales)
//  - Commission Factory affiliates are a program, not partnership_entries
//    rows — their sale_value is ATTRIBUTED revenue already counted in
//    Shopify/store revenue, so it's shown separately and never folded into
//    the "Total revenue" card above (that card is genuinely incremental
//    partner-driven revenue; CF's isn't new revenue, just credit for it).
// All auto-synced; nothing here is manually entered.
export function PartnershipRevenue({ brands }: { brands: { id: number; name: string }[] }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [cin7Sales, setCin7Sales] = useState<Cin7SaleRow[]>([]);
  const [cfAffiliates, setCfAffiliates] = useState<CfAffiliate[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/partnerships/sales").then(r => r.json()).then(d => {
      if (d.ok) { setEntries(d.entries ?? []); setSales(d.sales ?? []); setCin7Sales(d.cin7Sales ?? []); setCfAffiliates(d.cfAffiliates ?? []); setNeedsSetup(!!d.needsSetup); }
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
  const cfTotal = useMemo(() => cfAffiliates.reduce((s, a) => s + a.sale_value, 0), [cfAffiliates]);

  // Top 8 by revenue, grouped by company (a partner can have several
  // rows — e.g. Medical Mums' MM15 spans three brands) so the chart reads
  // as "who", not "which individual code/brand pairing".
  const chartData = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.company || "—", (m.get(r.company || "—") ?? 0) + r.perf.revenue);
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  if (needsSetup) return null;

  return (
    <div className="space-y-4">
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

            {chartData.length > 0 && (
              <div className="mb-5" style={{ height: 200 }}>
                <Bar
                  data={{
                    labels: chartData.map(([name]) => name),
                    datasets: [{ label: "Revenue", data: chartData.map(([, v]) => v), backgroundColor: "#0891b2", borderRadius: 4 }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtFull(c.parsed.y ?? 0) } } },
                    scales: { y: { ticks: { callback: v => fmt(Number(v)) } }, x: { ticks: { font: { size: 10.5 } } } },
                  }}
                />
              </div>
            )}

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

      {cfAffiliates.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Commission Factory affiliates</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Last 12 months, top 15 by attributed sales — this revenue is already counted in store revenue, so it&apos;s shown separately rather than added to the total above.</p>
          <div className="mb-4 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 inline-block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Attributed sales</p>
            <p className="text-lg font-bold text-slate-700 tabular-nums">{fmtFull(cfTotal)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2 pr-3">Affiliate</th>
                  <th className="text-right font-semibold py-2 pr-3">Transactions</th>
                  <th className="text-right font-semibold py-2 pr-3">Attributed sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cfAffiliates.map(a => (
                  <tr key={a.name}>
                    <td className="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">{a.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{a.transactions}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold text-slate-700">{fmtFull(a.sale_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
