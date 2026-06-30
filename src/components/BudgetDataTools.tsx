"use client";

import { useEffect, useState } from "react";
import { fmtFull } from "@/lib/format";

type Brand = { id: number; name: string };
type Topup = { brand_id: number; month_key: string; channel: string; amount: number };
type Actual = { brand_id: number; month_key: string; channel: string; spend: number; note?: string; invoice_url?: string | null };

// Canonical marketing channels for the year (templates always offer all of these).
const CHANNELS = ["Google Advertising", "Social Media (Meta)", "TikTok Ads", "Pinterest Ads", "Partnerships & Affiliates", "Influencer Marketing", "Klaviyo", "Shopify", "Photography", "Printing", "Events", "Giveaways"];

// Human label for a month key, e.g. "2025-07" -> "Jul 25".
const labelOf = (mk: string) => {
  const [y, m] = mk.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return `${d.toLocaleDateString("en-AU", { month: "short" })} ${y.slice(2)}`;
};

export function BudgetDataTools({ brands, marketingBudgets, monthKeys, fy, fyLabel, topups }: {
  brands: Brand[];
  marketingBudgets: any[];
  monthKeys: string[];
  fy: string;
  fyLabel: string;
  topups: Topup[];
}) {
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [form, setForm] = useState({ brand_id: "", channel: CHANNELS[0], month_key: monthKeys[0], spend: "", note: "" });

  async function addExpense() {
    if (!form.brand_id || !form.channel || !form.month_key) { setMsg("Pick a brand, channel and month."); return; }
    setAdding(true); setMsg("");
    try {
      let invoice_url: string | undefined;
      if (invoiceFile) {
        const fd = new FormData(); fd.append("file", invoiceFile);
        const j = await fetch("/api/marketing-actuals/invoice", { method: "POST", body: fd }).then(r => r.json());
        if (j.error) { setMsg(j.error); setAdding(false); return; }
        invoice_url = j.url;
      }
      const row: Actual = { brand_id: Number(form.brand_id), month_key: form.month_key, channel: form.channel, spend: Number(form.spend) || 0, note: form.note, invoice_url };
      const res = await fetch("/api/marketing-actuals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [row] }) }).then(r => r.json());
      if (!res.ok) { setMsg(res.error || "Couldn't save the expense."); setAdding(false); return; }
      setActuals(prev => [row, ...prev.filter(a => !(a.brand_id === row.brand_id && a.month_key === row.month_key && a.channel === row.channel))]);
      setForm(f => ({ ...f, spend: "", note: "" })); setInvoiceFile(null);
      setMsg("✓ Expense added.");
    } catch { setMsg("Couldn't save the expense."); }
    setAdding(false);
  }

  useEffect(() => { fetch("/api/marketing-actuals").then(r => r.json()).then(j => setActuals(j.rows ?? [])).catch(() => {}); }, []);

  const brandById = new Map(brands.map(b => [b.id, b.name]));
  const idByName = (name: string) => {
    const n = String(name || "").trim().toLowerCase();
    const hit = brands.find(b => b.name.toLowerCase() === n) || brands.find(b => b.name.toLowerCase().startsWith(n) || n.startsWith(b.name.toLowerCase()));
    return hit?.id ?? null;
  };
  // Map a header / cell to a month_key in this FY (accepts "2025-07", "Jul 25", "Jul 2025").
  const headerToKey = new Map<string, string>();
  monthKeys.forEach(mk => { headerToKey.set(mk.toLowerCase(), mk); headerToKey.set(labelOf(mk).toLowerCase(), mk); headerToKey.set(labelOf(mk).replace(/(\d2)$/, "20$1").toLowerCase(), mk); });
  const toMonthKey = (raw: string) => {
    const s = String(raw || "").trim();
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
    return headerToKey.get(s.toLowerCase()) ?? null;
  };

  const topupVal = (bid: number, ch: string, mk: string) => { const t = topups.find(t => t.brand_id === bid && t.channel === ch && t.month_key === mk); return t ? Number(t.amount) || 0 : null; };
  const monthBudget = (bid: number, ch: string, mk: string, annual: number) => { const o = topupVal(bid, ch, mk); return o != null ? o : annual / 12; };

  async function downloadBudgetTemplate() {
    const XLSX = await import("xlsx");
    // One row per brand × every canonical channel (0 where there's no budget yet).
    const budgetBrandIds = [...new Set(marketingBudgets.map(b => b.brand_id))];
    const rows: Record<string, any>[] = [];
    for (const bid of budgetBrandIds) {
      for (const channel of CHANNELS) {
        const annual = Number(marketingBudgets.find(b => b.brand_id === bid && b.channel === channel)?.annual_budget) || 0;
        const row: Record<string, any> = { Brand: brandById.get(bid) ?? `#${bid}`, Channel: channel };
        monthKeys.forEach(mk => { row[labelOf(mk)] = Math.round(monthBudget(bid, channel, mk, annual)); });
        rows.push(row);
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["Brand", "Channel", ...monthKeys.map(labelOf)] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly budgets");
    XLSX.writeFile(wb, `marketing_budget_monthly_${fy}.xlsx`);
  }

  async function uploadBudget(file: File) {
    setBusy("budget"); setMsg("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const out: Topup[] = []; const unmatched = new Set<string>();
      for (const r of grid) {
        const keys = Object.keys(r);
        const brandKey = keys.find(k => k.trim().toLowerCase() === "brand");
        const chanKey = keys.find(k => k.trim().toLowerCase() === "channel");
        if (!brandKey || !chanKey) continue;
        const bid = idByName(r[brandKey]); const channel = String(r[chanKey] || "").trim();
        if (bid == null) { if (r[brandKey]) unmatched.add(String(r[brandKey])); continue; }
        if (!channel) continue;
        for (const k of keys) {
          if (k === brandKey || k === chanKey) continue;
          const mk = toMonthKey(k); if (!mk) continue;
          const amount = Number(String(r[k]).replace(/[^0-9.-]/g, "")); if (!Number.isFinite(amount)) continue;
          out.push({ brand_id: bid, month_key: mk, channel, amount });
        }
      }
      if (!out.length) { setMsg("No budget cells found — keep the Brand, Channel and month columns from the template."); setBusy(""); return; }
      const res = await fetch("/api/budget-topups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: out }) }).then(r => r.json()).catch(() => ({ ok: false }));
      setMsg(res.ok ? `✓ Loaded ${res.count} monthly budget values${unmatched.size ? ` (unmatched brands: ${[...unmatched].join(", ")})` : ""}. Reloading…` : (res.error || "Upload failed."));
      if (res.ok) setTimeout(() => window.location.reload(), 1500);
    } catch { setMsg("Couldn't read that file."); }
    setBusy("");
  }

  async function downloadExpensesTemplate() {
    const XLSX = await import("xlsx");
    const fyActuals = actuals.filter(a => monthKeys.includes(a.month_key));
    const rows = fyActuals.length
      ? fyActuals.map(a => ({ Month: a.month_key, Brand: brandById.get(a.brand_id) ?? `#${a.brand_id}`, Channel: a.channel, Spend: Number(a.spend) || 0, Note: a.note ?? "" }))
      : [{ Month: monthKeys[0], Brand: brands[0]?.name ?? "", Channel: "Photography", Spend: 0, Note: "e.g. invoice ref" }];
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["Month", "Brand", "Channel", "Spend", "Note"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `marketing_expenses_${fy}.xlsx`);
  }

  async function uploadExpenses(file: File) {
    setBusy("exp"); setMsg("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const get = (r: any, name: string) => { const k = Object.keys(r).find(k => k.trim().toLowerCase() === name); return k ? r[k] : ""; };
      const out: Actual[] = []; const unmatched = new Set<string>();
      for (const r of grid) {
        const bid = idByName(get(r, "brand")); const mk = toMonthKey(get(r, "month")); const channel = String(get(r, "channel") || "").trim();
        if (bid == null) { if (get(r, "brand")) unmatched.add(String(get(r, "brand"))); continue; }
        if (!mk || !channel) continue;
        const spend = Number(String(get(r, "spend")).replace(/[^0-9.-]/g, "")) || 0;
        out.push({ brand_id: bid, month_key: mk, channel, spend, note: String(get(r, "note") || "") });
      }
      if (!out.length) { setMsg("No expense rows found — use the Month, Brand, Channel, Spend, Note columns."); setBusy(""); return; }
      const res = await fetch("/api/marketing-actuals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: out }) }).then(r => r.json()).catch(() => ({ ok: false }));
      setMsg(res.ok ? `✓ Loaded ${res.count} expense lines${unmatched.size ? ` (unmatched brands: ${[...unmatched].join(", ")})` : ""}. Reloading…` : (res.error || "Upload failed."));
      if (res.ok) setTimeout(() => window.location.reload(), 1500);
    } catch { setMsg("Couldn't read that file."); }
    setBusy("");
  }

  async function deleteExpense(a: Actual) {
    if (!confirm(`Delete ${brandById.get(a.brand_id)} · ${a.channel} · ${labelOf(a.month_key)}?`)) return;
    const q = `brand_id=${a.brand_id}&month_key=${encodeURIComponent(a.month_key)}&channel=${encodeURIComponent(a.channel)}`;
    const res = await fetch(`/api/marketing-actuals?${q}`, { method: "DELETE" }).then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) setActuals(prev => prev.filter(x => !(x.brand_id === a.brand_id && x.month_key === a.month_key && x.channel === a.channel)));
  }

  const fyExpenses = actuals.filter(a => monthKeys.includes(a.month_key)).sort((a, b) => b.month_key.localeCompare(a.month_key));
  const btn = "text-xs font-medium text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5";
  const up = (k: string) => `text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5 cursor-pointer ${busy === k ? "opacity-50" : ""}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">Budgets &amp; expenses · {fyLabel}</p>
          <p className="text-[11px] text-gray-400">Budgets are tracked monthly. Google &amp; Meta spend is live from the ad platforms; add every other expense below.</p>
        </div>
        {msg && <span className={`text-[11px] ${msg.startsWith("✓") ? "text-emerald-600" : "text-rose-500"}`}>{msg}</span>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Monthly budgets */}
        <div className="rounded-xl border border-gray-100 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Monthly budgets</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadBudgetTemplate} className={btn}>Download template (Excel)</button>
            <label className={up("budget")}>{busy === "budget" ? "Uploading…" : "Upload budgets"}<input type="file" accept=".xlsx,.xls" disabled={busy === "budget"} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadBudget(f); e.currentTarget.value = ""; }} /></label>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">Template has every brand × channel with a column per month. Edit the figures and upload to set the monthly budget.</p>
        </div>

        {/* Expenses */}
        <div className="rounded-xl border border-gray-100 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Expenses (actuals)</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadExpensesTemplate} className={btn}>Download template (Excel)</button>
            <label className={up("exp")}>{busy === "exp" ? "Uploading…" : "Upload expenses"}<input type="file" accept=".xlsx,.xls" disabled={busy === "exp"} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadExpenses(f); e.currentTarget.value = ""; }} /></label>
            <button onClick={() => setShowAdd(s => !s)} className={btn}>{showAdd ? "Close" : "Add one + invoice"}</button>
            <button onClick={() => setShowExpenses(s => !s)} className={btn}>{showExpenses ? "Hide list" : `View list (${fyExpenses.length})`}</button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">Bulk via Excel, or add a single expense and attach its invoice (PDF). Re-using the same month/brand/channel overwrites it.</p>
        </div>
      </div>

      {/* Add a single expense, with optional invoice */}
      {showAdd && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="grid sm:grid-cols-6 gap-2 items-end">
            <label className="text-[11px] text-gray-500 sm:col-span-1">Brand
              <select value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))} className="w-full mt-0.5 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">—</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-gray-500 sm:col-span-1">Channel
              <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} className="w-full mt-0.5 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-gray-500 sm:col-span-1">Month
              <select value={form.month_key} onChange={e => setForm(f => ({ ...f, month_key: e.target.value }))} className="w-full mt-0.5 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                {monthKeys.map(mk => <option key={mk} value={mk}>{labelOf(mk)}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-gray-500 sm:col-span-1">Spend $
              <input type="number" inputMode="decimal" value={form.spend} onChange={e => setForm(f => ({ ...f, spend: e.target.value }))} className="w-full mt-0.5 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
            </label>
            <label className="text-[11px] text-gray-500 sm:col-span-2">Note
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="supplier / ref" className="w-full mt-0.5 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
            </label>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <label className={btn + " cursor-pointer"}>{invoiceFile ? `📎 ${invoiceFile.name.slice(0, 28)}` : "Attach invoice (PDF)"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)} /></label>
            {invoiceFile && <button onClick={() => setInvoiceFile(null)} className="text-[11px] text-gray-400 hover:text-rose-500">remove</button>}
            <button onClick={addExpense} disabled={adding} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-1.5 disabled:opacity-50 ml-auto">{adding ? "Saving…" : "Save expense"}</button>
          </div>
        </div>
      )}

      {showExpenses && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          {fyExpenses.length === 0 ? (
            <p className="text-xs text-gray-400 p-4 text-center">No expenses loaded yet for {fyLabel}.</p>
          ) : (
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide sticky top-0">
                  <tr><th className="text-left font-semibold px-3 py-2">Month</th><th className="text-left font-semibold px-3 py-2">Brand</th><th className="text-left font-semibold px-3 py-2">Channel</th><th className="text-right font-semibold px-3 py-2">Spend</th><th className="text-left font-semibold px-3 py-2">Note</th><th className="text-left font-semibold px-3 py-2">Invoice</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fyExpenses.map((a, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 text-slate-500">{labelOf(a.month_key)}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{brandById.get(a.brand_id) ?? `#${a.brand_id}`}</td>
                      <td className="px-3 py-1.5 text-slate-600">{a.channel}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{fmtFull(Number(a.spend) || 0)}</td>
                      <td className="px-3 py-1.5 text-gray-400 truncate max-w-[200px]">{a.note}</td>
                      <td className="px-3 py-1.5">{a.invoice_url ? <a href={a.invoice_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">📎 view</a> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-1.5 text-right"><button onClick={() => deleteExpense(a)} className="text-rose-400 hover:text-rose-600 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
