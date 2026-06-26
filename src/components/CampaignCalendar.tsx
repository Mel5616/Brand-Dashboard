"use client";

import React, { useEffect, useRef, useState } from "react";

// Portfolio Campaign Calendar — a Now / Next / Later roadmap with team ownership.
// Persists to Supabase via /api/campaigns and /api/campaigns/maintenance.
// Australian English throughout. Owners default to TBC until assigned.

type Campaign = {
  id: string; horizon: string; campaign: string; brand: string; tier: string;
  owner: string; channel: string; status: string; key_date: string; note: string; sort_order: number;
};
type Maint = { id: string; name: string; tier: string; sort_order: number };

const HORIZONS = [
  { id: "now", label: "Now", sub: "July" },
  { id: "next", label: "Next", sub: "August" },
  { id: "later", label: "Later", sub: "September" },
];
const TIERS = ["A", "B", "C"];
const STATUSES = ["Live", "Build", "Planned", "Pipeline", "Paused"];
const STATUS_COLOR: Record<string, string> = { Live: "#2E7D5B", Build: "#C77D3C", Planned: "#3C6E9E", Pipeline: "#8A7BB0", Paused: "#9A9A9A" };
const TIER_DOT: Record<string, string> = { A: "#E8956B", B: "#7FA9A0", C: "#B9A7C9" };

const jsonHeaders = { "Content-Type": "application/json" };

