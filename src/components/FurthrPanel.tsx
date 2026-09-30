"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, fmtFull } from "@/lib/format";

// Furthr card-linked cashback campaign (UPPAbaby). Furthr has no API here —
// Mel uploads their transaction export CSV (same manual pattern as Baby
// Bunting), and every row gets checked against commission_factory_transactions
// by order_id so a sale never pays commission twice across both networks —
// confirmed real case, order UB#33749, double-tracked by Furthr and
// Commission Factory's ShopBack Australia affiliate, 29 Sep 2026.

type FurthrTxn = {
  id: string; brand_id: number; transaction_id: string; transaction_date: string;
  amount: number; cashback: number; fee: number; bank: string | null;
  order_id: string | null; customer_id: string | null; status: string | null;
  is_new_customer: boolean | null;
  overlap: { affiliate: string | null; status: string; sale_value: number; commission: number } | null;
};
type Campaign = { id: string; brand_id: number; bank: string; offer: string; status: string; starts_at: string | null; ends_at: string | null };
type Kpi = { revenue: number; spend: number; transactions: number; customers: number; aov: number; overlapCount: number; overlapCost: number; newCustomerCount: number; newCustomerRate: number | null };

const inp = "w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400";
const STATUS_CLS: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700", ended: "bg-gray-100 text-gray-500" };

// Minimal CSV parser: handles quoted fields with embedded commas (Furthr's export
// quotes every field, including amounts like "$1,299.00").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const money = (s: string) => Number((s || "0").replace(/[$,]/g, "")) || 0;

