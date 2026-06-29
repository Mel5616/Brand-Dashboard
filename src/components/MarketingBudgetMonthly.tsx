"use client";

import { useEffect, useMemo, useState } from "react";

// Monthly marketing budget vs actual, per brand × channel, from the planning sheet.
type Row = { brand_id: number; month_key: string; channel: string; kind: string; value: number };
type Brand = { id: number; name: string };

const aud = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const meterColor = (used: number) => used >= 100 ? "#ef4444" : used >= 80 ? "#f59e0b" : "#6366f1";

export function MarketingBudgetMonthly({ brands, monthKeys, monthLabels, latest, fyLabel, canEdit }: {
  brands: Brand[]; monthKeys: string[]; monthLabels: string[]; latest: string; fyLabel: string; canEdit: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const liveBrands = brands.filter((b: any) => b.live !== false);
  const [brandId, setBrandId] = useState<number | "all">(liveBrands[0]?.id ?? "all");
  const [month, setMonth] = useState(latest);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const j = await fetch("/api/marketing-budget/monthly", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false }));
    if (j.needsSetup) { setState("needsSetup"); return; }
    if (!j.ok) { setState("error"); return; }
    setRows(j.rows || []); setState("ready");
  }
  useEffect(() => { load(); }, []);

  async function refresh() {
    setBusy(true); setMsg("");
    const j = await fetch("/api/marketing-budget/sync", { method: "POST" }).then(r => r.json()).catch(() => ({ ok: false }));
    setBusy(false);
    setMsg(j.ok ? `✓ Synced ${j.count} rows${j.unmatched?.length ? ` (unmatched brands: ${j.unmatched.join(", ")})` : ""}.` : (j.error || "Sync failed."));
    if (j.ok) load();
  }

  // Channels + budget/actual for the chosen brand + month.
  const monthName = monthLabels[monthKeys.indexOf(month)] ?? month;
  const inScope = (r: Row) => (brandId === "all" || r.brand_id === brandId);
  const table = useMemo(() => {
    const m = new Map<string, { budget: number; actual: number }>();
    for (const r of rows) {
      if (!inScope(r) || r.month_key !== month) continue;
      const c = m.get(r.channel) ?? { budget: 0, actual: 0 };
      if (r.kind === "budget") c.budget += Number(r.value) || 0; else if (r.kind === "actual") c.actual += Number(r.value) || 0;
      m.set(r.channel, c);
    }
    return [...m.entries()].map(([channel, v]) => ({ channel, ...v })).filter(c => c.budget || c.actual).sort((a, b) => b.budget - a.budget);
  }, [rows, brandId, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const totBudget = table.reduce((s, r) => s + r.budget, 0);
  const totActual = table.reduce((s, r) => s + r.actual, 0);

  // FY totals for the scope.
  const fyKeys = new Set(monthKeys);
  const fy = useMemo(() => {
    let budget = 0, actual = 0;
    for (const r of rows) { if (!inScope(r) || !fyKeys.has(r.month_key)) continue; if (r.kind === "budget") budget += Number(r.value) || 0; else if (r.kind === "actual") actual += Number(r.value) || 0; }
    return { budget, actual };
  }, [rows, brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
      Run <code>add_marketing_monthly.sql</code> in Supabase{canEdit ? ", then hit “Refresh from sheet”." : "."}
      {canEdit && <div className="mt-2"><button onClick={refresh} disabled={busy} className="text-xs font-semibold text-white bg-emerald-500 rounded-lg px-3 py-1.5">{busy ? "Syncing…" : "Refresh from sheet"}</button></div>}
    </div>
  );
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load budget.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={brandId === "all" ? "all" : String(brandId)} onChange={e => setBrandId(e.target.value === "all" ? "all" : Number(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="all">All brands</option>{liveBrands.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          {monthKeys.map((k, i) => <option key={k} value={k}>{monthLabels[i]}</option>)}
        </select>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            {msg && <span className={`text-[11px] ${msg.startsWith("✓") ? "text-emerald-600" : "text-rose-500"}`}>{msg}</span>}
            <button onClick={refresh} disabled={busy} className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg px-3 py-1.5">{busy ? "Syncing…" : "↻ Refresh from sheet"}</button>
          </div>
        )}
      </div>

      {/* FY summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: `${fyLabel} budget`, value: aud(fy.budget) },
          { label: `${fyLabel} actual`, value: aud(fy.actual) },
          { label: "FY remaining", value: aud(Math.max(0, fy.budget - fy.actual)) },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Month by channel — matches the planning sheet */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50"><h3 className="text-sm font-semibold text-slate-700">{monthName} · by channel{brandId === "all" ? " · all brands" : ""}</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
            <tr><th className="text-left font-semibold px-5 py-2.5">Channel</th><th className="text-right font-semibold px-5 py-2.5">Budget</th><th className="text-right font-semibold px-5 py-2.5">Actual</th><th className="text-right font-semibold px-5 py-2.5">Used</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {table.map(r => {
              const used = r.budget > 0 ? Math.round((r.actual / r.budget) * 100) : (r.actual > 0 ? 100 : 0);
              return (
                <tr key={r.channel}>
                  <td className="px-5 py-2.5 text-slate-700">{r.channel}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{aud(r.budget)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500">{aud(r.actual)}</td>
                  <td className="px-5 py-2.5 text-right font-semibold" style={{ color: r.budget ? meterColor(used) : "#cbd5e1" }}>{r.budget ? `${used}%` : "—"}</td>
                </tr>
              );
            })}
            {table.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-300">No budget for {monthName} yet.</td></tr>}
          </tbody>
          {table.length > 0 && (
            <tfoot><tr className="border-t-2 border-gray-100 bg-slate-50/50 font-bold text-slate-800">
              <td className="px-5 py-2.5">Total</td><td className="px-5 py-2.5 text-right">{aud(totBudget)}</td><td className="px-5 py-2.5 text-right">{aud(totActual)}</td>
              <td className="px-5 py-2.5 text-right" style={{ color: totBudget ? meterColor(Math.round((totActual / totBudget) * 100)) : "#cbd5e1" }}>{totBudget ? `${Math.round((totActual / totBudget) * 100)}%` : "—"}</td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