export function CampaignCalendar() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [maint, setMaint] = useState<Maint[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      try {
        const [c, m] = await Promise.all([
          fetch("/api/campaigns").then(r => r.json()),
          fetch("/api/campaigns/maintenance").then(r => r.json()),
        ]);
        if (c.needsSetup || m.needsSetup) setNeedsSetup(true);
        setItems(c.items ?? []);
        setMaint(m.items ?? []);
      } catch {
        setError("Could not load the calendar. Refresh to try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── campaign writes ──────────────────────────────────────────────────────
  async function patch(id: string, fields: Partial<Campaign>) {
    try {
      const r = await fetch("/api/campaigns", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ id, ...fields }) });
      if (!(await r.json()).ok) throw new Error();
    } catch {
      setError("That change did not save. Edit the cell again to retry.");
    }
  }
  function editField(id: string, field: keyof Campaign, value: string, immediate = false) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, [field]: value } : it)));
    if (id.startsWith("temp-")) return; // wait for the create to land first
    const key = id + field;
    clearTimeout(timers.current[key]);
    if (immediate) patch(id, { [field]: value } as Partial<Campaign>);
    else timers.current[key] = setTimeout(() => patch(id, { [field]: value } as Partial<Campaign>), 600);
  }
  async function addRow(horizon: string) {
    const order = Math.max(0, ...items.filter(i => i.horizon === horizon).map(i => i.sort_order || 0)) + 1;
    const draft = { horizon, campaign: "", brand: "", tier: "A", owner: "TBC", channel: "", status: "Planned", key_date: "", note: "", sort_order: order };
    const tempId = "temp-" + Date.now();
    setItems(prev => [...prev, { ...draft, id: tempId }]);
    try {
      const j = await (await fetch("/api/campaigns", { method: "POST", headers: jsonHeaders, body: JSON.stringify(draft) })).json();
      if (!j.ok) throw new Error();
      setItems(prev => prev.map(i => (i.id === tempId ? j.item : i)));
    } catch {
      setItems(prev => prev.filter(i => i.id !== tempId));
      setError("Could not add the row. Try again.");
    }
  }
  async function delRow(id: string) {
    if (!window.confirm("Delete this campaign?")) return;
    const prev = items;
    setItems(items.filter(i => i.id !== id));
    try {
      const j = await (await fetch("/api/campaigns", { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ id }) })).json();
      if (!j.ok) throw new Error();
    } catch {
      setItems(prev);
      setError("Could not delete the row. Try again.");
    }
  }

  // ── maintenance writes ───────────────────────────────────────────────────
  function editMaint(id: string, field: keyof Maint, value: string, immediate = false) {
    setMaint(prev => prev.map(m => (m.id === id ? { ...m, [field]: value } : m)));
    if (id.startsWith("temp-")) return;
    const key = "m" + id + field;
    clearTimeout(timers.current[key]);
    const run = async () => {
      try { await fetch("/api/campaigns/maintenance", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ id, [field]: value }) }); }
      catch { setError("That change did not save. Edit again to retry."); }
    };
    if (immediate) run(); else timers.current[key] = setTimeout(run, 600);
  }
  async function addMaint() {
    const order = Math.max(0, ...maint.map(m => m.sort_order || 0)) + 1;
    const tempId = "temp-" + Date.now();
    setMaint(prev => [...prev, { id: tempId, name: "New brand", tier: "C", sort_order: order }]);
    try {
      const j = await (await fetch("/api/campaigns/maintenance", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: "New brand", tier: "C", sort_order: order }) })).json();
      if (!j.ok) throw new Error();
      setMaint(prev => prev.map(m => (m.id === tempId ? j.item : m)));
    } catch {
      setMaint(prev => prev.filter(m => m.id !== tempId));
      setError("Could not add the brand. Try again.");
    }
  }
  async function delMaint(id: string) {
    const prev = maint;
    setMaint(maint.filter(m => m.id !== id));
    try {
      const j = await (await fetch("/api/campaigns/maintenance", { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ id }) })).json();
      if (!j.ok) throw new Error();
    } catch {
      setMaint(prev);
      setError("Could not remove the brand. Try again.");
    }
  }

  // ── exports ──────────────────────────────────────────────────────────────
  function download(name: string, type: string, data: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function exportCSV() {
    const cols = ["horizon", "campaign", "brand", "tier", "owner", "channel", "status", "key_date", "note"];
    const head = cols.join(",");
    const rows = items.map(i => cols.map(c => `"${String((i as any)[c] ?? "").replace(/"/g, '""')}"`).join(","));
    download("campaign-calendar.csv", "text/csv", [head, ...rows].join("\n"));
  }
  function exportJSON() {
    download("campaign-calendar.json", "application/json", JSON.stringify({ campaigns: items, maintenance: maint }, null, 2));
  }

  // ── render ───────────────────────────────────────────────────────────────
  const cell = "w-full bg-transparent rounded px-1.5 py-1 text-sm text-slate-700 placeholder:text-gray-300 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 motion-reduce:transition-none";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Campaign Calendar</h2>
          <p className="text-xs text-gray-400">Cross-brand Now / Next / Later · July to September 2026 · owners shown per campaign</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition motion-reduce:transition-none">Export CSV</button>
          <button onClick={exportJSON} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition motion-reduce:transition-none">Export JSON</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 bg-red-50 border border-red-100 text-red-700 rounded-lg px-4 py-2.5 mb-4 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-medium">Dismiss</button>
        </div>
      )}

      {needsSetup && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-lg px-4 py-3 mb-4 text-sm">
          The campaigns tables are not set up yet. Run the setup SQL provided, then refresh this tab.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-16 justify-center">
          <span className="w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin motion-reduce:animate-none" />
          Loading the calendar
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {HORIZONS.map(h => {
              const rows = items.filter(i => i.horizon === h.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
              return (
                <section key={h.id} className="bg-gray-50/60 rounded-2xl border border-gray-100 p-3" aria-label={`${h.label} (${h.sub})`}>
                  <header className="flex items-baseline justify-between px-1 mb-2">
                    <h3 className="text-sm font-bold text-slate-700">{h.label} <span className="text-gray-400 font-normal">· {h.sub}</span></h3>
                    <span className="text-xs text-gray-400">{rows.length}</span>
                  </header>

                  <div className="space-y-2.5">
                    {rows.map(c => (
                      <article key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1.5">
                        <div className="flex items-start gap-1">
                          <input aria-label="Campaign name" value={c.campaign} placeholder="Campaign name" onChange={e => editField(c.id, "campaign", e.target.value)} className={cell + " font-semibold text-slate-800"} />
                          <button aria-label="Delete campaign" onClick={() => delRow(c.id)} className="shrink-0 text-gray-300 hover:text-red-500 rounded px-1.5 py-1 text-sm transition motion-reduce:transition-none">✕</button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TIER_DOT[c.tier] ?? "#ccc" }} aria-hidden />
                          <select aria-label="Tier" value={c.tier} onChange={e => editField(c.id, "tier", e.target.value, true)} className="text-xs text-gray-500 bg-transparent rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer">
                            {TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
                          </select>
                          <input aria-label="Brand" value={c.brand} placeholder="Brand" onChange={e => editField(c.id, "brand", e.target.value)} className={cell + " flex-1"} />
                        </div>

                        <div className="flex items-center gap-1">
                          <select aria-label="Status" value={c.status} onChange={e => editField(c.id, "status", e.target.value, true)} className="text-xs font-semibold text-white rounded-full px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400 cursor-pointer" style={{ background: STATUS_COLOR[c.status] ?? "#9A9A9A" }}>
                            {STATUSES.map(s => <option key={s} value={s} className="text-slate-700 bg-white">{s}</option>)}
                          </select>
                          <input aria-label="Key date" value={c.key_date} placeholder="Key date" onChange={e => editField(c.id, "key_date", e.target.value)} className={cell + " flex-1 text-xs"} />
                        </div>

                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-gray-400 shrink-0 pl-1.5">Owner</span>
                          <input aria-label="Owner" value={c.owner} placeholder="TBC" onChange={e => editField(c.id, "owner", e.target.value)} className={cell + " font-medium"} />
                        </div>
                        <input aria-label="Channel" value={c.channel} placeholder="Channel" onChange={e => editField(c.id, "channel", e.target.value)} className={cell + " text-xs"} />
                        <textarea aria-label="Note" value={c.note} placeholder="One-line strategic reason" rows={2} onChange={e => editField(c.id, "note", e.target.value)} className={cell + " text-xs text-gray-500 resize-none"} />
                      </article>
                    ))}

                    <button onClick={() => addRow(h.id)} className="w-full text-sm text-gray-400 hover:text-indigo-600 hover:bg-white border border-dashed border-gray-200 hover:border-indigo-200 rounded-xl py-2 transition motion-reduce:transition-none">
                      + Add campaign
                    </button>
                  </div>
                </section>
              );
            })}
          </div>

          {/* Maintenance brands (no-spend) */}
          <section className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-4" aria-label="Maintenance brands">
            <h3 className="text-sm font-bold text-slate-700 mb-1">On maintenance</h3>
            <p className="text-xs text-gray-400 mb-3">Brands ticking over on no-spend</p>
            <div className="flex flex-wrap gap-2">
              {maint.map(m => (
                <div key={m.id} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full pl-2.5 pr-1.5 py-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TIER_DOT[m.tier] ?? "#ccc" }} aria-hidden />
                  <input aria-label="Maintenance brand name" value={m.name} onChange={e => editMaint(m.id, "name", e.target.value)} className="bg-transparent text-sm text-slate-700 w-[7.5rem] focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded px-1" />
                  <select aria-label="Tier" value={m.tier} onChange={e => editMaint(m.id, "tier", e.target.value, true)} className="text-xs text-gray-400 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded cursor-pointer">
                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button aria-label="Remove brand" onClick={() => delMaint(m.id)} className="text-gray-300 hover:text-red-500 px-1 text-sm">✕</button>
                </div>
              ))}
              <button onClick={addMaint} className="inline-flex items-center text-sm text-gray-400 hover:text-indigo-600 border border-dashed border-gray-200 hover:border-indigo-200 rounded-full px-3 py-1 transition motion-reduce:transition-none">
                + Add brand
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
