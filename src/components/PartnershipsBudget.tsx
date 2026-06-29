"use client";

import { useEffect, useMemo, useState } from "react";
import { INFLUENCER_FY_MONTHS, INFLUENCER_FY_KEYS, INFLUENCER_FY_LABEL } from "@/lib/influencerFy";

// Partnerships & Affiliates budget (admin). Spend (free product cost × qty + cash)
// vs a per-brand FY budget. Cost terms, ex-GST.

type Entry = { brand: string | null; month_key: string; total_cost: number | null };
type Budget = { brand: string; month_key: string; budget: number };

const aud = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const FY_KEY = INFLUENCER_FY_MONTHS[0].key; // store a per-brand FY budget on the first month
const meterColor = (used: number) => used >= 100 ? "#ef4444" : used >= 80 ? "#f59e0b" : "#6366f1";

export function PartnershipsBudget() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [edit, setEdit] = useState<Record<string, string>>({});

  async function load() {
    const [e, b] = await Promise.all([
      fetch("/api/partnerships/entries", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/partnerships/budgets", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
    ]);
    if (e.needsSetup || b.needsSetup) { setState("needsSetup"); return; }
    if (!e.ok || !b.ok) { setState("error"); return; }
    setEntries(e.entries || []); setBudgets(b.budgets || []); setState("ready");
  }
  useEffect(() => { load(); }, []);

  const fy = new Set(INFLUENCER_FY_KEYS);
  const rows = useMemo(() => {
    const agg: Record<string, { spend: number; budget: number }> = {};
    const bucket = (br: string) => (agg[br] ??= { spend: 0, budget: 0 });
    for (const e of entries) if (fy.has(e.month_key)) bucket(e.brand || "—").spend += Number(e.total_cost) || 0;
    for (const bd of budgets) if (fy.has(bd.month_key)) bucket(bd.brand).budget += Number(bd.budget) || 0;
    return Object.entries(agg).map(([brand, a]) => ({ brand, ...a, used: a.budget > 0 ? Math.round((a.spend / a.budget) * 100) : (a.spend > 0 ? 100 : 0) }))
      .sort((x, y) => y.spend - x.spend);
  }, [entries, budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const pct = totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0;

  async function saveBudget(brand: string) {
    const v = Number(edit[brand]); if (!Number.isFinite(v)) return;
    await fetch("/api/partnerships/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, month_key: FY_KEY, budget: v }) }).catch(() => {});
    setEdit(p => { const n = { ...p }; delete n[brand]; return n; }); load();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_partnerships.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load budget.</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{INFLUENCER_FY_LABEL} · cost terms · ex-GST · free product valued at cost × qty</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Spend to date", value: aud(totalSpend), sub: `${entries.length} partnerships` },
          { label: "FY Budget", value: aud(totalBudget), sub: "all brands" },
          { label: "% of Budget Used", value: `${pct}%`, sub: pct > 100 ? "over budget" : "on track" },
          { label: "Remaining", value: aud(Math.max(0, totalBudget - totalSpend)), sub: "budget left" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{k.value}</p>
            <p className="text-[11px] text-gray-400">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Spend vs budget by brand</h3>
        {rows.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No partnerships or budgets yet.</p> : (
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.brand} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-700 truncate">{r.brand}</span>
                <div className="flex-1">
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.used)}%`, background: meterColor(r.used) }} /></div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{aud(r.spend)} spent{r.budget > 0 ? ` of ${aud(r.budget)} · ${r.used}%` : " · no budget set"}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-gray-400">Budget $</span>
                  <input value={edit[r.brand] ?? (r.budget || "")} onChange={e => setEdit(p => ({ ...p, [r.brand]: e.target.value }))} onBlur={() => edit[r.brand] !== undefined && saveBudget(r.brand)}
                    inputMode="numeric" className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
