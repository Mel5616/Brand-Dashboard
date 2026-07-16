"use client";

import { useState } from "react";

// Nanit-facing table: read-only influencer details; editable code + plan with an
// explicit per-row Save button so it's obvious when a code has been submitted.
type Row = { id: string; month_key: string; name: string; handle: string; email: string; followers: string; platform: string; product_supplied: string; product_value: number | null; subscription_code: string; subscription_plan: string; avatar_url?: string | null };
const monthLabel = (k: string) => k ? new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";

export function NanitCodeTable({ token, rows: initial }: { token: string; rows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  // Unsaved edits per row id; a row with a draft shows the Save button.
  const [drafts, setDrafts] = useState<Record<string, { subscription_code: string; subscription_plan: string }>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errId, setErrId] = useState<string | null>(null);

  const draftOf = (r: Row) => drafts[r.id] ?? { subscription_code: r.subscription_code, subscription_plan: r.subscription_plan };
  const isDirty = (r: Row) => {
    const d = drafts[r.id];
    return !!d && (d.subscription_code !== r.subscription_code || d.subscription_plan !== r.subscription_plan);
  };
  function edit(r: Row, patch: Partial<{ subscription_code: string; subscription_plan: string }>) {
    setDrafts(p => ({ ...p, [r.id]: { ...draftOf(r), ...patch } }));
    setSavedIds(p => { const n = new Set(p); n.delete(r.id); return n; });
  }

  async function save(r: Row) {
    const d = draftOf(r);
    setBusyId(r.id); setErrId(null);
    try {
      const res = await fetch("/api/nanit/public", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, id: r.id, subscription_code: d.subscription_code.trim(), subscription_plan: d.subscription_plan.trim() }),
      }).then(x => x.json());
      if (res.ok) {
        setRows(p => p.map(x => x.id === r.id ? { ...x, subscription_code: d.subscription_code.trim(), subscription_plan: d.subscription_plan.trim() } : x));
        setDrafts(p => { const n = { ...p }; delete n[r.id]; return n; });
        setSavedIds(p => new Set(p).add(r.id));
      } else setErrId(r.id);
    } catch { setErrId(r.id); }
    finally { setBusyId(null); }
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
              <th className="text-left font-semibold px-4 py-2 min-w-[90px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => {
              const d = draftOf(r);
              const dirty = isDirty(r);
              return (
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
                    <input value={d.subscription_code} placeholder="e.g. 51B62ADE"
                      onChange={e => edit(r, { subscription_code: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter" && dirty) save(r); }}
                      className="w-full text-[13px] font-mono font-semibold text-slate-800 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input value={d.subscription_plan} placeholder="Milestones" list="nanit-plans"
                      onChange={e => edit(r, { subscription_plan: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter" && dirty) save(r); }}
                      className="w-full text-[13px] text-slate-700 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {dirty ? (
                      <button onClick={() => save(r)} disabled={busyId === r.id}
                        className="text-[13px] font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-3.5 py-1.5 disabled:opacity-60">
                        {busyId === r.id ? "Saving…" : "Save"}
                      </button>
                    ) : savedIds.has(r.id) ? (
                      <span className="text-[13px] font-semibold text-emerald-600">Saved ✓</span>
                    ) : r.subscription_code ? (
                      <span className="text-[12px] text-emerald-600">✓</span>
                    ) : null}
                    {errId === r.id && <p className="text-[11px] text-rose-500 mt-0.5">Couldn&apos;t save — try again</p>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-300">No influencers logged yet.</td></tr>}
          </tbody>
        </table>
        <datalist id="nanit-plans"><option value="Milestones" /></datalist>
      </div>
    </div>
  );
}
