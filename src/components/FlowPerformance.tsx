"use client";
import { useEffect, useMemo, useState } from "react";

// Per-flow performance under the Lifecycle Flows grid: what each live flow
// actually earned last month and this month, per brand. Data comes from
// klaviyo_flow_metrics (nightly sync) — no live Klaviyo call.
type Row = { brand_id: number; flow_id: string; month_key: string; flow_name: string; status: string | null; recipients: number; opens: number; clicks: number; orders: number; revenue: number };
type Brand = { id: number; name: string; live?: boolean };
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.min(100, Math.round((a / b) * 100))}%` : "—");

export function FlowPerformance({ brands }: { brands: Brand[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");
  useEffect(() => {
    fetch("/api/klaviyo/flow-metrics").then(r => r.json()).then(j => {
      if (!j.ok) return;
      setNeedsSetup(!!j.needsSetup); setRows(j.items || []); setMonths(j.months || []); setMonth((j.months || [])[0] || "");
    }).catch(() => {});
  }, []);
  const name = useMemo(() => new Map(brands.map(b => [b.id, b.name])), [brands]);
  const shown = useMemo(() => rows.filter(r => r.month_key === month && (brandFilter === "all" || r.brand_id === brandFilter)).sort((a, b) => b.revenue - a.revenue || b.recipients - a.recipients), [rows, month, brandFilter]);
  const totals = useMemo(() => shown.reduce((t, r) => ({ recipients: t.recipients + r.recipients, orders: t.orders + r.orders, revenue: t.revenue + r.revenue }), { recipients: 0, orders: 0, revenue: 0 }), [shown]);
  const byBrand = useMemo(() => {
    const m = new Map<number, { revenue: number; flows: number }>();
    rows.filter(r => r.month_key === month).forEach(r => { const c = m.get(r.brand_id) || { revenue: 0, flows: 0 }; c.revenue += r.revenue; c.flows += 1; m.set(r.brand_id, c); });
    return [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [rows, month]);
  const fmtMonth = (mk: string) => mk ? new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";

  if (needsSetup) return <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">Flow performance isn&apos;t set up yet. Run <code className="text-xs bg-white px-1 py-0.5 rounded">supabase/add_klaviyo_flow_metrics_and_campaigns.sql</code> in Supabase, then the nightly sync fills this in.</div>;
  if (!rows.length) return <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">Flow performance fills in after the next Klaviyo sync.</div>;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Flow performance</h2>
          <p className="text-sm text-slate-500">What each flow earned, from Klaviyo&apos;s own attribution. Revenue ex-GST as reported by Klaviyo.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="all">All brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {brandFilter === "all" && (
        <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {byBrand.map(([bid, c]) => (
            <button key={bid} onClick={() => setBrandFilter(bid)} className="text-left rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{name.get(bid) || bid}</p>
              <p className="text-base font-semibold text-slate-800 tabular-nums">{money(c.revenue)}</p>
              <p className="text-[11px] text-slate-400">{c.flows} flow{c.flows === 1 ? "" : "s"} sending</p>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
              <th className="text-left font-semibold px-3 py-2">Flow</th>
              {brandFilter === "all" && <th className="text-left font-semibold px-3 py-2">Brand</th>}
              <th className="text-left font-semibold px-3 py-2">Status</th>
              <th className="text-right font-semibold px-3 py-2">Recipients</th>
              <th className="text-right font-semibold px-3 py-2">Open</th>
              <th className="text-right font-semibold px-3 py-2">Click</th>
              <th className="text-right font-semibold px-3 py-2">Orders</th>
              <th className="text-right font-semibold px-3 py-2">Revenue</th>
              <th className="text-right font-semibold px-3 py-2">$/recipient</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map(r => (
              <tr key={r.brand_id + r.flow_id}>
                <td className="px-3 py-2 text-slate-700 font-medium"><a href={`https://www.klaviyo.com/flow/${r.flow_id}/edit`} target="_blank" rel="noreferrer" className="hover:underline">{r.flow_name}</a></td>
                {brandFilter === "all" && <td className="px-3 py-2 text-slate-500">{name.get(r.brand_id) || r.brand_id}</td>}
                <td className="px-3 py-2"><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${r.status === "live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status || "—"}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.recipients.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{pct(r.opens, r.recipients)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{pct(r.clicks, r.recipients)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.orders.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{money(r.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.recipients ? `$${(r.revenue / r.recipients).toFixed(2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50/70 font-semibold text-slate-700">
              <td className="px-3 py-2" colSpan={brandFilter === "all" ? 3 : 2}>{shown.length} flow{shown.length === 1 ? "" : "s"} · {fmtMonth(month)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.recipients.toLocaleString()}</td>
              <td colSpan={2} />
              <td className="px-3 py-2 text-right tabular-nums">{totals.orders.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totals.revenue)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
