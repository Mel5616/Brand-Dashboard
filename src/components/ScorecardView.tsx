"use client";

import { useMemo, useState } from "react";

// Interactive scorecard: collapsible KPI areas, per-KPI latest RAG + history,
// a scoring drawer, and the transparent weighted quarterly rollup
// (green=1, amber=0.5, red=0 → area % × area weight → overall /100).
type Staff = { id: string; full_name: string; role_title: string; employment_type: string; hours: string; work_arrangement: string; location: string; reports_to: string };
type Assignment = { brand: string; tier: string; ownership: string };
type Area = { id: string; name: string; sort_order: number; weight_pct: number };
type Kpi = { id: string; area_id: string; description: string; target: string; measured_via: string; cadence: string; is_tbc: boolean; tbc_note: string };
type Score = { id?: string; kpi_id: string; period: string; rag: string; actual_value: string; notes: string; scored_at?: string };

const RAG = {
  green: { label: "Green", dot: "#10b981", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  amber: { label: "Amber", dot: "#f59e0b", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  red: { label: "Red", dot: "#ef4444", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  not_scored: { label: "Not scored", dot: "#cbd5e1", chip: "bg-slate-50 text-slate-400 border-slate-200" },
} as const;
type RagKey = keyof typeof RAG;
const CADENCE_LABEL: Record<string, string> = { per_campaign: "Per campaign", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", annual: "Annual", ongoing: "Ongoing" };

// Current period per cadence, and the last 6 selectable periods.
function currentPeriod(cadence: string, d = new Date()): string {
  const y = d.getFullYear(), m = d.getMonth() + 1;
  if (cadence === "quarterly") return `${y}-Q${Math.ceil(m / 3)}`;
  if (cadence === "half_yearly") return `${y}-H${m <= 6 ? 1 : 2}`;
  if (cadence === "annual") return `${y}`;
  return `${y}-${String(m).padStart(2, "0")}`;   // monthly, per_campaign, ongoing
}
function periodOptions(cadence: string): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now);
    if (cadence === "quarterly") d.setMonth(now.getMonth() - i * 3);
    else if (cadence === "half_yearly") d.setMonth(now.getMonth() - i * 6);
    else if (cadence === "annual") d.setFullYear(now.getFullYear() - i);
    else d.setMonth(now.getMonth() - i);
    const p = currentPeriod(cadence, d);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function ScorecardView({ staff, assignments, areas, kpis, scores: initialScores }: {
  staff: Staff; assignments: Assignment[]; areas: Area[]; kpis: Kpi[]; scores: Score[];
}) {
  const [scores, setScores] = useState<Score[]>(initialScores);
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set(areas.map(a => a.id)));
  const [drawer, setDrawer] = useState<Kpi | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [form, setForm] = useState({ period: "", rag: "green" as RagKey, actual_value: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const latest = useMemo(() => {
    const m = new Map<string, Score>();
    for (const s of scores) { const cur = m.get(s.kpi_id); if (!cur || (s.scored_at ?? "") > (cur.scored_at ?? "")) m.set(s.kpi_id, s); }
    return m;
  }, [scores]);
  const historyOf = (kpiId: string) => scores.filter(s => s.kpi_id === kpiId).sort((a, b) => (b.scored_at ?? "").localeCompare(a.scored_at ?? "")).slice(0, 6);

  // Transparent quarterly rollup: latest score per KPI this quarter-relevant period.
  const rollup = useMemo(() => {
    const val = (r?: string): number | null => r === "green" ? 1 : r === "amber" ? 0.5 : r === "red" ? 0 : null;
    const perArea = areas.map(a => {
      const mine = kpis.filter(k => k.area_id === a.id);
      const vals = mine.map(k => val(latest.get(k.id)?.rag)).filter((v): v is number => v !== null);
      const counts = { g: 0, a: 0, r: 0 };
      for (const k of mine) { const rg = latest.get(k.id)?.rag; if (rg === "green") counts.g++; else if (rg === "amber") counts.a++; else if (rg === "red") counts.r++; }
      const pct = vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length) * 100 : null;
      return { area: a, scored: vals.length, total: mine.length, counts, pct, contribution: pct !== null ? (pct * a.weight_pct) / 100 : 0 };
    });
    const scoredAreas = perArea.filter(p => p.pct !== null);
    const overall = scoredAreas.length ? perArea.reduce((s, p) => s + p.contribution, 0) : null;
    return { perArea, overall };
  }, [areas, kpis, latest]);

  const weightSum = areas.reduce((s, a) => s + (a.weight_pct || 0), 0);
  const overallRag: RagKey = rollup.overall === null ? "not_scored" : rollup.overall >= 70 ? "green" : rollup.overall >= 40 ? "amber" : "red";

  function openDrawer(k: Kpi) {
    const period = currentPeriod(k.cadence);
    const existing = scores.find(s => s.kpi_id === k.id && s.period === period);
    setForm({ period, rag: (existing?.rag as RagKey) || "green", actual_value: existing?.actual_value || "", notes: existing?.notes || "" });
    setErr(""); setDrawer(k);
  }
  function pickPeriod(k: Kpi, period: string) {
    const existing = scores.find(s => s.kpi_id === k.id && s.period === period);
    setForm(f => ({ period, rag: (existing?.rag as RagKey) || f.rag, actual_value: existing?.actual_value || "", notes: existing?.notes || "" }));
  }
  async function saveScore() {
    if (!drawer) return;
    setBusy(true); setErr("");
    try {
      const d = await fetch("/api/scorecards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score.save", kpi_id: drawer.id, ...form }) }).then(r => r.json());
      if (d.ok) {
        setScores(p => [d.item, ...p.filter(s => !(s.kpi_id === drawer.id && s.period === form.period))]);
        setDrawer(null);
      } else setErr(d.error || "Couldn't save.");
    } catch { setErr("Couldn't save — check your connection."); }
    finally { setBusy(false); }
  }

  const tiers = ["A", "B", "C"].map(t => ({ tier: t, brands: assignments.filter(x => x.tier === t) })).filter(x => x.brands.length);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{staff.full_name}</h1>
            <p className="text-[14px] text-slate-500">{staff.role_title}{staff.reports_to ? ` · reports to ${staff.reports_to}` : ""}</p>
            <p className="text-[12px] text-gray-400 mt-1">{[staff.employment_type, staff.hours, staff.work_arrangement].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">This quarter · weighted</p>
            <p className="text-3xl font-extrabold text-slate-800 tabular-nums">{rollup.overall !== null ? Math.round(rollup.overall) : "—"}<span className="text-sm font-medium text-gray-400">/100</span></p>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border ${RAG[overallRag].chip}`}><span className="w-2 h-2 rounded-full" style={{ background: RAG[overallRag].dot }} />{RAG[overallRag].label}</span>
          </div>
        </div>
        {weightSum !== 100 && <p className="mt-3 text-[12px] font-medium text-rose-500">⚠ Area weights sum to {weightSum}%, not 100% — fix the weights before relying on the rollup.</p>}
      </div>

      {/* Brand assignments */}
      {tiers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Brand assignments <span className="font-normal normal-case tracking-normal text-gray-400">· ownership split TBC — all seeded as support</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tiers.map(({ tier, brands }) => (
              <div key={tier} className="rounded-xl bg-gray-50/70 border border-gray-100 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Tier {tier}</p>
                <div className="flex flex-wrap gap-1.5">
                  {brands.map(b => (
                    <span key={b.brand} className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-700 bg-white border border-gray-200 rounded-full px-2.5 py-0.5">
                      {b.brand}<span className={`text-[9px] font-bold uppercase ${b.ownership === "primary" ? "text-emerald-600" : "text-gray-400"}`}>{b.ownership === "primary" ? "P" : "S"}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quarterly rollup — the maths, shown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Quarterly rollup <span className="font-normal normal-case tracking-normal text-gray-400">· green=1, amber=0.5, red=0 · area % × weight</span></p>
        <div className="space-y-1">
          {rollup.perArea.map(p => (
            <div key={p.area.id} className="flex items-center gap-3 text-[13px]">
              <span className="text-slate-600 w-64 truncate shrink-0">{p.area.name}</span>
              <span className="text-gray-400 w-28 shrink-0">{p.scored}/{p.total} scored</span>
              <span className="w-24 shrink-0 tabular-nums text-gray-400">{p.counts.g}G · {p.counts.a}A · {p.counts.r}R</span>
              <span className="tabular-nums text-slate-600 w-16 text-right shrink-0">{p.pct !== null ? `${Math.round(p.pct)}%` : "—"}</span>
              <span className="text-gray-300 shrink-0">×</span>
              <span className="tabular-nums text-slate-600 w-10 shrink-0">{p.area.weight_pct}%</span>
              <span className="text-gray-300 shrink-0">=</span>
              <span className="tabular-nums font-semibold text-slate-800 w-12 shrink-0">{p.pct !== null ? (p.contribution).toFixed(1) : "—"}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 text-[13px] border-t border-gray-100 pt-1.5 mt-1.5 font-bold text-slate-800">
            <span className="w-64 shrink-0">Overall</span><span className="flex-1" />
            <span className="tabular-nums">{rollup.overall !== null ? Math.round(rollup.overall) : "—"}/100</span>
          </div>
        </div>
      </div>

      {/* KPI areas */}
      {areas.map(a => {
        const mine = kpis.filter(k => k.area_id === a.id);
        const open = openAreas.has(a.id);
        return (
          <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpenAreas(p => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/70 text-left">
              <span className="flex items-center gap-2">
                <svg className={`w-4 h-4 text-gray-300 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="font-semibold text-slate-800">{a.name}</span>
              </span>
              <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-0.5">{a.weight_pct}%</span>
            </button>
            {open && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {mine.map(k => {
                  const l = latest.get(k.id);
                  const rag = RAG[(l?.rag as RagKey) || "not_scored"];
                  return (
                    <div key={k.id} className="px-5 py-3 hover:bg-emerald-50/30 cursor-pointer" onClick={() => openDrawer(k)}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium text-slate-800 leading-snug">{k.description}{k.is_tbc && <span title={k.tbc_note} className="ml-1.5 text-[9px] font-bold uppercase text-amber-700 bg-amber-100 rounded px-1 py-0.5 align-middle">TBC</span>}</p>
                          <p className="text-[12px] text-gray-500 mt-0.5">Target: <span className="text-slate-600">{k.target}</span> · {CADENCE_LABEL[k.cadence] ?? k.cadence}</p>
                          <p className="text-[11px] text-gray-400">Measured via {k.measured_via}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border ${rag.chip}`}><span className="w-2 h-2 rounded-full" style={{ background: rag.dot }} />{rag.label}</span>
                          {l?.actual_value && <p className="text-[12px] font-semibold text-slate-700 mt-1 tabular-nums">{l.actual_value}</p>}
                          {historyOf(k.id).length > 0 && (
                            <button onClick={e => { e.stopPropagation(); setHistoryFor(historyFor === k.id ? null : k.id); }} className="block ml-auto mt-1 text-[11px] text-gray-400 hover:text-emerald-600">{l?.period} · history</button>
                          )}
                        </div>
                      </div>
                      {historyFor === k.id && (
                        <div className="mt-2 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
                          {historyOf(k.id).map(h => (
                            <span key={h.period} title={`${h.actual_value || ""} ${h.notes || ""}`.trim()} className={`inline-flex items-center gap-1 text-[11px] rounded-full border px-2 py-0.5 ${RAG[(h.rag as RagKey) || "not_scored"].chip}`}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: RAG[(h.rag as RagKey) || "not_scored"].dot }} />{h.period}{h.actual_value ? ` · ${h.actual_value}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Scoring drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDrawer(null)}>
          <div className="w-full max-w-md h-full bg-white shadow-2xl p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="font-bold text-slate-800 leading-snug">{drawer.description}</h3>
              <button onClick={() => setDrawer(null)} className="text-gray-400 hover:text-gray-600 shrink-0">✕</button>
            </div>
            <p className="text-[12px] text-gray-500 mb-4">Target: {drawer.target} · {CADENCE_LABEL[drawer.cadence] ?? drawer.cadence}{drawer.is_tbc ? ` · TBC: ${drawer.tbc_note}` : ""}</p>

            <label className="block mb-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-400">Period</span>
              <select value={form.period} onChange={e => pickPeriod(drawer, e.target.value)} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {periodOptions(drawer.cadence).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <span className="text-[10px] uppercase tracking-wider text-gray-400">RAG</span>
            <div className="flex gap-2 mt-1 mb-3">
              {(["green", "amber", "red"] as RagKey[]).map(r => (
                <button key={r} onClick={() => setForm(f => ({ ...f, rag: r }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2.5 border ${form.rag === r ? RAG[r].chip + " ring-2 ring-offset-1" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                  style={form.rag === r ? { ["--tw-ring-color" as any]: RAG[r].dot } : undefined}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: RAG[r].dot }} />{RAG[r].label}
                </button>
              ))}
            </div>

            <label className="block mb-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-400">Actual value <span className="normal-case text-gray-300">· e.g. 2.4:1, 87%</span></span>
              <input value={form.actual_value} onChange={e => setForm(f => ({ ...f, actual_value: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>
            <label className="block mb-4">
              <span className="text-[10px] uppercase tracking-wider text-gray-400">Notes</span>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>

            <div className="flex items-center gap-3">
              <button onClick={saveScore} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Saving…" : `Save ${form.period}`}</button>
              {err && <span className="text-sm text-rose-500">{err}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
