"use client";
import React from "react";

// $5 any-brand codes issued for every published review (any brand's Klaviyo
// Reviews). Issued hourly by scripts/review_rewards.py via
// /api/review-rewards/issue, swept for redemption across all brand stores here.
type Row = { id: string; source_brand_name: string; customer_email: string; customer_name: string | null; rating: number | null; code: string; value: number; expires_at: string; email_sent: boolean; status: string; error: string | null; redeemed_brand_name: string | null; redeemed_at: string | null; redeemed_order_name: string | null; redeemed_order_total: number | null; issued_at: string };
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" });

export function ReviewRewardsCard() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [cfg, setCfg] = React.useState<{ value: number; days: number } | null>(null);
  const [filter, setFilter] = React.useState<"all" | "issued" | "redeemed" | "expired" | "failed">("all");
  const load = React.useCallback((sweep = false) => { fetch(`/api/review-rewards${sweep ? "?sweep=1" : ""}`).then(r => r.json()).then(d => { if (!d.ok) return; setRows(d.rows ?? []); setCfg(d.config ?? null); setNeedsSetup(!!d.needsSetup); }).catch(() => {}); }, []);
  React.useEffect(() => { load(); }, [load]);
  const shown = (rows ?? []).filter(r => filter === "all" || r.status === filter);
  const redeemed = (rows ?? []).filter(r => r.status === "redeemed");
  const byBrand = redeemed.reduce<Record<string, number>>((m, r) => { const k = r.redeemed_brand_name || "?"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const crossed = redeemed.filter(r => r.redeemed_brand_name && r.redeemed_brand_name !== r.source_brand_name).length;
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Review rewards · ${cfg?.value ?? 5} off any brand</h2>
          <p className="text-[12.5px] text-gray-400 mt-1">One single-use code per published review, valid on every Coolkidz brand store for {cfg?.days ?? 90} days. Issued hourly; redemption checked when this loads.</p>
        </div>
        <button onClick={() => load(true)} className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">Check redemptions now</button>
      </div>
      {needsSetup ? <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Run <code className="font-mono text-xs">supabase/add_review_rewards.sql</code> in Supabase to start issuing.</p> : rows === null ? <p className="text-sm text-gray-400">Loading…</p> : (
        <>
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            {[["Issued", rows.length], ["Redeemed", redeemed.length], ["Redeemed at a different brand", crossed], ["Revenue on redemptions", money(redeemed.reduce((s, r) => s + (r.redeemed_order_total || 0), 0))]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className="text-lg font-semibold text-slate-800 tabular-nums">{v}</p></div>
            ))}
          </div>
          {Object.keys(byBrand).length > 0 && <p className="text-xs text-slate-500 mb-3">Redeemed at: {Object.entries(byBrand).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          <div className="flex gap-1.5 mb-3">{(["all", "issued", "redeemed", "expired", "failed"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`text-xs rounded-full px-2.5 py-1 border ${filter === f ? "bg-slate-800 text-white border-slate-800" : "text-slate-500 border-slate-200"}`}>{f}</button>)}</div>
          {shown.length === 0 ? <p className="text-[12.5px] text-gray-400">No rewards {filter === "all" ? "issued yet" : filter}.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-[13px]">
              <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400"><th className="text-left font-semibold py-1.5 pr-3">Issued</th><th className="text-left font-semibold py-1.5 pr-3">Reviewer</th><th className="text-left font-semibold py-1.5 pr-3">Reviewed</th><th className="text-left font-semibold py-1.5 pr-3">Code</th><th className="text-left font-semibold py-1.5 pr-3">Status</th><th className="text-left font-semibold py-1.5">Redeemed</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{shown.slice(0, 200).map(r => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{day(r.issued_at)}</td>
                  <td className="py-1.5 pr-3 text-slate-700">{r.customer_name || r.customer_email}<span className="text-slate-400"> · {r.rating ? "★".repeat(r.rating) : ""}</span></td>
                  <td className="py-1.5 pr-3 text-slate-500">{r.source_brand_name}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs text-slate-600">{r.code}{!r.email_sent && <span className="ml-1 text-amber-600" title={r.error || ""}>email not sent</span>}</td>
                  <td className="py-1.5 pr-3"><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${r.status === "redeemed" ? "bg-emerald-50 text-emerald-700" : r.status === "issued" ? "bg-blue-50 text-blue-700" : r.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span></td>
                  <td className="py-1.5 text-slate-500">{r.status === "redeemed" ? `${r.redeemed_brand_name} · ${r.redeemed_order_name} · ${money(r.redeemed_order_total || 0)}` : r.status === "failed" ? <span className="text-red-600 text-xs">{r.error}</span> : `expires ${day(r.expires_at)}`}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </>
      )}
    </section>
  );
}
