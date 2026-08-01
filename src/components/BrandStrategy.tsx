"use client";

import React from "react";
import { fmtFull, fmt } from "@/lib/format";
import { BRAND_LOGOS } from "@/lib/brandLogos";

// Overview > Strategy — per-brand strategy scorecard: headline commitments
// paced live against actuals, pillar RAG scorecards, phase checklists, and the
// attached strategy PDF. Admin edits inline; everyone with the tab can read.

type Pillar = { name: string; measure: string; status: "green" | "amber" | "red"; note: string };
type Phase = { name: string; window: string; items: { text: string; done: boolean }[] };
type Strategy = {
  brand: string; fy: string; positioning: string | null;
  revenue_commit: number | null; marketing_commit: number | null;
  pdf_url: string | null; pdf_name: string | null; pillars: Pillar[]; phases: Phase[];
};

const RAG: Record<string, string> = { green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", red: "bg-rose-100 text-rose-600" };
const nextRag = (s: string) => (s === "green" ? "amber" : s === "amber" ? "red" : "green");

export function BrandStrategy({ brands, monthly, googleAds, metaAds, pinterestAds, marketingActuals, monthKeys, fyLabel, admin }: {
  brands: any[]; monthly: any[]; googleAds: any[]; metaAds: any[]; pinterestAds: any[]; marketingActuals: any[];
  monthKeys: string[]; fyLabel: string; admin: boolean;
}) {
  const [items, setItems] = React.useState<Strategy[]>([]);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [sel, setSel] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    fetch("/api/strategy").then(r => r.json()).then(d => { setItems(d.items ?? []); setNeedsSetup(!!d.needsSetup); }).catch(() => {});
  }, []);
  React.useEffect(load, [load]);

  const live = brands.filter((b: any) => b.live);
  const cur = items.find(s => s.brand === sel) ?? null;
  const selBrand = live.find((b: any) => b.name === sel);

  async function save(patch: Partial<Strategy>) {
    if (!sel) return;
    setBusy(true);
    const d = await fetch("/api/strategy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: sel, ...patch }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) setItems(p => { const rest = p.filter(x => x.brand !== sel); return [...rest, d.item]; });
    else if (d?.needsSetup) setNeedsSetup(true);
  }

  async function attachPdf(file: File) {
    if (!sel) return;
    const fd = new FormData(); fd.set("brand", sel); fd.set("file", file);
    setBusy(true);
    await fetch("/api/strategy", { method: "POST", body: fd }).catch(() => {});
    setBusy(false); load();
  }

  if (needsSetup) return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
      Run <code className="bg-gray-100 px-1 rounded">supabase/add_brand_strategy.sql</code> first.
    </div>
  );

  // FYTD actuals for pacing
  const fytdRev = (name: string) => {
    const b = live.find((x: any) => x.name === name);
    return b ? monthly.filter((m: any) => m.brand_id === b.id && monthKeys.includes(m.month_key)).reduce((s: number, m: any) => s + (Number(m.revenue) || 0), 0) : 0;
  };
  const fytdSpend = (name: string) => {
    const b = live.find((x: any) => x.name === name);
    if (!b) return 0;
    const ads = [...googleAds, ...metaAds, ...pinterestAds].filter((r: any) => r.brand_id === b.id && monthKeys.includes(r.month_key)).reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0);
    const other = marketingActuals.filter((a: any) => a.brand_id === b.id && monthKeys.includes(a.month_key) && !/Google|Meta|Pinterest/i.test(a.channel || "")).reduce((s: number, a: any) => s + (Number(a.spend) || 0), 0);
    return ads + other;
  };

  // ── Brand picker grid ──
  if (!sel) return (
    <div>
      <p className="text-xs text-gray-400 mb-3">One page per brand: the commitments, the pillars, the phases — and how we're tracking against them.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {live.map((b: any) => {
          const s = items.find(x => x.brand === b.name);
          const done = s?.phases?.flatMap(p => p.items).filter(i => i.done).length ?? 0;
          const total = s?.phases?.flatMap(p => p.items).length ?? 0;
          return (
            <button key={b.id} onClick={() => setSel(b.name)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition">
              <div className="flex items-center gap-2 mb-2 h-8">
                {BRAND_LOGOS[b.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={encodeURI(BRAND_LOGOS[b.id])} alt={b.name} className="h-7 max-w-[110px] object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (<><div className="w-3 h-3 rounded-full" style={{ background: b.color }} /><span className="font-bold text-slate-800 text-sm">{b.name}</span></>)}
              </div>
              {s?.revenue_commit ? (
                <p className="text-[12px] text-slate-500">{fmt(Number(s.revenue_commit))} commitment · {Math.round((fytdRev(b.name) / Number(s.revenue_commit)) * 100)}% paced</p>
              ) : (
                <p className="text-[12px] text-gray-300">{admin ? "No strategy yet — click to start" : "No strategy yet"}</p>
              )}
              {total > 0 && <p className="text-[11px] text-gray-400 mt-1">{done}/{total} milestones done</p>}
              <div className="mt-2 flex gap-1">
                {(s?.pillars ?? []).slice(0, 6).map((p, i) => <span key={i} title={p.name} className={`w-2.5 h-2.5 rounded-full inline-block ${p.status === "green" ? "bg-emerald-400" : p.status === "amber" ? "bg-amber-400" : "bg-rose-400"}`} />)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Single-brand scorecard ──
  const s: Strategy = cur ?? { brand: sel, fy: fyLabel, positioning: null, revenue_commit: null, marketing_commit: null, pdf_url: null, pdf_name: null, pillars: [], phases: [] };
  const rev = fytdRev(sel), spend = fytdSpend(sel);
  const inp = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300";

  return (
    <div className="max-w-[860px] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setSel(null)} className="text-[12.5px] font-semibold text-gray-400 hover:text-gray-600">← All brands</button>
        <div className="flex items-center gap-2">
          {s.pdf_url && <a href={s.pdf_url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-violet-600 hover:underline">📄 {s.pdf_name || "Strategy PDF"}</a>}
          {admin && (
            <label className="text-[12.5px] font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 cursor-pointer">
              {s.pdf_url ? "Replace PDF" : "Attach strategy PDF"}
              <input type="file" accept="application/pdf" className="hidden" onChange={e => e.target.files?.[0] && attachPdf(e.target.files[0])} />
            </label>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-3.5 h-3.5 rounded-full" style={{ background: selBrand?.color ?? "#94a3b8" }} />
          <h2 className="text-lg font-bold text-slate-800">{sel}</h2>
          <span className="text-[11px] text-gray-400">{s.fy}</span>
        </div>
        {admin ? (
          <input defaultValue={s.positioning ?? ""} placeholder="One-line positioning — what this brand stands for…"
            onBlur={e => e.target.value !== (s.positioning ?? "") && save({ positioning: e.target.value })}
            className="w-full text-sm text-slate-600 italic bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5" />
        ) : s.positioning && <p className="text-sm text-slate-600 italic">{s.positioning}</p>}

        {/* Commitments with live pacing */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {([["revenue_commit", "Revenue commitment", rev, "FYTD revenue"], ["marketing_commit", "Marketing investment", spend, "FYTD spent"]] as const).map(([key, label, actual, actualLabel]) => {
            const commit = Number(s[key]) || 0;
            const pctv = commit > 0 ? Math.min(100, Math.round((actual / commit) * 100)) : 0;
            return (
              <div key={key} className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-[11px] text-gray-400">{label}</p>
                {admin ? (
                  <input type="number" defaultValue={commit || ""} placeholder="0"
                    onBlur={e => Number(e.target.value) !== commit && save({ [key]: e.target.value } as any)}
                    className="text-xl font-bold text-gray-900 bg-transparent w-full focus:outline-none focus:bg-white rounded px-1" />
                ) : <p className="text-xl font-bold text-gray-900">{commit ? fmtFull(commit) : "—"}</p>}
                {commit > 0 && (
                  <>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pctv}%`, background: key === "revenue_commit" ? "#10b981" : "#6366f1" }} />
                    </div>
                    <p className="text-[10.5px] text-gray-400 mt-1">{actualLabel} {fmtFull(actual)} · {pctv}%</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pillars */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Strategic pillars</h3>
          {admin && <button onClick={() => save({ pillars: [...s.pillars, { name: "New pillar", measure: "", status: "amber", note: "" }] })} className="text-[12px] font-semibold text-emerald-600 hover:underline">＋ Pillar</button>}
        </div>
        {s.pillars.length === 0 ? <p className="text-sm text-gray-400">No pillars yet{admin ? " — add the 4–6 bets this brand is making." : "."}</p> : (
          <div className="space-y-2">
            {s.pillars.map((p, i) => (
              <div key={i} className="flex items-center gap-3 border border-gray-50 rounded-lg px-3 py-2">
                <button disabled={!admin} onClick={() => { const next = [...s.pillars]; next[i] = { ...p, status: nextRag(p.status) as any }; save({ pillars: next }); }}
                  className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 shrink-0 ${RAG[p.status]}`} title={admin ? "Click to cycle status" : undefined}>
                  {p.status.toUpperCase()}
                </button>
                {admin ? (
                  <>
                    <input defaultValue={p.name} onBlur={e => { const next = [...s.pillars]; next[i] = { ...p, name: e.target.value }; save({ pillars: next }); }} className="font-semibold text-sm text-slate-700 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 w-40 shrink-0" />
                    <input defaultValue={p.measure} placeholder="How we measure it…" onBlur={e => { const next = [...s.pillars]; next[i] = { ...p, measure: e.target.value }; save({ pillars: next }); }} className="text-[12.5px] text-slate-500 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 flex-1 min-w-0" />
                    <button onClick={() => save({ pillars: s.pillars.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-rose-500 text-xs shrink-0">✕</button>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-sm text-slate-700 w-40 shrink-0">{p.name}</span>
                    <span className="text-[12.5px] text-slate-500 flex-1 min-w-0 truncate">{p.measure}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phases */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Phases &amp; milestones</h3>
          {admin && <button onClick={() => save({ phases: [...s.phases, { name: `Phase ${s.phases.length + 1}`, window: "", items: [] }] })} className="text-[12px] font-semibold text-emerald-600 hover:underline">＋ Phase</button>}
        </div>
        {s.phases.length === 0 ? <p className="text-sm text-gray-400">No phases yet{admin ? " — break the year into 2–4 phases with milestone checklists." : "."}</p> : (
          <div className="grid sm:grid-cols-2 gap-4">
            {s.phases.map((ph, i) => {
              const done = ph.items.filter(x => x.done).length;
              return (
                <div key={i} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    {admin ? (
                      <input defaultValue={ph.name} onBlur={e => { const next = [...s.phases]; next[i] = { ...ph, name: e.target.value }; save({ phases: next }); }} className="font-bold text-sm text-slate-800 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 flex-1 min-w-0" />
                    ) : <span className="font-bold text-sm text-slate-800">{ph.name}</span>}
                    <span className="text-[11px] text-gray-400 shrink-0">{done}/{ph.items.length}</span>
                    {admin && <button onClick={() => save({ phases: s.phases.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-rose-500 text-xs shrink-0">✕</button>}
                  </div>
                  {admin ? (
                    <input defaultValue={ph.window} placeholder="e.g. Aug–Oct 2026" onBlur={e => { const next = [...s.phases]; next[i] = { ...ph, window: e.target.value }; save({ phases: next }); }} className="text-[11.5px] text-gray-400 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 mb-2 w-full" />
                  ) : ph.window && <p className="text-[11.5px] text-gray-400 mb-2">{ph.window}</p>}
                  <div className="space-y-1">
                    {ph.items.map((it, k) => (
                      <label key={k} className={`flex items-start gap-2 text-[13px] ${admin ? "cursor-pointer" : ""}`}>
                        <input type="checkbox" checked={it.done} disabled={!admin}
                          onChange={() => { const next = [...s.phases]; const items = [...ph.items]; items[k] = { ...it, done: !it.done }; next[i] = { ...ph, items }; save({ phases: next }); }}
                          className="accent-emerald-500 mt-0.5" />
                        <span className={it.done ? "text-gray-300 line-through" : "text-slate-600"}>{it.text}</span>
                        {admin && <button onClick={e => { e.preventDefault(); const next = [...s.phases]; next[i] = { ...ph, items: ph.items.filter((_, j) => j !== k) }; save({ phases: next }); }} className="text-gray-200 hover:text-rose-400 text-[10px] ml-auto">✕</button>}
                      </label>
                    ))}
                  </div>
                  {admin && (
                    <input placeholder="＋ milestone, Enter to add"
                      onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { const next = [...s.phases]; next[i] = { ...ph, items: [...ph.items, { text: e.currentTarget.value.trim(), done: false }] }; save({ phases: next }); e.currentTarget.value = ""; } }}
                      className={`${inp} w-full mt-2 text-[12.5px]`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {busy && <p className="text-[11px] text-gray-300 text-center">Saving…</p>}
    </div>
  );
}
