"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt, fmtFull } from "@/lib/format";

// Creator / influencer discount codes, read live from Shopify per code.
// Sale value is ATTRIBUTED revenue (already in Shopify) - never additive.
// Cost = discount given to customers + commission owed to the creator.

type Order = { id: string; name: string; created_at: string; customer: string; first_order: boolean; subtotal: number; discount: number; shipping: number; refunded: number; net: number; commission: number; status: string };
type Month = { month_key: string; orders: number; net: number; discount: number; commission: number };
type Payout = { id: string; creator_id: string; month_key: string; amount: number; paid_on: string; reference: string | null };
type Creator = {
  id: string; brand_id: number; code: string; creator_name: string; handle: string | null; platform: string | null; followers: number | null;
  commission_pct: number; offer: string | null; program: string | null; started_on: string | null; active: boolean; notes: string | null;
  live: boolean; orders: Order[]; monthly: Month[]; payouts: Payout[];
  totals: { orders: number; net: number; discount: number; commission: number; first_orders: number; paid: number; owed: number };
};
type Brand = { id: number; name: string };

const day = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const monthLabel = (k: string) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }); };
const empty = { brand_id: "", code: "", creator_name: "", handle: "", platform: "instagram", followers: "", commission_pct: "0", offer: "", program: "", started_on: new Date().toISOString().slice(0, 10), notes: "" };

