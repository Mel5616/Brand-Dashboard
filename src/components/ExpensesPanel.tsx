"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtFull } from "@/lib/format";

// Marketing expenses ledger: upload a PDF receipt/invoice with details and
// track spend by category (tradeshows, printing, …). Standalone from the
// monthly budget actuals.
type Expense = {
  id: string; expense_date: string; category: string; vendor: string;
  amount: number; brand_id: number | null; file_url: string | null; file_name: string | null; note: string;
};
type Brand = { id: number; name: string };

const CATEGORIES = ["Tradeshows", "Printing", "Events", "Photography", "Samples & gifting", "Freight & postage", "Agency fees", "Software & tools", "Sponsorship", "Other"];
const CAT_COLOR: Record<string, string> = {
  Tradeshows: "#2563eb", Printing: "#db2777", Events: "#7c3aed", Photography: "#0891b2",
  "Samples & gifting": "#f59e0b", "Freight & postage": "#65a30d", "Agency fees": "#e11d48",
  "Software & tools": "#0d9488", Sponsorship: "#c026d3", Other: "#64748b",
};
const catColor = (c: string) => CAT_COLOR[c] ?? "#64748b";
const today = () => new Date().toISOString().slice(0, 10);
const dMY = (s: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

export function ExpensesPanel({ brands, admin }: { brands: Brand[]; admin: boolean }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<string>("All");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({ expense_date: today(), category: "Tradeshows", vendor: "", amount: "", brand_id: "", note: "" });
  const set = (patch: Partial<typeof f>) => setF(p => ({ ...p, ...patch }));

  useEffect(() => {
    fetch("/api/expenses").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true); else if (d.ok) setRows(d.rows ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const brandName = (id: number | null) => id == null ? "" : (brands.find(b => b.id === id)?.name ?? "");

  const filtered = useMemo(() => filter === "All" ? rows : rows.filter(r => r.category === filter), [rows, filter]);
  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + (Number(r.amount) || 0));
    return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  async function add() {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.set("expense_date", f.expense_date); fd.set("category", f.category); fd.set("vendor", f.vendor);
      fd.set("amount", f.amount || "0"); fd.set("brand_id", f.brand_id); fd.set("note", f.note);
      const file = fileRef.current?.files?.[0]; if (file) fd.set("file", file);
      const d = await fetch("/api/expenses", { method: "POST", body: fd }).then(r => r.json());
      if (d.ok) {
        setRows(p => [d.item, ...p]);
        setF({ expense_date: today(), category: f.category, vendor: "", amount: "", brand_id: "", note: "" });
        if (fileRef.current) fileRef.current.value = "";
      } else { setErr(d.error || "Could not save."); if (d.needsSetup) setNeedsSetup(true); }
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this expense?")) return;
    const d = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) setRows(p => p.filter(r => r.id !== id));
  }

  const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
      Run <code className="bg-gray-100 px-1 rounded">add_marketing_expenses.sql</code> in Supabase to enable the expenses ledger.
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Marketing expenses</h1>
        <p className="text-sm text-gray-400">Upload PDF receipts and invoices, tracked by category.</p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider text-gray-400">Total logged</p>
          <p className="text-2xl font-bold text-slate-800">{fmtFull(total)}</p>
          <p className="text-[11px] text-gray-400">{rows.length} expense{rows.length === 1 ? "" : "s"}</p>
        </div>
        {byCategory.slice(0, 3).map(c => (
          <div key={c.category} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: catColor(c.category) }} />{c.category}</p>
            <p className="text-2xl font-bold text-slate-800">{fmtFull(c.amount)}</p>
          </div>
        ))}
      </div>

      {/* Add form (admin) */}
      {admin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Add an expense</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Date</span>
              <input type="date" value={f.expense_date} onChange={e => set({ expense_date: e.target.value })} className={inp} /></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Category</span>
              <input list="expense-cats" value={f.category} onChange={e => set({ category: e.target.value })} placeholder="Tradeshows…" className={inp} />
              <datalist id="expense-cats">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Vendor / description</span>
              <input value={f.vendor} onChange={e => set({ vendor: e.target.value })} placeholder="e.g. Reed Exhibitions" className={inp} /></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Amount (ex GST)</span>
              <input type="number" inputMode="decimal" value={f.amount} onChange={e => set({ amount: e.target.value })} placeholder="0" className={inp} /></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Brand <span className="normal-case text-gray-300">· optional</span></span>
              <select value={f.brand_id} onChange={e => set({ brand_id: e.target.value })} className={inp}>
                <option value="">Whole business</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Note <span className="normal-case text-gray-300">· optional</span></span>
              <input value={f.note} onChange={e => set({ note: e.target.value })} placeholder="anything useful" className={inp} /></label>
            <label className="block sm:col-span-2"><span className="text-[10px] uppercase tracking-wider text-gray-400">Receipt / invoice PDF <span className="normal-case text-gray-300">· optional</span></span>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 mt-1" /></label>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={add} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Saving…" : "Add expense"}</button>
            {err && <span className="text-sm text-rose-500">{err}</span>}
          </div>
        </div>
      )}

      {/* Filter + table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {["All", ...byCategory.map(c => c.category)].map(c => (
            <button key={c} onClick={() => setFilter(c)} className={`text-xs font-medium rounded-full px-3 py-1 ${filter === c ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{c}</button>
          ))}
        </div>
        {loading ? <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
          : filtered.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No expenses yet.</p>
          : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                <th className="text-left pb-2 pr-3 font-semibold">Date</th>
                <th className="text-left pb-2 pr-3 font-semibold">Category</th>
                <th className="text-left pb-2 pr-3 font-semibold">Vendor</th>
                <th className="text-left pb-2 pr-3 font-semibold">Brand</th>
                <th className="text-right pb-2 pr-3 font-semibold">Amount</th>
                <th className="text-left pb-2 pr-3 font-semibold">Receipt</th>
                {admin && <th className="pb-2 w-8"></th>}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.id} className="text-slate-700">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{dMY(r.expense_date)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2 py-0.5" style={{ background: `${catColor(r.category)}18`, color: catColor(r.category) }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: catColor(r.category) }} />{r.category}</span></td>
                    <td className="py-2 pr-3">{r.vendor || <span className="text-gray-300">—</span>}{r.note && <span className="block text-[11px] text-gray-400">{r.note}</span>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{brandName(r.brand_id) || "Whole business"}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums whitespace-nowrap">{fmtFull(Number(r.amount) || 0)}</td>
                    <td className="py-2 pr-3">{r.file_url ? <a href={r.file_url} target="_blank" rel="noreferrer" className="text-emerald-600 font-medium hover:underline whitespace-nowrap">View ↗</a> : <span className="text-gray-300">—</span>}</td>
                    {admin && <td className="py-2 text-right"><button onClick={() => remove(r.id)} className="text-gray-300 hover:text-rose-500" title="Delete">✕</button></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-gray-100 font-semibold text-slate-800">
                <td className="pt-2 pr-3" colSpan={4}>{filter === "All" ? "Total" : `${filter} total`}</td>
                <td className="pt-2 pr-3 text-right tabular-nums">{fmtFull(filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</td>
                <td colSpan={admin ? 2 : 1}></td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
