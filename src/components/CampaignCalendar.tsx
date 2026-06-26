"use client";

import React, { useEffect, useRef, useState } from "react";

// Portfolio Campaign Calendar — a Now / Next / Later roadmap with team ownership.
// Persists to Supabase via /api/campaigns and /api/campaigns/maintenance.
// Each campaign carries a structured brief (JSONB). Admins edit; everyone can
// view and export a brief to PDF. Australian English. Owners default to TBC.

type Brief = Record<string, string>;
type Campaign = {
  id: string; horizon: string; campaign: string; brand: string; tier: string;
  owner: string; channel: string; status: string; key_date: string; note: string;
  sort_order: number; brief?: Brief;
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

// Fixed brief field order — the team learns where each guardrail lives once.
const BRIEF_FIELDS: { key: string; label: string }[] = [
  { key: "oneLiner", label: "One-liner" },
  { key: "objective", label: "Objective" },
  { key: "whyNow", label: "Why now" },
  { key: "audience", label: "Audience" },
  { key: "keyMessage", label: "Key message" },
  { key: "offerMechanic", label: "Offer / mechanic" },
  { key: "channels", label: "Channels" },
  { key: "deliverables", label: "Deliverables" },
  { key: "creativeDirection", label: "Creative direction" },
  { key: "do", label: "Do" },
  { key: "dont", label: "Don't" },
  { key: "successMeasure", label: "Success measure" },
  { key: "dependencies", label: "Dependencies" },
  { key: "compliance", label: "Compliance" },
];
const GUARD = new Set(["do", "dont", "compliance"]);
const isFlagged = (v: string) => /^\s*(high|check)/i.test(v || "");

const jsonHeaders = { "Content-Type": "application/json" };

export function CampaignCalendar({ canEdit = false }: { canEdit?: boolean }) {
  const [items, setItems] = useState<Campaign[]>([]);
  const [maint, setMaint] = useState<Maint[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const drawerRef = useRef<HTMLDivElement>(null);

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

  const open = items.find(i => i.id === openId) || null;

  // Drawer: Escape to close + basic focus trap + focus on open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenId(null); return; }
      if (e.key === "Tab" && drawerRef.current) {
        const f = drawerRef.current.querySelectorAll<HTMLElement>('input,textarea,select,button,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    drawerRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── campaign writes ──────────────────────────────────────────────────────
  async function patch(id: string, fields: Partial<Campaign>) {
    try {
      const r = await fetch("/api/campaigns", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ id, ...fields }) });
      if (!(await r.json()).ok) throw new Error();
    } catch {
      setError("That change did not save. Edit the field again to retry.");
    }
  }
  function editField(id: string, field: keyof Campaign, value: string, immediate = false) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, [field]: value } : it)));
    if (id.startsWith("temp-")) return;
    const key = id + String(field);
    clearTimeout(timers.current[key]);
    if (immediate) patch(id, { [field]: value } as Partial<Campaign>);
    else timers.current[key] = setTimeout(() => patch(id, { [field]: value } as Partial<Campaign>), 600);
  }
  function editBrief(item: Campaign, fieldKey: string, value: string) {
    const next = { ...(item.brief ?? {}), [fieldKey]: value };
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: next } : it)));
    if (item.id.startsWith("temp-")) return;
    const key = item.id + "brief" + fieldKey;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => patch(item.id, { brief: next }), 600);
  }
  async function addRow(horizon: string) {
    const order = Math.max(0, ...items.filter(i => i.horizon === horizon).map(i => i.sort_order || 0)) + 1;
    const draft = { horizon, campaign: "", brand: "", tier: "A", owner: "TBC", channel: "", status: "Planned", key_date: "", note: "", sort_order: order, brief: {} };
    const tempId = "temp-" + Date.now();
    setItems(prev => [...prev, { ...draft, id: tempId }]);
    try {
      const j = await (await fetch("/api/campaigns", { method: "POST", headers: jsonHeaders, body: JSON.stringify(draft) })).json();
      if (!j.ok) throw new Error();
      setItems(prev => prev.map(i => (i.id === tempId ? j.item : i)));
      setOpenId(j.item.id);
    } catch {
      setItems(prev => prev.filter(i => i.id !== tempId));
      setError("Could not add the row. Try again.");
    }
  }
  async function delRow(id: string) {
    if (!window.confirm("Delete this campaign?")) return;
    const prev = items;
    setItems(items.filter(i => i.id !== id));
    if (openId === id) setOpenId(null);
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
    const key = "m" + id + String(field);
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
    download("campaigns.csv", "text/csv", [head, ...rows].join("\n"));
  }
  function exportJSON() {
    download("campaigns.json", "application/json", JSON.stringify({ campaigns: items, maintenance: maint }, null, 2));
  }
  function briefText(c: Campaign) {
    const lines = [
      c.campaign || "Untitled campaign",
      `Brand: ${c.brand} · Tier: ${c.tier} · Status: ${c.status} · Key date: ${c.key_date} · Owner: ${c.owner}`,
      "",
      ...BRIEF_FIELDS.map(f => `${f.label}: ${c.brief?.[f.key] ?? ""}`),
    ];
    return lines.join("\n");
  }
  async function copyBrief(c: Campaign) {
    try { await navigator.clipboard.writeText(briefText(c)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Could not copy. Select the text and copy it manually."); }
  }

  const cell = "w-full bg-transparent rounded px-1.5 py-1 text-sm text-slate-700 placeholder:text-gray-300 read-only:cursor-default focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 motion-reduce:transition-none";
  const ro = !canEdit;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Campaigns</h2>
          <p className="text-xs text-gray-400">Cross-brand Now / Next / Later · July to September 2026 · click a card for the full brief{canEdit ? "" : " · view only"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition motion-reduce:transition-none">Export CSV</button>
          <button onClick={exportJSON} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition motion-reduce:transition-none">Export JSON</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 bg-red-50 border border-red-100 text-red-700 rounded-lg px-4 py-2.5 mb-4 text-sm no-print">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-medium">Dismiss</button>
        </div>
      )}
      {needsSetup && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-lg px-4 py-3 mb-4 text-sm no-print">
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
                    {rows.map(c => {
                      const flagged = isFlagged(c.brief?.compliance ?? "");
                      return (
                        <article
                          key={c.id}
                          onClick={() => setOpenId(c.id)}
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === "Enter") setOpenId(c.id); }}
                          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1.5 cursor-pointer hover:border-indigo-200 hover:shadow transition motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                          <div className="flex items-start gap-1">
                            <span className="flex-1 font-semibold text-slate-800 text-sm leading-snug">{c.campaign || <span className="text-gray-300">Untitled campaign</span>}</span>
                            {canEdit && <button aria-label="Delete campaign" onClick={e => { e.stopPropagation(); delRow(c.id); }} className="shrink-0 text-gray-300 hover:text-red-500 rounded px-1 text-sm">✕</button>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TIER_DOT[c.tier] ?? "#ccc" }} aria-hidden />
                            {canEdit
                              ? <select aria-label="Tier" value={c.tier} onClick={e => e.stopPropagation()} onChange={e => editField(c.id, "tier", e.target.value, true)} className="text-gray-500 bg-transparent rounded px-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer">{TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}</select>
                              : <span className="text-gray-500">Tier {c.tier}</span>}
                            <span className="text-slate-600 truncate">{c.brand}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            {canEdit
                              ? <select aria-label="Status" value={c.status} onClick={e => e.stopPropagation()} onChange={e => editField(c.id, "status", e.target.value, true)} className="font-semibold text-white rounded-full px-2.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer" style={{ background: STATUS_COLOR[c.status] ?? "#9A9A9A" }}>{STATUSES.map(s => <option key={s} value={s} className="text-slate-700 bg-white">{s}</option>)}</select>
                              : <span className="font-semibold text-white rounded-full px-2.5 py-0.5" style={{ background: STATUS_COLOR[c.status] ?? "#9A9A9A" }}>{c.status}</span>}
                            <span className="text-gray-400">{c.key_date}</span>
                          </div>
                          <p className="text-[11px] text-gray-400">Owner {c.owner || "TBC"}{c.channel ? ` · ${c.channel}` : ""}</p>
                          {c.note && <p className="text-[11px] text-gray-500 leading-snug">{c.note}</p>}
                          <p className="text-[11px] font-medium text-indigo-500 flex items-center gap-1">{flagged && <span title="Compliance flag" className="text-amber-500">⚠</span>}Open brief →</p>
                        </article>
                      );
                    })}

                    {canEdit && (
                      <button onClick={() => addRow(h.id)} className="w-full text-sm text-gray-400 hover:text-indigo-600 hover:bg-white border border-dashed border-gray-200 hover:border-indigo-200 rounded-xl py-2 transition motion-reduce:transition-none">
                        + Add campaign
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Maintenance brands (no-spend) */}
          <section className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print" aria-label="Maintenance brands">
            <h3 className="text-sm font-bold text-slate-700 mb-1">On maintenance</h3>
            <p className="text-xs text-gray-400 mb-3">Brands ticking over on no-spend</p>
            <div className="flex flex-wrap gap-2">
              {maint.map(m => (
                <div key={m.id} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full pl-2.5 pr-1.5 py-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TIER_DOT[m.tier] ?? "#ccc" }} aria-hidden />
                  <input aria-label="Maintenance brand name" readOnly={ro} value={m.name} onChange={e => editMaint(m.id, "name", e.target.value)} className="bg-transparent text-sm text-slate-700 w-[7.5rem] focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded px-1 read-only:cursor-default" />
                  {canEdit
                    ? <select aria-label="Tier" value={m.tier} onChange={e => editMaint(m.id, "tier", e.target.value, true)} className="text-xs text-gray-400 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded cursor-pointer">{TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    : <span className="text-xs text-gray-400">{m.tier}</span>}
                  {canEdit && <button aria-label="Remove brand" onClick={() => delMaint(m.id)} className="text-gray-300 hover:text-red-500 px-1 text-sm">✕</button>}
                </div>
              ))}
              {canEdit && (
                <button onClick={addMaint} className="inline-flex items-center text-sm text-gray-400 hover:text-indigo-600 border border-dashed border-gray-200 hover:border-indigo-200 rounded-full px-3 py-1 transition motion-reduce:transition-none">
                  + Add brand
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {/* ── Brief drawer ── */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/40 no-print motion-reduce:transition-none" onClick={() => setOpenId(null)} aria-hidden />
          <div
            ref={drawerRef}
            role="dialog" aria-modal="true" aria-label={`${open.campaign || "Campaign"} brief`} tabIndex={-1}
            className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto focus:outline-none"
          >
            <div id="brief-print" className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1">
                  <input
                    aria-label="Campaign name" readOnly={ro} value={open.campaign} placeholder="Campaign name"
                    onChange={e => editField(open.id, "campaign", e.target.value)}
                    className="w-full text-xl font-bold text-slate-900 bg-transparent rounded px-1 -ml-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 read-only:cursor-default placeholder:text-gray-300"
                  />
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-sm">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_DOT[open.tier] ?? "#ccc" }} />Tier {open.tier}</span>
                    <input aria-label="Brand" readOnly={ro} value={open.brand} placeholder="Brand" onChange={e => editField(open.id, "brand", e.target.value)} className={cell + " w-32"} />
                    <span className="font-semibold text-white rounded-full px-2.5 py-0.5 text-xs" style={{ background: STATUS_COLOR[open.status] ?? "#9A9A9A" }}>{open.status}</span>
                    <input aria-label="Key date" readOnly={ro} value={open.key_date} placeholder="Key date" onChange={e => editField(open.id, "key_date", e.target.value)} className={cell + " w-24"} />
                    <span className="text-gray-400">Owner</span>
                    <input aria-label="Owner" readOnly={ro} value={open.owner} placeholder="TBC" onChange={e => editField(open.id, "owner", e.target.value)} className={cell + " w-24"} />
                  </div>
                  <input aria-label="Channel" readOnly={ro} value={open.channel} placeholder="Channels (summary)" onChange={e => editField(open.id, "channel", e.target.value)} className={cell + " mt-1 text-xs text-gray-500"} />
                </div>
                <button aria-label="Close brief" onClick={() => setOpenId(null)} className="no-print shrink-0 text-gray-400 hover:text-gray-700 rounded-lg p-1.5 hover:bg-gray-100">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Brief body */}
              <div className="space-y-3 border-t border-gray-100 pt-4">
                {BRIEF_FIELDS.map(f => {
                  const val = open.brief?.[f.key] ?? "";
                  const guard = GUARD.has(f.key);
                  const flag = f.key === "compliance" && isFlagged(val);
                  return (
                    <div key={f.key} className={guard ? `rounded-lg p-3 ${flag ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-100"}` : ""}>
                      <label className={`block text-[11px] font-semibold uppercase tracking-widest mb-1 ${flag ? "text-amber-700" : "text-gray-400"}`}>{f.label}{flag && " ·  flagged"}</label>
                      <textarea
                        aria-label={f.label} readOnly={ro} value={val} rows={f.key === "offerMechanic" ? 4 : 2}
                        placeholder={`Add the ${f.label.toLowerCase()}`}
                        onChange={e => editBrief(open, f.key, e.target.value)}
                        className="w-full bg-transparent text-sm text-slate-700 leading-relaxed rounded px-1 -ml-1 resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 read-only:cursor-default placeholder:text-gray-300 placeholder:italic"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="no-print flex gap-2 mt-5 pt-4 border-t border-gray-100">
                <button onClick={() => copyBrief(open)} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">{copied ? "Copied" : "Copy brief"}</button>
                <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
