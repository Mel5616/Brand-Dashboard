"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

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
type SubInvoice = {
  id: string; brand_id: number; invoice_no: string; period_month: string; invoice_date: string; due_date: string | null;
  subtotal: number; gst: number; total: number; amount_paid: number; amount_due: number; file_url: string | null; file_name: string | null;
};

export function AffiliatesPanel({ rows, brands, brandFilter, monthKeys, fyLabel, admin }: {
  rows: CFRow[]; brands: Brand[]; brandFilter: "all" | number; monthKeys: string[]; fyLabel: string; admin: boolean;
}) {
  type TxnRow = { date: string; status: string; affiliate: string | null; order_id: string | null; sale_value: number; commission: number; override_fee: number; commission_pct: number | null };
  const [tops, setTops] = useState<{
    affiliates: Roll[]; coupons: Roll[]; distinctAffiliates: number;
    invoices: { invoice_id: string; transactions: number; cost: number }[];
    monthly: { month_key: string; sales: number; cost: number }[]; transactionRows: TxnRow[];
  } | null>(null);
  const from = `${monthKeys[0]}-01`;
  const to = (() => { const [y, m] = monthKeys[monthKeys.length - 1].split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`; })();

  useEffect(() => {
    const b = brandFilter === "all" ? "all" : String(brandFilter);
    fetch(`/api/affiliates?from=${from}&to=${to}&brand=${b}`, { cache: "no-store" })
      .then(r => r.json()).then(d => { if (d.ok) setTops({
        affiliates: d.affiliates ?? [], coupons: d.coupons ?? [], distinctAffiliates: d.distinctAffiliates ?? 0,
        invoices: d.invoices ?? [], monthly: d.monthly ?? [], transactionRows: d.transactionRows ?? [],
      }); })
      .catch(() => { /* panel still works from the monthly rollup */ });
  }, [from, to, brandFilter]);

  // CF's monthly platform SUBSCRIPTION invoices (e.g. "Grow technology plan")
  // — a flat fee, entirely separate from affiliate commission/override fee.
  // Not exposed by CF's Transactions API, so entered manually with the PDF.
  const [subInvoices, setSubInvoices] = useState<SubInvoice[]>([]);
  const [subNeedsSetup, setSubNeedsSetup] = useState(false);
  const loadSubInvoices = () => fetch("/api/cf-invoices").then(r => r.json()).then(d => {
    if (d.needsSetup) setSubNeedsSetup(true); else if (d.ok) setSubInvoices(d.rows ?? []);
  }).catch(() => {});
  useEffect(() => { loadSubInvoices(); }, []);
  const subInScope = useMemo(
    () => subInvoices.filter(i => (brandFilter === "all" || i.brand_id === brandFilter) && monthKeys.includes(i.period_month)),
    [subInvoices, brandFilter, monthKeys]);

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

  if (inScope.length === 0 && subInScope.length === 0 && !admin) {
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

  // Monthly invoice cost per brand — two genuinely different things CF bills
  // for, kept as separate rows rather than blended into one number since
  // they carry different GST treatment: commission + override fee on
  // Approved transactions (excl GST, from CF's Transactions API), and the
  // flat monthly platform subscription fee (incl GST, from the manually
  // uploaded PDF invoices below). Pending/Void aren't a real invoiced cost.
  const brandName = (id: number) => brands.find(b => b.id === id)?.name ?? `Brand ${id}`;
  const invoiceRows = useMemo(() => {
    const m = new Map<string, { month_key: string; brand_id: number; commission_cost: number; subscription_cost: number }>();
    const cell = (mk: string, bid: number) => {
      const k = `${mk}:${bid}`;
      const cur = m.get(k) ?? { month_key: mk, brand_id: bid, commission_cost: 0, subscription_cost: 0 };
      m.set(k, cur);
      return cur;
    };
    for (const r of inScope) {
      if (r.status !== "Approved") continue;
      cell(r.month_key, r.brand_id).commission_cost += r.commission + r.override_fee;
    }
    for (const i of subInScope) {
      cell(i.period_month, i.brand_id).subscription_cost += i.total;
    }
    return [...m.values()].sort((a, b) => b.month_key.localeCompare(a.month_key) || a.brand_id - b.brand_id);
  }, [inScope, subInScope]);

  // Effectiveness chart — Attributed sales vs Total cost (commission + fees
  // + the flat subscription fee), by month, in chronological order. This is
  // the "is the platform worth it net of everything we're paying for it"
  // view — Approved transactions only, same basis as Monthly invoice cost.
  const chartSeries = useMemo(() => monthKeys.map(mk => {
    const m = tops?.monthly.find(x => x.month_key === mk);
    const subCost = subInScope.filter(i => i.period_month === mk).reduce((s, i) => s + i.total, 0);
    return { month_key: mk, sales: m?.sales ?? 0, cost: (m?.cost ?? 0) + subCost };
  }), [monthKeys, tops, subInScope]);
  const totalSalesAllMonths = chartSeries.reduce((s, r) => s + r.sales, 0);
  const totalCostAllMonths = chartSeries.reduce((s, r) => s + r.cost, 0);

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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Platform effectiveness</p>
        <p className="text-xs text-gray-400 mb-3">
          Attributed sales vs total cost (commission + fees + the monthly subscription fee), Approved transactions only, by month.
          Net across this range: {fmtFull(totalSalesAllMonths - totalCostAllMonths)}.
        </p>
        {chartSeries.every(r => !r.sales && !r.cost) ? (
          <p className="text-sm text-gray-400">Nothing approved in this range yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            <Bar
              data={{
                labels: chartSeries.map(r => r.month_key),
                datasets: [
                  { label: "Attributed sales", data: chartSeries.map(r => r.sales), backgroundColor: "#8a79ad", borderRadius: 4 },
                  { label: "Total cost", data: chartSeries.map(r => r.cost), backgroundColor: "#f0a35c", borderRadius: 4 },
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtFull(c.parsed.y ?? 0)}` } } },
                scales: { y: { ticks: { callback: v => fmt(Number(v)) } } },
              }}
            />
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Top title="Top affiliates" items={tops?.affiliates ?? []} empty="No affiliate activity yet." />
        <Top title="Coupon performance" items={tops?.coupons ?? []} empty="No coupon-attributed sales yet." />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Transactions</p>
        <p className="text-xs text-gray-400 mb-3">Individual sales, with commission as a % of that sale. Most recent 200 in range.</p>
        {(tops?.transactionRows ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No transactions in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left border-b border-gray-100">
                <th className="font-medium py-1.5">Date</th><th className="font-medium">Affiliate</th><th className="font-medium">Order</th>
                <th className="font-medium">Status</th><th className="font-medium text-right">Sale value</th>
                <th className="font-medium text-right">Commission</th><th className="font-medium text-right">Commission %</th>
              </tr>
            </thead>
            <tbody>
              {(tops?.transactionRows ?? []).map((t, i) => (
                <tr key={`${t.order_id}-${t.date}-${i}`} className="border-b border-gray-50 text-slate-700">
                  <td className="py-1.5 whitespace-nowrap">{dMY(t.date)}</td>
                  <td className="max-w-[180px] truncate" title={t.affiliate ?? undefined}>{t.affiliate ?? "—"}</td>
                  <td className="font-mono text-[12px] text-gray-500">{t.order_id ?? "—"}</td>
                  <td>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.status === "Approved" ? "bg-emerald-100 text-emerald-700" : t.status === "Void" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>{t.status}</span>
                  </td>
                  <td className="text-right">{fmtFull(t.sale_value)}</td>
                  <td className="text-right">{fmtFull(t.commission)}</td>
                  <td className="text-right font-semibold">{t.commission_pct != null ? `${t.commission_pct.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Monthly invoice cost</p>
        <p className="text-xs text-gray-400 mb-3">Commission + platform fee (excl GST, Approved transactions only) and the flat monthly subscription fee (incl GST) — kept separate since they&apos;re billed differently.</p>
        {invoiceRows.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing invoiced in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left border-b border-gray-100">
                <th className="font-medium py-1.5">Month</th><th className="font-medium">Brand</th>
                <th className="font-medium text-right">Commission + fees</th><th className="font-medium text-right">Subscription</th><th className="font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoiceRows.map(r => (
                <tr key={`${r.month_key}-${r.brand_id}`} className="border-b border-gray-50 text-slate-700">
                  <td className="py-1.5">{r.month_key}</td><td>{brandName(r.brand_id)}</td>
                  <td className="text-right">{r.commission_cost ? fmtFull(r.commission_cost) : "—"}</td>
                  <td className="text-right">{r.subscription_cost ? fmtFull(r.subscription_cost) : "—"}</td>
                  <td className="text-right font-semibold">{fmtFull(r.commission_cost + r.subscription_cost)}</td>
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
      <SubscriptionInvoices brands={brands} rows={subInScope.length || !admin ? subInScope : subInvoices} admin={admin} onAdded={loadSubInvoices} needsSetup={subNeedsSetup} />
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const dMY = (s: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

function SubscriptionInvoices({ brands, rows, admin, onAdded, needsSetup }: {
  brands: Brand[]; rows: SubInvoice[]; admin: boolean; onAdded: () => void; needsSetup: boolean;
}) {
  const cfBrands = brands.filter(b => CF_BRAND_IDS.includes(b.id));
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ brand_id: String(cfBrands[0]?.id ?? ""), invoice_no: "", period_month: new Date().toISOString().slice(0, 7), invoice_date: today(), due_date: "", subtotal: "", gst: "", total: "", amount_paid: "", amount_due: "0" });
  const set = (patch: Partial<typeof f>) => setF(p => ({ ...p, ...patch }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";

  async function add() {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(f)) fd.set(k, v);
      const file = fileRef.current?.files?.[0]; if (file) fd.set("file", file);
      const d = await fetch("/api/cf-invoices", { method: "POST", body: fd }).then(r => r.json());
      if (d.ok) {
        setF(p => ({ ...p, invoice_no: "", subtotal: "", gst: "", total: "", amount_paid: "", amount_due: "0" }));
        if (fileRef.current) fileRef.current.value = "";
        onAdded();
      } else { setErr(d.error || "Could not save."); }
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this invoice?")) return;
    const d = await fetch(`/api/cf-invoices?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) onAdded();
  }
  const brandName = (id: number) => brands.find(b => b.id === id)?.name ?? `Brand ${id}`;

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-sm text-gray-500">
      Run <code className="bg-gray-100 px-1 rounded">add_cf_subscription_invoices.sql</code> in Supabase to track CF&apos;s monthly subscription invoices.
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Subscription invoices</p>
      <p className="text-xs text-gray-400 mb-3">
        Commission Factory&apos;s flat monthly platform fee (e.g. &quot;Grow technology plan&quot;) — emailed as a PDF, not exposed by its API, so logged here manually.
      </p>

      {admin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2 mb-4 items-end">
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Brand</span>
            <select value={f.brand_id} onChange={e => set({ brand_id: e.target.value })} className={inp}>
              {cfBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Invoice no.</span>
            <input value={f.invoice_no} onChange={e => set({ invoice_no: e.target.value })} className={inp} placeholder="CF-93814-…" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Period</span>
            <input type="month" value={f.period_month} onChange={e => set({ period_month: e.target.value })} className={inp} /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Invoice date</span>
            <input type="date" value={f.invoice_date} onChange={e => set({ invoice_date: e.target.value })} className={inp} /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Due date</span>
            <input type="date" value={f.due_date} onChange={e => set({ due_date: e.target.value })} className={inp} /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Subtotal</span>
            <input value={f.subtotal} onChange={e => set({ subtotal: e.target.value })} inputMode="decimal" className={inp} placeholder="500" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">GST</span>
            <input value={f.gst} onChange={e => set({ gst: e.target.value })} inputMode="decimal" className={inp} placeholder="50" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Total (incl GST)</span>
            <input value={f.total} onChange={e => set({ total: e.target.value })} inputMode="decimal" className={inp} placeholder="550" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">PDF</span>
            <input ref={fileRef} type="file" accept="application/pdf" className="text-xs w-full" /></label>
          <div className="col-span-2 sm:col-span-4 lg:col-span-9 flex items-center gap-3">
            <button onClick={add} disabled={busy || !f.invoice_no || !f.total} className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
              {busy ? "Saving…" : "Add invoice"}
            </button>
            {err && <span className="text-xs text-rose-500">{err}</span>}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">None uploaded for this range yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left border-b border-gray-100">
              <th className="font-medium py-1.5">Period</th><th className="font-medium">Brand</th><th className="font-medium">Invoice #</th>
              <th className="font-medium">Date</th><th className="font-medium text-right">Total</th><th className="font-medium"></th>{admin && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 text-slate-700">
                <td className="py-1.5">{r.period_month}</td><td>{brandName(r.brand_id)}</td>
                <td className="font-mono text-[12.5px]">{r.invoice_no}</td>
                <td className="text-gray-500">{dMY(r.invoice_date)}</td>
                <td className="text-right font-semibold">{fmtFull(r.total)}</td>
                <td>{r.file_url && <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline text-[12px]">PDF</a>}</td>
                {admin && <td className="text-right"><button onClick={() => remove(r.id)} className="text-gray-300 hover:text-rose-500" title="Delete">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
