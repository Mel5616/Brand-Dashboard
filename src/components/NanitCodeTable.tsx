"use client";

import { useState } from "react";

// Nanit-facing table: read-only influencer details, editable code + plan only.
type Row = { id: string; month_key: string; name: string; handle: string; email: string; followers: string; platform: string; product_supplied: string; product_value: number | null; subscription_code: string; subscription_plan: string; avatar_url?: string | null };
const monthLabel = (k: string) => k ? new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";

export function NanitCodeTable({ token, rows: initial }: { token: string; rows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(id: string, patch: Partial<Row>) {
    setRows(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
    const d = await fetch("/api/nanit/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, id, ...patch }) }).then(r => r.json()).catch(() => ({ ok: false }));
    if (d.ok) { setSaved(id); setTimeout(() => setSaved(s => s === id ? null : s), 2000); }
  }

  const pending = rows.filter(r => !r.subscription_code).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{rows.length} influencers</p>
        <p className="text-sm">{pending > 0 ? <span className="font-semibold text-amber-600">{pending} awaiting a code</span> : <span className="font-semibold text-emerald-600">All codes issued ✓</span>}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400 bg-slate-50/70">
              <th className="text-left font-semibold px-4 py-2">Month</th>
              <th className="text-left font-semibold px-4 py-2">Influencer</th>
              <th className="text-left font-semibold px-4 py-2">Email</th>
              <th className="text-left font-semibold px-4 py-2">Product supplied</th>
              <th className="text-right font-semibold px-4 py-2">Value</th>
              <th className="text-left font-semibold px-4 py-2 min-w-[140px]">Subscription code</th>
              <th className="text-left font-semibold px-4 py-2 min-w-[130px]">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={r.id} className={r.subscription_code ? "" : "bg-amber-50/50"}>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{monthLabel(r.month_key)}</td>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2.5">
                  {r.avatar_url
                    ? <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    : <span className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 font-bold grid place-items-center shrink-0 text-sm">{(r.name || "?")[0]?.toUpperCase()}</span>}
                  <span><p className="font-semibold text-slate-800 whitespace-nowrap">{r.name}</p><p className="text-[12px] text-gray-400">{r.handle}{r.followers ? ` · ${r.followers}` : ""}{r.platform ? ` · ${r.platform}` : ""}</p></span>
                </div></td>
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.email}</td>
                <td className="px-4 py-2.5 text-slate-600 max-w-[220px]">{r.product_supplied}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-700 tabular-nums whitespace-nowrap">{r.product_value != null ? `$${Math.round(r.product_value).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2.5">
                  <input defaultValue={r.subscription_code} placeholder="e.g. 51B62ADE"
                    onBlur={e => { const v = e.target.value.trim(); if (v !== r.subscription_code) save(r.id, { subscription_code: v }); }}
                    className="w-full text-[13px] font-mono font-semibold text-slate-800 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  {saved === r.id && <span className="text-[10px] font-medium text-emerald-600">✓ Saved</span>}
                </td>
                <td className="px-4 py-2.5">
                  <input defaultValue={r.subscription_plan} placeholder="Milestones" list="nanit-plans"
                    onBlur={e => { const v = e.target.value.trim(); if (v !== r.subscription_plan) save(r.id, { subscription_plan: v }); }}
                    className="w-full text-[13px] text-slate-700 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-300">No influencers logged yet.</td></tr>}
          </tbody>
        </table>
        <datalist id="nanit-plans"><option value="Milestones" /></datalist>
      </div>
    </div>
  );
}