export function CreatorCodesPanel({ brands, brandFilter, monthKeys, admin }: { brands: Brand[]; brandFilter: "all" | number; monthKeys: string[]; admin: boolean }) {
  const [rows, setRows] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ ...empty, brand_id: brandFilter === "all" ? "" : String(brandFilter) });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const from = `${monthKeys[0]}-01`;
  const to = (() => { const [y, m] = monthKeys[monthKeys.length - 1].split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`; })();

  const load = () => {
    setLoading(true);
    fetch(`/api/creator-codes?from=${from}&to=${to}&brand=${brandFilter === "all" ? "all" : brandFilter}`, { cache: "no-store" })
      .then(r => r.json()).then(d => { if (d.needsSetup) setNeedsSetup(true); setRows(d.creators || []); })
      .catch(() => {}).then(() => setLoading(false));
  };
  useEffect(load, [from, to, brandFilter]);

  const brandName = (id: number) => brands.find(b => b.id === id)?.name || `Brand ${id}`;
  const sum = (f: (c: Creator) => number) => rows.reduce((s, c) => s + f(c), 0);
  const kpis = useMemo(() => ({ orders: sum(c => c.totals.orders), net: sum(c => c.totals.net), discount: sum(c => c.totals.discount), commission: sum(c => c.totals.commission), owed: sum(c => c.totals.owed) }), [rows]);

  async function save() {
    setErr(""); setBusy(true);
    const r = await fetch("/api/creator-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then(x => x.json()).catch(() => ({ ok: false, error: "Network error" }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Could not save"); return; }
    setAdding(false); setForm({ ...empty, brand_id: form.brand_id }); load();
  }
  async function markPaid(c: Creator, m: Month) {
    const amount = prompt(`Record a commission payout to ${c.creator_name} for ${monthLabel(m.month_key)}. Amount owed for the month is $${m.commission.toFixed(2)}.`, m.commission.toFixed(2));
    if (amount == null) return;
    const reference = prompt("Payment reference (optional)") || "";
    const r = await fetch("/api/creator-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payout: { creator_id: c.id, month_key: m.month_key, amount: Number(amount) || 0, reference } }) }).then(x => x.json());
    if (!r.ok) alert(r.error || "Could not save payout"); else load();
  }
  async function toggleActive(c: Creator) {
    await fetch("/api/creator-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, active: !c.active }) });
    load();
  }
  async function remove(c: Creator) {
    if (!confirm(`Stop tracking ${c.code}? This removes it from the dashboard only. The code stays in Shopify.`)) return;
    await fetch(`/api/creator-codes?id=${c.id}`, { method: "DELETE" }); load();
  }

  if (needsSetup) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 mb-6">
      Creator codes need their tables. Run <code className="bg-white px-1 rounded">supabase/add_creator_codes.sql</code> in the Supabase SQL editor, then reload. The two MiaMily codes are seeded by that file.
    </div>
  );

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Creator codes</h3>
          <p className="text-xs text-gray-500">Influencer discount codes, read live from each store. Sales are attributed revenue already in Shopify, not extra. Commission is on net sales after discount, shipping and refunds.</p>
        </div>
        {admin && <button onClick={() => setAdding(a => !a)} className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap">{adding ? "Close" : "+ Add code"}</button>}
      </div>

      {adding && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Brand</span>
            <select value={form.brand_id} onChange={e => setForm({ ...form, brand_id: e.target.value })} className="border rounded-lg px-2 py-1.5"><option value="">Choose</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Code (as in Shopify)</span><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="border rounded-lg px-2 py-1.5 font-mono" placeholder="WWOLGA30" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Creator name</span><input value={form.creator_name} onChange={e => setForm({ ...form, creator_name: e.target.value })} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Handle</span><input value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} className="border rounded-lg px-2 py-1.5" placeholder="@handle" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Platform</span><select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} className="border rounded-lg px-2 py-1.5">{["instagram", "tiktok", "youtube", "facebook", "blog", "other"].map(p => <option key={p}>{p}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Followers</span><input type="number" value={form.followers} onChange={e => setForm({ ...form, followers: e.target.value })} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Commission %</span><input type="number" step="0.5" value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: e.target.value })} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-gray-500">Started</span><input type="date" value={form.started_on} onChange={e => setForm({ ...form, started_on: e.target.value })} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-gray-500">Customer offer</span><input value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} className="border rounded-lg px-2 py-1.5" placeholder="$30 off orders over $100" /></label>
          <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-gray-500">Program / agreement</span><input value={form.program} onChange={e => setForm({ ...form, program: e.target.value })} className="border rounded-lg px-2 py-1.5" placeholder="UpPromote (global), direct, gifted" /></label>
          <label className="flex flex-col gap-1 col-span-2 md:col-span-4"><span className="text-xs text-gray-500">Notes</span><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="border rounded-lg px-2 py-1.5" /></label>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            <button disabled={busy} onClick={save} className="text-sm px-3 py-1.5 rounded-lg bg-gray-900 text-white disabled:opacity-50">Save</button>
            {err && <span className="text-xs text-red-600">{err}</span>}
            <span className="text-xs text-gray-400">The code must already exist in Shopify. This only tells the dashboard to track it.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[["Orders", String(kpis.orders)], ["Attributed sales", fmt(kpis.net)], ["Discount given", fmt(kpis.discount)], ["Commission earned", fmt(kpis.commission)], ["Owed now", fmt(kpis.owed)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-[11px] uppercase tracking-wide text-gray-500">{l}</div><div className="text-xl font-semibold text-gray-900 tabular-nums">{v}</div></div>
        ))}
      </div>

      {loading && !rows.length ? <div className="text-sm text-gray-400">Reading orders from Shopify…</div> : !rows.length ? <div className="text-sm text-gray-400">No creator codes registered{brandFilter !== "all" ? " for this brand" : ""} yet.</div> : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50">
              <th className="text-left px-3 py-2">Creator</th><th className="text-left px-3 py-2">Code</th><th className="text-left px-3 py-2">Offer</th>
              <th className="text-right px-3 py-2">Orders</th><th className="text-right px-3 py-2">New customers</th><th className="text-right px-3 py-2">Sales</th><th className="text-right px-3 py-2">Discount</th><th className="text-right px-3 py-2">Commission</th><th className="text-right px-3 py-2">Owed</th><th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <>
                  <tr key={c.id} className={`border-t border-gray-100 ${c.active ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2"><div className="font-medium text-gray-900">{c.creator_name}</div><div className="text-xs text-gray-500">{c.handle || ""}{c.followers ? ` · ${fmt(c.followers).replace("$", "")} followers` : ""}{brandFilter === "all" ? ` · ${brandName(c.brand_id)}` : ""}</div></td>
                    <td className="px-3 py-2 font-mono text-xs">{c.code}{!c.live && <span className="ml-2 text-amber-600" title="No store credentials for this brand">no feed</span>}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{c.offer || ""}<div className="text-gray-400">{c.commission_pct ? `${c.commission_pct}% commission` : "no commission"}{c.program ? ` · ${c.program}` : ""}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.totals.orders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.totals.first_orders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtFull(c.totals.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtFull(c.totals.discount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtFull(c.totals.commission)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${c.totals.owed > 0 ? "text-amber-700" : "text-gray-400"}`}>{fmtFull(c.totals.owed)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => setOpen(open === c.id ? null : c.id)} className="text-xs text-emerald-700 hover:underline">{open === c.id ? "Hide" : "Detail"}</button></td>
                  </tr>
                  {open === c.id && (
                    <tr key={c.id + "-d"} className="bg-gray-50"><td colSpan={10} className="px-4 py-3">
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="font-medium text-gray-700 mb-1">By month</div>
                          {!c.monthly.length ? <div className="text-gray-400">No orders in this period.</div> : (
                            <table className="w-full"><thead><tr className="text-gray-500"><th className="text-left py-1">Month</th><th className="text-right">Orders</th><th className="text-right">Sales</th><th className="text-right">Commission</th><th className="text-right">Paid</th><th></th></tr></thead><tbody>
                              {c.monthly.map(m => { const p = c.payouts.find(x => x.month_key === m.month_key); return (
                                <tr key={m.month_key} className="border-t border-gray-200"><td className="py-1">{monthLabel(m.month_key)}</td><td className="text-right tabular-nums">{m.orders}</td><td className="text-right tabular-nums">{fmtFull(m.net)}</td><td className="text-right tabular-nums">{fmtFull(m.commission)}</td>
                                  <td className="text-right tabular-nums">{p ? <span title={`${p.paid_on}${p.reference ? " · " + p.reference : ""}`}>{fmtFull(Number(p.amount))}</span> : <span className="text-gray-300">–</span>}</td>
                                  <td className="text-right">{admin && c.commission_pct > 0 && !p && m.commission > 0 && <button onClick={() => markPaid(c, m)} className="text-emerald-700 hover:underline">Mark paid</button>}</td></tr>); })}
                            </tbody></table>)}
                          <div className="mt-3 text-gray-500">Share link: <code className="bg-white border px-1 rounded">https://{c.brand_id === 7 ? "miamily.com.au" : "your-store"}/discount/{c.code}</code></div>
                          {c.notes && <div className="mt-2 text-gray-500">{c.notes}</div>}
                          {admin && <div className="mt-3 flex gap-3"><button onClick={() => toggleActive(c)} className="text-gray-600 hover:underline">{c.active ? "Mark inactive" : "Mark active"}</button><button onClick={() => remove(c)} className="text-red-600 hover:underline">Stop tracking</button></div>}
                        </div>
                        <div>
                          <div className="font-medium text-gray-700 mb-1">Orders ({c.orders.length})</div>
                          {!c.orders.length ? <div className="text-gray-400">None yet.</div> : (
                            <div className="max-h-64 overflow-auto"><table className="w-full"><thead><tr className="text-gray-500"><th className="text-left py-1">Order</th><th className="text-left">Date</th><th className="text-left">Customer</th><th className="text-right">Net</th><th className="text-right">Comm.</th><th className="text-left pl-2">Status</th></tr></thead><tbody>
                              {c.orders.map(o => <tr key={o.id} className="border-t border-gray-200"><td className="py-1 font-mono">{o.name}</td><td>{day(o.created_at)}</td><td>{o.customer}{o.first_order && <span className="ml-1 text-emerald-600" title="First order">new</span>}</td><td className="text-right tabular-nums">{fmtFull(o.net)}</td><td className="text-right tabular-nums">{fmtFull(o.commission)}</td><td className={`pl-2 ${o.status === "paid" ? "text-gray-500" : "text-amber-700"}`}>{o.status}</td></tr>)}
                            </tbody></table></div>)}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