export function FurthrPanel({ brands, admin }: { brands: { id: number; name: string }[]; admin: boolean }) {
  const [brandId, setBrandId] = useState<number>(brands.find(b => b.name === "UPPAbaby")?.id ?? brands[0]?.id ?? 0);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [rows, setRows] = useState<FurthrTxn[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [showOverlapsOnly, setShowOverlapsOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [campForm, setCampForm] = useState({ bank: "", offer: "", status: "pending", starts_at: "", ends_at: "" });

  function load() {
    setLoading(true);
    fetch(`/api/furthr?brand=${brandId}`, { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) { setNeedsSetup(true); setLoading(false); return; }
      if (d.ok) { setKpi(d.kpi); setRows(d.transactions ?? []); setCampaigns(d.campaigns ?? []); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brandId]);

  async function handleFile(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); setProgress("Reading file…");
    try {
      const file = files[0];
      const text = await file.text();
      const grid = parseCsv(text);
      const header = grid[0]?.map(h => h.trim()) ?? [];
      const idx = (name: string) => header.indexOf(name);
      const cols = {
        date: idx("Transaction Date"), amount: idx("Amount"), cashback: idx("Cashback"), fee: idx("Fee"),
        txnId: idx("Transaction ID"), netTxnId: idx("Network Transaction ID"), bank: idx("Bank"),
        orderId: idx("Merchant Order ID"), customerId: idx("Merchant Customer ID"), status: idx("Transaction Status"),
      };
      if (cols.date < 0 || cols.txnId < 0) throw new Error("Doesn't look like a Furthr transactions export — missing expected columns.");
      const parsedRows = grid.slice(1).filter(r => r.length > 1 && r[cols.txnId]).map(r => ({
        brand_id: brandId,
        transaction_id: r[cols.txnId],
        network_transaction_id: cols.netTxnId >= 0 ? r[cols.netTxnId] || null : null,
        transaction_date: new Date(r[cols.date]).toISOString(),
        amount: money(r[cols.amount]), cashback: money(r[cols.cashback]), fee: money(r[cols.fee]),
        bank: cols.bank >= 0 && r[cols.bank] && r[cols.bank] !== "-" ? r[cols.bank] : null,
        order_id: cols.orderId >= 0 ? r[cols.orderId] || null : null,
        customer_id: cols.customerId >= 0 ? r[cols.customerId] || null : null,
        status: cols.status >= 0 ? r[cols.status] || null : null,
      }));
      if (!parsedRows.length) throw new Error("No transaction rows found in that file.");
      for (let i = 0; i < parsedRows.length; i += 500) {
        setProgress(`Uploading ${Math.min(i + 500, parsedRows.length)}/${parsedRows.length} rows…`);
        const res = await fetch("/api/furthr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: parsedRows.slice(i, i + 500) }) }).then(r => r.json());
        if (!res.ok) throw new Error(res.needsSetup ? "Run supabase/add_furthr.sql first." : (res.error || "Upload failed"));
      }
      setProgress(null);
      load();
    } catch (e: any) { setProgress("✗ " + (e.message || "Upload failed")); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveCampaign() {
    if (!campForm.bank.trim() || !campForm.offer.trim()) return;
    const res = await fetch("/api/furthr", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: brandId, bank: campForm.bank, offer: campForm.offer, status: campForm.status, starts_at: campForm.starts_at || null, ends_at: campForm.ends_at || null }),
    }).then(r => r.json());
    if (res.ok) { setCampaigns(p => [res.campaign, ...p]); setAddingCampaign(false); setCampForm({ bank: "", offer: "", status: "pending", starts_at: "", ends_at: "" }); }
  }
  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/furthr?id=${id}`, { method: "DELETE" });
    setCampaigns(p => p.filter(c => c.id !== id));
  }

  if (loading && !kpi) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">Loading Furthr…</div>;

  if (needsSetup) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-xl">
        <h2 className="font-semibold text-gray-800">Furthr card-linked cashback</h2>
        <p className="text-sm text-gray-500 mt-1">Run <code className="bg-gray-100 px-1 rounded">supabase/add_furthr.sql</code> in Supabase, then upload Furthr&apos;s transaction export.</p>
      </div>
    );
  }

  const displayRows = showOverlapsOnly ? rows.filter(r => r.overlap) : rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Furthr — card-linked cashback</h2>
          <p className="text-xs text-gray-400">ING, Suncorp, Westpac, NAB cashback offers, cross-checked against Commission Factory for double-counted orders.</p>
        </div>
        {brands.length > 1 && (
          <select value={brandId} onChange={e => setBrandId(Number(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {admin && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg px-3 py-1.5">
              {busy ? "Uploading…" : "Upload Furthr export"}
            </button>
          </div>
        )}
      </div>
      {progress && <p className={`text-xs ${progress.startsWith("✗") ? "text-rose-500" : "text-gray-400"}`}>{progress}</p>}

      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {[
            { label: "Revenue", value: fmt(kpi.revenue), cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
            { label: "Campaign Spend", value: fmt(kpi.spend), cls: "border-rose-200 bg-rose-50 text-rose-700" },
            { label: "Transactions", value: kpi.transactions.toLocaleString(), cls: "border-sky-200 bg-sky-50 text-sky-700" },
            { label: "Customers", value: kpi.customers.toLocaleString(), cls: "border-purple-200 bg-purple-50 text-purple-700" },
            { label: "Avg Order Value", value: fmt(kpi.aov), cls: "border-amber-200 bg-amber-50 text-amber-700" },
            { label: "New Customers", value: kpi.newCustomerRate != null ? `${kpi.newCustomerRate.toFixed(0)}%` : "—", sub: kpi.newCustomerRate != null ? `${kpi.newCustomerCount} of ${kpi.transactions}` : "resolving…", cls: "border-teal-200 bg-teal-50 text-teal-700" },
            { label: "Double-counted", value: kpi.overlapCount.toLocaleString(), sub: kpi.overlapCount ? `${fmt(kpi.overlapCost)} at risk` : "none found", cls: kpi.overlapCount ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-gray-500" },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border p-3.5 ${c.cls}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
              <p className="text-xl font-bold mt-0.5">{c.value}</p>
              {"sub" in c && c.sub && <p className="text-[11px] mt-0.5 opacity-80">{c.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {kpi && kpi.overlapCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-red-700"><span className="font-semibold">{kpi.overlapCount} order{kpi.overlapCount !== 1 ? "s" : ""}</span> also tracked in Commission Factory — risk of paying commission twice (~{fmt(kpi.overlapCost)} in CF commission on these orders).</p>
          <button onClick={() => setShowOverlapsOnly(p => !p)} className="text-xs font-semibold text-red-700 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100 whitespace-nowrap">
            {showOverlapsOnly ? "Show all transactions" : "Show only overlaps"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">Your Furthr Card-Linked Offer Campaigns</p>
          {admin && <button onClick={() => setAddingCampaign(p => !p)} className="text-xs font-semibold text-emerald-600">{addingCampaign ? "Cancel" : "+ Add campaign"}</button>}
        </div>
        {addingCampaign && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
            <input placeholder="Bank (e.g. ING)" value={campForm.bank} onChange={e => setCampForm(p => ({ ...p, bank: e.target.value }))} className={inp} />
            <input placeholder="Offer text" value={campForm.offer} onChange={e => setCampForm(p => ({ ...p, offer: e.target.value }))} className={`${inp} sm:col-span-2`} />
            <select value={campForm.status} onChange={e => setCampForm(p => ({ ...p, status: e.target.value }))} className={inp}>
              <option value="pending">Pending</option><option value="active">Active</option><option value="ended">Ended</option>
            </select>
            <div className="flex gap-1">
              <input type="date" value={campForm.starts_at} onChange={e => setCampForm(p => ({ ...p, starts_at: e.target.value }))} className={inp} />
              <input type="date" value={campForm.ends_at} onChange={e => setCampForm(p => ({ ...p, ends_at: e.target.value }))} className={inp} />
            </div>
            <button onClick={saveCampaign} className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2 sm:col-span-5 justify-self-start">Save campaign</button>
          </div>
        )}
        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-400">No campaigns logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="pb-2">Bank</th><th className="pb-2">Offer</th><th className="pb-2">Status</th><th className="pb-2">Campaign Dates</th>{admin && <th className="pb-2"></th>}
            </tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="py-2 font-medium text-slate-700">{c.bank}</td>
                  <td className="py-2 text-slate-600">{c.offer}</td>
                  <td className="py-2"><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_CLS[c.status] || "bg-gray-100 text-gray-500"}`}>{c.status}</span></td>
                  <td className="py-2 text-gray-500 text-xs">{c.starts_at ?? "—"} – {c.ends_at ?? "—"}</td>
                  {admin && <td className="py-2 text-right"><button onClick={() => deleteCampaign(c.id)} className="text-gray-300 hover:text-rose-500">✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">Transactions {showOverlapsOnly && <span className="text-red-500 font-normal">(overlaps only)</span>}</p>
          <p className="text-[11px] text-gray-400">Furthr&apos;s export doesn&apos;t say which bank each transaction came from — that&apos;s only in the campaign list above.</p>
        </div>
        {displayRows.length === 0 ? (
          <p className="text-sm text-gray-400">{rows.length === 0 ? "No transactions uploaded yet." : "No overlaps found."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Order</th><th className="pb-2 pr-3">Amount</th><th className="pb-2 pr-3">Cashback</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Customer</th><th className="pb-2">Also in CF?</th>
              </tr></thead>
              <tbody>
                {displayRows.slice(0, 200).map(r => (
                  <tr key={r.id} className={`border-b border-gray-50 ${r.overlap ? "bg-red-50/50" : ""}`}>
                    <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">{new Date(r.transaction_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                    <td className="py-2 pr-3 font-medium text-slate-700">{r.order_id ?? "—"}</td>
                    <td className="py-2 pr-3">{fmtFull(r.amount)}</td>
                    <td className="py-2 pr-3">{fmtFull(r.cashback)}</td>
                    <td className="py-2 pr-3 text-xs text-gray-500">{r.status ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.is_new_customer === true && <span className="text-[11px] font-semibold text-teal-700 bg-teal-100 rounded-full px-2 py-0.5">New</span>}
                      {r.is_new_customer === false && <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">Returning</span>}
                      {r.is_new_customer === null && <span className="text-gray-300 text-xs">…</span>}
                    </td>
                    <td className="py-2">
                      {r.overlap ? (
                        <span className="text-[11px] font-semibold text-red-700 bg-red-100 rounded-full px-2 py-0.5" title={`${r.overlap.affiliate ?? "Unknown affiliate"} — ${r.overlap.status} — ${fmtFull(r.overlap.commission)} commission`}>
                          ⚠ {r.overlap.affiliate ?? "CF"}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayRows.length > 200 && <p className="text-xs text-gray-400 mt-2">Showing the most recent 200 of {displayRows.length}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
