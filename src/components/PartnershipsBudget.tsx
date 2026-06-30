"use client";

import { useEffect, useMemo, useState } from "react";
import { INFLUENCER_FY_MONTHS, INFLUENCER_FY_KEYS, INFLUENCER_FY_LABEL } from "@/lib/influencerFy";
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Doughnut, Line, Bar } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

// Partnerships & Affiliates budget (admin). Spend (free product cost × qty + cash) vs the
// per-brand budget pulled from the marketing budget sheet ("Partnerships & Affiliates").

type Entry = { brand: string | null; month_key: string; total_cost: number | null };
type Budget = { brand: string; month_key: string; budget: number };

const aud = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const fmtK = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
const PALETTE = ["#6366f1", "#14b8a6", "#f97316", "#e11d48", "#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#64748b", "#0072CE", "#84cc16"];
const meterColor = (used: number) => used >= 100 ? "#ef4444" : used >= 80 ? "#f59e0b" : "#6366f1";

export function PartnershipsBudget() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");

  async function load() {
    const [e, b] = await Promise.all([
      fetch("/api/partnerships/entries", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/partnerships/marketing-budget", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
    ]);
    if (e.needsSetup) { setState("needsSetup"); return; }
    if (!e.ok) { setState("error"); return; }
    setEntries(e.entries || []); setBudgets(b.rows || []); setState("ready");
  }
  useEffect(() => { load(); }, []);

  const fy = new Set(INFLUENCER_FY_KEYS);
  const months = INFLUENCER_FY_MONTHS;

  const rows = useMemo(() => {
    const agg: Record<string, { spend: number; budget: number }> = {};
    const bucket = (br: string) => (agg[br] ??= { spend: 0, budget: 0 });
    for (const e of entries) if (fy.has(e.month_key)) bucket(e.brand || "—").spend += Number(e.total_cost) || 0;
    for (const bd of budgets) if (fy.has(bd.month_key)) bucket(bd.brand).budget += Number(bd.budget) || 0;
    return Object.entries(agg).map(([brand, a]) => ({ brand, ...a, used: a.budget > 0 ? Math.round((a.spend / a.budget) * 100) : (a.spend > 0 ? 100 : 0) }))
      .sort((x, y) => y.budget - x.budget || y.spend - x.spend);
  }, [entries, budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const pct = totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0;

  // Monthly series
  const monthlySpend = months.map(m => entries.filter(e => e.month_key === m.key).reduce((s, e) => s + (Number(e.total_cost) || 0), 0));
  const monthlyBudget = months.map(m => budgets.filter(b => b.month_key === m.key).reduce((s, b) => s + (Number(b.budget) || 0), 0));
  const cum = (a: number[]) => a.reduce((acc: number[], v, i) => { acc.push((acc[i - 1] ?? 0) + v); return acc; }, []);

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_partnerships.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load budget.</div>;

  const baseScales: any = { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => fmtK(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } };
  const labels = months.map(m => m.labelShort);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{INFLUENCER_FY_LABEL} · budget pulled from the marketing budget (Partnerships &amp; Affiliates) · spend ex-GST, free product at cost × qty</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Spend to date", value: aud(totalSpend), sub: `${entries.length} partnerships` },
          { label: "FY Budget", value: aud(totalBudget), sub: "all brands · from marketing sheet" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Budget allocation donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Budget allocation by brand</h3>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
              <Doughnut data={{ labels: rows.map(r => r.brand), datasets: [{ data: rows.map(r => r.budget), backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: "#fff", borderWidth: 2 }] }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${aud(c.parsed)} (${totalBudget > 0 ? ((c.parsed / totalBudget) * 100).toFixed(0) : 0}%)` } } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-[10px] text-gray-400">Total</span><span className="text-sm font-bold text-slate-800">{fmtK(totalBudget)}</span></div>
            </div>
            <div className="flex-1 space-y-1 min-w-0">
              {rows.slice(0, 8).map((r, i) => (
                <div key={r.brand} className="flex items-center justify-between text-xs gap-2">
                  <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="text-gray-600 truncate">{r.brand}</span></span>
                  <span className="text-gray-400 font-medium shrink-0">{totalBudget > 0 ? ((r.budget / totalBudget) * 100).toFixed(0) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cumulative pacing */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Cumulative pacing</h3>
          <p className="text-xs text-gray-400 mb-3">Spend to date vs budget plan</p>
          <div className="h-52">
            <Line data={{ labels, datasets: [
              { label: "Budget", data: cum(monthlyBudget), borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
              { label: "Spend", data: cum(monthlySpend), borderColor: "#6366f1", backgroundColor: "#6366f122", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 },
            ] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${aud(c.parsed.y ?? 0)}` } } }, scales: baseScales }} />
          </div>
        </div>

        {/* Monthly spend vs budget */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Monthly spend vs budget</h3>
          <div className="h-52">
            <Bar data={{ labels, datasets: [
              { type: "bar" as const, label: "Spend", data: monthlySpend, backgroundColor: "#6366f1", borderRadius: 3, order: 2 },
              { type: "line" as const, label: "Budget", data: monthlyBudget, borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, order: 1 },
            ] as any }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${aud(c.parsed.y ?? 0)}` } } }, scales: baseScales }} />
          </div>
        </div>

        {/* Spend vs budget by brand bars */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Spend vs budget by brand</h3>
          {rows.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No partnerships or budgets yet.</p> : (
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {rows.map(r => (
                <div key={r.brand} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-slate-700 truncate">{r.brand}</span>
                  <div className="flex-1">
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.used)}%`, background: meterColor(r.used) }} /></div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{aud(r.spend)}{r.budget > 0 ? ` of ${aud(r.budget)} · ${r.used}%` : " · no budget"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
