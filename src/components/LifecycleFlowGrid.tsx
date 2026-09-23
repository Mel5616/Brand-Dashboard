"use client";

import { useEffect, useMemo, useState } from "react";

// Lifecycle Flows (Email Marketing > Lifecycle Flows) — a portfolio-wide
// coverage grid: which brand has which Klaviyo flow live. The flows
// themselves run entirely in Klaviyo; this is visibility only, so a gap
// (a brand missing Winback, say) doesn't go unnoticed across 12 brands.
type Row = {
  id: number; brand_id: number; flow_key: string; status: "not_built" | "planned" | "live" | "paused";
  klaviyo_url: string | null; note: string | null; last_reviewed: string | null; updated_by: string | null; updated_at: string;
};
type FlowType = { key: string; label: string };
type Brand = { id: number; name: string; live?: boolean };

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  not_built: { label: "Not built", color: "#9ca3af", bg: "#f3f4f6" },
  planned: { label: "Planned", color: "#b45309", bg: "#fef3c7" },
  live: { label: "Live", color: "#047857", bg: "#d1fae5" },
  paused: { label: "Paused", color: "#475569", bg: "#e2e8f0" },
};
const STATUS_ORDER = ["not_built", "planned", "live", "paused"] as const;
const fmtD = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });

export function LifecycleFlowGrid({ brands }: { brands: Brand[] }) {
  const [items, setItems] = useState<Row[]>([]);
  const [flowTypes, setFlowTypes] = useState<FlowType[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ brand: Brand; flow: FlowType } | null>(null);
  const [form, setForm] = useState<Partial<Row>>({});

  const liveBrands = useMemo(() => brands.filter(b => b.live !== false).sort((a, b) => a.name.localeCompare(b.name)), [brands]);

  async function load() {
    const res = await fetch("/api/lifecycle-flows").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setFlowTypes(res.flowTypes || []); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const rowFor = (brandId: number, flowKey: string) => items.find(i => i.brand_id === brandId && i.flow_key === flowKey);

  function openCell(brand: Brand, flow: FlowType) {
    const existing = rowFor(brand.id, flow.key);
    setForm(existing ?? { status: "not_built" });
    setEditing({ brand, flow });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    const res = await fetch("/api/lifecycle-flows", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: editing.brand.id, flow_key: editing.flow.key, status: form.status, klaviyo_url: form.klaviyo_url, note: form.note, last_reviewed: form.last_reviewed }),
    }).then(r => r.json()).catch(() => null);
    setSaving(false);
    if (res?.ok) { setEditing(null); load(); }
    else setNeedsSetup(!!res?.needsSetup);
  }

  // Portfolio coverage summary — % of brand x flow cells that are "live".
  const totalCells = liveBrands.length * flowTypes.length;
  const liveCells = items.filter(i => i.status === "live" && liveBrands.some(b => b.id === i.brand_id)).length;

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Lifecycle Flows isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_lifecycle_flows.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Lifecycle Flows</h2>
          <p className="text-xs text-gray-400 mt-0.5">Coverage across the portfolio — the flows run in Klaviyo, this just tracks what's live where. Click a cell to edit.</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {STATUS_ORDER.map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_META[s].color }} />
              {STATUS_META[s].label}
            </span>
          ))}
          <span className="font-semibold text-slate-600 ml-2">{totalCells ? Math.round((liveCells / totalCells) * 100) : 0}% live</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 border-b border-gray-100 z-10">Brand</th>
              {flowTypes.map(f => (
                <th key={f.key} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 py-2 border-b border-gray-100 whitespace-nowrap" style={{ writingMode: "horizontal-tb" }}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liveBrands.map(b => (
              <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                <td className="sticky left-0 bg-white text-xs font-medium text-slate-700 px-3 py-1.5 whitespace-nowrap z-10">{b.name}</td>
                {flowTypes.map(f => {
                  const r = rowFor(b.id, f.key);
                  const status = r?.status ?? "not_built";
                  const meta = STATUS_META[status];
                  return (
                    <td key={f.key} className="px-1.5 py-1.5 text-center">
                      <button onClick={() => openCell(b, f)} title={`${b.name} · ${f.label} · ${meta.label}${r?.note ? ` — ${r.note}` : ""}`}
                        className="w-6 h-6 rounded-md border transition hover:scale-110" style={{ background: meta.bg, borderColor: meta.color }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-1">{editing.brand.name} · {editing.flow.label}</h3>
            <p className="text-xs text-gray-400 mb-4">This edits tracking only — it doesn't touch the flow in Klaviyo.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {STATUS_ORDER.map(s => (
                    <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))}
                      className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${form.status === s ? "text-white" : ""}`}
                      style={form.status === s ? { background: STATUS_META[s].color, borderColor: STATUS_META[s].color } : { color: STATUS_META[s].color, borderColor: STATUS_META[s].color, background: STATUS_META[s].bg }}>
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Klaviyo flow link (optional)</label>
                <input value={form.klaviyo_url ?? ""} onChange={e => setForm(p => ({ ...p, klaviyo_url: e.target.value }))} placeholder="https://www.klaviyo.com/flow/..."
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Last reviewed</label>
                <input type="date" value={form.last_reviewed ?? ""} onChange={e => setForm(p => ({ ...p, last_reviewed: e.target.value }))}
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Note</label>
                <textarea value={form.note ?? ""} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} rows={2} placeholder="e.g. needs a copy refresh, or why it's paused"
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none" />
              </div>
              {editing && rowFor(editing.brand.id, editing.flow.key)?.updated_by && (
                <p className="text-[11px] text-gray-300">Last updated by {rowFor(editing.brand.id, editing.flow.key)?.updated_by}</p>
              )}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={save} disabled={saving} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">{saving ? "Saving…" : "Save"}</button>
              <button onClick={() => setEditing(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
              {form.klaviyo_url && <a href={form.klaviyo_url} target="_blank" rel="noreferrer" className="ml-auto text-sm font-medium text-sky-600 hover:underline">Open in Klaviyo ↗</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
