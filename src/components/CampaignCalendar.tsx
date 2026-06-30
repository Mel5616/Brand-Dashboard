"use client";

import React, { useEffect, useRef, useState } from "react";

// Portfolio Campaign Calendar — a Now / Next / Later roadmap with team ownership.
// Persists to Supabase via /api/campaigns and /api/campaigns/maintenance.
// Each campaign carries a structured brief (JSONB). Admins edit; everyone can
// view and export a brief to PDF. Australian English. Owners default to TBC.

type Brief = Record<string, string>;
type Campaign = {
  id: string; horizon: string; campaign: string; brand: string; tier: string;
  owner: string; channel: string; status: string; key_date: string; end_date?: string; note: string;
  sort_order: number; brief?: Brief; share_token?: string; image_url?: string | null;
};
type Maint = { id: string; name: string; tier: string; sort_order: number };

// Now / Next / Later roll with the current month so they never go stale.
const monthName = (add: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + add); return d.toLocaleDateString("en-AU", { month: "long" }); };
const HORIZONS = [
  { id: "now", label: "Now", sub: monthName(0) },
  { id: "next", label: "Next", sub: monthName(1) },
  { id: "later", label: "Later", sub: monthName(2) },
];
const HORIZON_RANGE = `${monthName(0)} to ${monthName(2)} ${new Date().getFullYear()}`;
// Which column a campaign belongs in, derived from its start date: this month → Now,
// next → Next, the month after (or anything later) → Later; past dates clamp to Now.
const horizonForDate = (s: string): string => {
  const d = parseDate(s); if (!d) return "now";
  const now = new Date();
  const diff = (d.getFullYear() * 12 + d.getMonth()) - (now.getFullYear() * 12 + now.getMonth());
  return ["now", "next", "later"][Math.max(0, Math.min(2, diff))];
};
// Position within the 3-month Now/Next/Later window (0–1), for the card duration bar.
const winStart = (() => { const s = new Date(); s.setDate(1); s.setHours(0, 0, 0, 0); return s; })();
const winSpanMs = (() => { const e = new Date(winStart); e.setMonth(e.getMonth() + 3); return e.getTime() - winStart.getTime(); })();
const winFrac = (d: Date) => Math.max(0, Math.min(1, (d.getTime() - winStart.getTime()) / winSpanMs));
const HORIZON_INDEX: Record<string, number> = { now: 0, next: 1, later: 2 };
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Key date: stored as YYYY-MM-DD. These helpers format it and build calendar links.
const parseDate = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}/.test(s || "")) return null; const d = new Date(s.slice(0, 10) + "T00:00:00"); return isNaN(d.getTime()) ? null : d; };
const fmtKeyDate = (s: string) => { const d = parseDate(s); return d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : (s || ""); };
const icsDate = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const escIcs = (s: string) => String(s ?? "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
const calDesc = (c: { brief?: Brief }) => [c.brief?.oneLiner, c.brief?.objective].filter(Boolean).join(" — ");
const gcalUrl = (c: Campaign) => {
  const d = parseDate(c.key_date); if (!d) return "#";
  const end = new Date(parseDate(c.end_date ?? "") ?? d); end.setDate(end.getDate() + 1);
  const p = new URLSearchParams({ action: "TEMPLATE", text: c.campaign || "Campaign", dates: `${icsDate(d)}/${icsDate(end)}`, details: calDesc(c) });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
};
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
// The brief "Channels" field is a fixed checklist (stored as a comma-joined string).
const CHANNEL_OPTIONS = ["Brand Website", "Retail", "Baby Bunting", "Marketplace", "Google", "Meta", "EDM", "Social Media", "Influencers"];
const splitChannels = (v: string) => (v || "").split(",").map(s => s.trim()).filter(Boolean);
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
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
  // Drawer text fields: autosave on a debounce and only sync React state on blur,
  // so a keystroke never re-renders the drawer (which was dropping focus → one
  // letter at a time). Inputs are uncontrolled (defaultValue), so the DOM keeps
  // whatever is typed regardless of re-renders.
  const briefDraft = useRef<Record<string, Record<string, string>>>({});
  function saveText(id: string, field: keyof Campaign, value: string) {
    if (id.startsWith("temp-")) return;
    const key = id + String(field);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => patch(id, { [field]: value } as Partial<Campaign>), 500);
  }
  function commitText(id: string, field: keyof Campaign, value: string) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, [field]: value } : it)));
  }
  // Changing the start date auto-moves the card to the matching month column.
  function changeStart(item: Campaign, value: string) {
    const horizon = value ? horizonForDate(value) : item.horizon;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, key_date: value, horizon } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { key_date: value, horizon });
  }
  function changeEnd(item: Campaign, value: string) {
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, end_date: value } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { end_date: value } as Partial<Campaign>);
  }
  // Drag a card into another column: set the horizon and shift its dates to that
  // month (keeping the day and any duration) so the date and column stay in sync.
  function moveTo(id: string, horizon: string) {
    const item = items.find(i => i.id === id);
    if (!item || item.horizon === horizon) return;
    let { key_date, end_date } = item;
    const d = parseDate(item.key_date);
    if (d) {
      const tgt = new Date(); tgt.setDate(1); tgt.setMonth(tgt.getMonth() + (HORIZON_INDEX[horizon] ?? 0));
      const delta = (tgt.getFullYear() * 12 + tgt.getMonth()) - (d.getFullYear() * 12 + d.getMonth());
      const shift = (s?: string) => { const x = parseDate(s ?? ""); if (!x) return s; x.setMonth(x.getMonth() + delta); return isoDate(x); };
      key_date = shift(item.key_date) ?? key_date;
      end_date = shift(item.end_date);
    }
    setItems(prev => prev.map(it => (it.id === id ? { ...it, horizon, key_date, end_date } : it)));
    if (id.startsWith("temp-")) return;
    patch(id, { horizon, key_date, end_date } as Partial<Campaign>);
  }
  function saveBrief(item: Campaign, fieldKey: string, value: string) {
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}), [fieldKey]: value };
    briefDraft.current[item.id] = cur;
    if (item.id.startsWith("temp-")) return;
    const key = item.id + "brief" + fieldKey;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => patch(item.id, { brief: { ...cur } } as Partial<Campaign>), 500);
  }
  function commitBrief(item: Campaign, fieldKey: string, value: string) {
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}), [fieldKey]: value };
    briefDraft.current[item.id] = cur;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: { ...cur } } : it)));
  }
  // Channels checklist toggles save immediately (no debounce — checkboxes don't lose focus).
  function toggleChannel(item: Campaign, opt: string) {
    const set = new Set(splitChannels((briefDraft.current[item.id] ?? (item.brief as any) ?? {}).channels ?? ""));
    set.has(opt) ? set.delete(opt) : set.add(opt);
    const value = CHANNEL_OPTIONS.filter(o => set.has(o)).join(", ");
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}), channels: value };
    briefDraft.current[item.id] = cur;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: { ...cur } } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { brief: { ...cur } } as Partial<Campaign>);
  }
  async function addRow(horizon: string) {
    const order = Math.max(0, ...items.filter(i => i.horizon === horizon).map(i => i.sort_order || 0)) + 1;
    const draft = { horizon, campaign: "", brand: "", tier: "A", owner: "TBC", channel: "", status: "Planned", key_date: "", end_date: "", note: "", sort_order: order, brief: {} };
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
  function addToCalendar(c: Campaign) {
    const d = parseDate(c.key_date); if (!d) return;
    // All-day DTEND is exclusive, so add a day to the end date (or the start if none).
    const endIn = parseDate(c.end_date ?? "") ?? d;
    const end = new Date(endIn); end.setDate(end.getDate() + 1);
    const desc = calDesc(c);
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Coolkidz//Campaigns//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      `UID:campaign-${c.id}@coolkidz`, `DTSTAMP:${icsDate(new Date())}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDate(d)}`, `DTEND;VALUE=DATE:${icsDate(end)}`,
      `SUMMARY:${escIcs((c.campaign || "Campaign") + (c.brand ? " — " + c.brand : ""))}`,
      desc ? `DESCRIPTION:${escIcs(desc)}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
    download(`${(c.campaign || "campaign").replace(/[^\w]+/g, "_").slice(0, 40)}.ics`, "text/calendar", ics);
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

  async function uploadCampaignImage(item: Campaign, file: File | undefined) {
    if (!file) return;
    setImgBusy(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const j = await fetch(`/api/campaigns/${item.id}/image`, { method: "POST", body: fd }).then(r => r.json());
      if (j.error) setError(j.error);
      else setItems(prev => prev.map(it => it.id === item.id ? { ...it, ...(j.item || { image_url: j.url }) } as Campaign : it));
    } catch { setError("Image upload failed."); }
    setImgBusy(false);
    if (imgRef.current) imgRef.current.value = "";
  }

  function copyShareLink(item: Campaign) {
    if (!item.share_token) { setError("Save the campaign first, then copy its share link."); return; }
    const url = `${window.location.origin}/c/${item.share_token}`;
    const done = () => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); };
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(url).then(done).catch(() => setError(`Couldn't copy — link: ${url}`)); return; }
    try { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(); }
    catch { setError(`Couldn't copy — link: ${url}`); }
  }

  const cell = "w-full bg-transparent rounded px-1.5 py-1 text-sm text-slate-700 placeholder:text-gray-300 read-only:cursor-default focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 motion-reduce:transition-none";
  const ro = !canEdit;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Campaigns</h2>
          <p className="text-xs text-gray-400">Cross-brand Now / Next / Later · {HORIZON_RANGE} · click a card for the full brief{canEdit ? "" : " · view only"}</p>
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
          <span className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin motion-reduce:animate-none" />
          Loading the calendar
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {HORIZONS.map(h => {
              const rows = items.filter(i => i.horizon === h.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
              return (
                <section
                  key={h.id}
                  aria-label={`${h.label} (${h.sub})`}
                  onDragOver={canEdit ? (e => { e.preventDefault(); if (dragId) setDragOver(h.id); }) : undefined}
                  onDragLeave={canEdit ? (e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }) : undefined}
                  onDrop={canEdit ? (e => { e.preventDefault(); if (dragId) moveTo(dragId, h.id); setDragId(null); setDragOver(null); }) : undefined}
                  className={`rounded-2xl border p-3 transition-colors ${dragOver === h.id ? "bg-emerald-50/70 border-emerald-300 border-dashed" : "bg-gray-50/60 border-gray-100"}`}
                >
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
                          draggable={canEdit}
                          onDragStart={canEdit ? (e => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }) : undefined}
                          onDragEnd={canEdit ? (() => { setDragId(null); setDragOver(null); }) : undefined}
                          className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1.5 cursor-pointer hover:border-emerald-200 hover:shadow transition motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-emerald-400 ${canEdit ? "active:cursor-grabbing" : ""} ${dragId === c.id ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-start gap-1">
                            <span className="flex-1 font-semibold text-slate-800 text-sm leading-snug">{c.campaign || <span className="text-gray-300">Untitled campaign</span>}</span>
                            {canEdit && <button aria-label="Delete campaign" onClick={e => { e.stopPropagation(); delRow(c.id); }} className="shrink-0 text-gray-300 hover:text-red-500 rounded px-1 text-sm">✕</button>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TIER_DOT[c.tier] ?? "#ccc" }} aria-hidden />
                            {canEdit
                              ? <select aria-label="Tier" value={c.tier} onClick={e => e.stopPropagation()} onChange={e => editField(c.id, "tier", e.target.value, true)} className="text-gray-500 bg-transparent rounded px-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer">{TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}</select>
                              : <span className="text-gray-500">Tier {c.tier}</span>}
                            <span className="text-slate-600 truncate">{c.brand}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            {canEdit
                              ? <select aria-label="Status" value={c.status} onClick={e => e.stopPropagation()} onChange={e => editField(c.id, "status", e.target.value, true)} className="font-semibold text-white rounded-full px-2.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer" style={{ background: STATUS_COLOR[c.status] ?? "#9A9A9A" }}>{STATUSES.map(s => <option key={s} value={s} className="text-slate-700 bg-white">{s}</option>)}</select>
                              : <span className="font-semibold text-white rounded-full px-2.5 py-0.5" style={{ background: STATUS_COLOR[c.status] ?? "#9A9A9A" }}>{c.status}</span>}
                            {parseDate(c.key_date)
                              ? <span className="inline-flex items-center gap-1 text-emerald-500 font-medium"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>{fmtKeyDate(c.key_date)}{parseDate(c.end_date ?? "") ? ` – ${fmtKeyDate(c.end_date!)}` : ""}</span>
                              : <span className="text-gray-400">{c.key_date}</span>}
                          </div>
                          {(() => {
                            const sd = parseDate(c.key_date), ed = parseDate(c.end_date ?? "");
                            if (!sd || !ed) return null;
                            return (
                              <div className="relative h-1.5 rounded-full bg-gray-100 mt-1.5" title={`${fmtKeyDate(c.key_date)} – ${fmtKeyDate(c.end_date!)}`}>
                                <div className="absolute inset-y-0 left-1/3 w-px bg-white" />
                                <div className="absolute inset-y-0 left-2/3 w-px bg-white" />
                                <div className="absolute inset-y-0 rounded-full" style={{ left: `${winFrac(sd) * 100}%`, right: `${(1 - winFrac(ed)) * 100}%`, background: STATUS_COLOR[c.status] ?? "#9A9A9A" }} />
                              </div>
                            );
                          })()}
                          <p className="text-[11px] text-gray-400">Owner {c.owner || "TBC"}{c.channel ? ` · ${c.channel}` : ""}</p>
                          {c.note && <p className="text-[11px] text-gray-500 leading-snug">{c.note}</p>}
                          <p className="text-[11px] font-medium text-emerald-500 flex items-center gap-1">{flagged && <span title="Compliance flag" className="text-amber-500">⚠</span>}Open brief →</p>
                        </article>
                      );
                    })}

                    {canEdit && (
                      <button onClick={() => addRow(h.id)} className="w-full text-sm text-gray-400 hover:text-emerald-600 hover:bg-white border border-dashed border-gray-200 hover:border-emerald-200 rounded-xl py-2 transition motion-reduce:transition-none">
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
                  <input key={m.id + "name"} aria-label="Maintenance brand name" readOnly={ro} defaultValue={m.name} onChange={e => editMaint(m.id, "name", e.target.value)} className="bg-transparent text-sm text-slate-700 w-[7.5rem] focus:outline-none focus:ring-2 focus:ring-emerald-400 rounded px-1 read-only:cursor-default" />
                  {canEdit
                    ? <select aria-label="Tier" value={m.tier} onChange={e => editMaint(m.id, "tier", e.target.value, true)} className="text-xs text-gray-400 bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400 rounded cursor-pointer">{TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    : <span className="text-xs text-gray-400">{m.tier}</span>}
                  {canEdit && <button aria-label="Remove brand" onClick={() => delMaint(m.id)} className="text-gray-300 hover:text-red-500 px-1 text-sm">✕</button>}
                </div>
              ))}
              {canEdit && (
                <button onClick={addMaint} className="inline-flex items-center text-sm text-gray-400 hover:text-emerald-600 border border-dashed border-gray-200 hover:border-emerald-200 rounded-full px-3 py-1 transition motion-reduce:transition-none">
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
                    key={open.id + "name"}
                    aria-label="Campaign name" readOnly={ro} defaultValue={open.campaign} placeholder="Campaign name"
                    onChange={e => saveText(open.id, "campaign", e.target.value)} onBlur={e => commitText(open.id, "campaign", e.target.value)}
                    className="w-full text-xl font-bold text-slate-900 bg-transparent rounded px-1 -ml-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 read-only:cursor-default placeholder:text-gray-300"
                  />
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-sm">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_DOT[open.tier] ?? "#ccc" }} />Tier {open.tier}</span>
                    <input key={open.id + "brand"} aria-label="Brand" readOnly={ro} defaultValue={open.brand} placeholder="Brand" onChange={e => saveText(open.id, "brand", e.target.value)} onBlur={e => commitText(open.id, "brand", e.target.value)} className={cell + " w-32"} />
                    <span className="font-semibold text-white rounded-full px-2.5 py-0.5 text-xs" style={{ background: STATUS_COLOR[open.status] ?? "#9A9A9A" }}>{open.status}</span>
                    <span className="text-gray-400">Start</span>
                    <input type="date" aria-label="Start date" readOnly={ro} value={parseDate(open.key_date) ? open.key_date.slice(0, 10) : ""} onChange={e => changeStart(open, e.target.value)} className={cell + " w-36"} />
                    <span className="text-gray-400">End</span>
                    <input type="date" aria-label="End date" readOnly={ro} min={parseDate(open.key_date) ? open.key_date.slice(0, 10) : undefined} value={parseDate(open.end_date ?? "") ? (open.end_date ?? "").slice(0, 10) : ""} onChange={e => changeEnd(open, e.target.value)} className={cell + " w-36"} />
                    <span className="text-gray-400">Owner</span>
                    <input key={open.id + "owner"} aria-label="Owner" readOnly={ro} defaultValue={open.owner} placeholder="TBC" onChange={e => saveText(open.id, "owner", e.target.value)} onBlur={e => commitText(open.id, "owner", e.target.value)} className={cell + " w-24"} />
                  </div>
                  <input key={open.id + "channel"} aria-label="Channel" readOnly={ro} defaultValue={open.channel} placeholder="Channels (summary)" onChange={e => saveText(open.id, "channel", e.target.value)} onBlur={e => commitText(open.id, "channel", e.target.value)} className={cell + " mt-1 text-xs text-gray-500"} />
                </div>
                <button aria-label="Close brief" onClick={() => setOpenId(null)} className="no-print shrink-0 text-gray-400 hover:text-gray-700 rounded-lg p-1.5 hover:bg-gray-100">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Card note — the short line shown on the board card */}
              <div className="mb-1">
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1 text-gray-400">Card note <span className="font-normal lowercase tracking-normal text-gray-300">· shows on the board card</span></label>
                <textarea
                  key={open.id + "note"}
                  aria-label="Card note" readOnly={ro} defaultValue={open.note} rows={2}
                  placeholder="Short summary shown on the card"
                  onChange={e => saveText(open.id, "note", e.target.value)} onBlur={e => commitText(open.id, "note", e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 leading-relaxed rounded px-1 -ml-1 resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 read-only:cursor-default placeholder:text-gray-300 placeholder:italic"
                />
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
                      {f.key === "channels" ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {CHANNEL_OPTIONS.map(opt => {
                            const on = splitChannels(val).includes(opt);
                            return (
                              <label key={opt} className={`inline-flex items-center gap-1.5 text-[13px] rounded-full border px-2.5 py-1 cursor-pointer transition ${ro ? "cursor-default" : ""} ${on ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                                <input type="checkbox" disabled={ro} checked={on} onChange={() => toggleChannel(open, opt)} className="accent-emerald-500 w-3.5 h-3.5" />
                                {opt}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          key={open.id + f.key}
                          aria-label={f.label} readOnly={ro} defaultValue={val} rows={f.key === "offerMechanic" ? 4 : 2}
                          placeholder={`Add the ${f.label.toLowerCase()}`}
                          onChange={e => saveBrief(open, f.key, e.target.value)} onBlur={e => commitBrief(open, f.key, e.target.value)}
                          className="w-full bg-transparent text-sm text-slate-700 leading-relaxed rounded px-1 -ml-1 resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 read-only:cursor-default placeholder:text-gray-300 placeholder:italic"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="no-print flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
                {parseDate(open.key_date) && (
                  <>
                    <button onClick={() => addToCalendar(open)} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Add to calendar
                    </button>
                    <a href={gcalUrl(open)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">Google Calendar ↗</a>
                  </>
                )}
                <button onClick={() => copyBrief(open)} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">{copied ? "Copied" : "Copy brief"}</button>
                {canEdit && <>
                  <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => uploadCampaignImage(open, e.target.files?.[0])} />
                  <button onClick={() => imgRef.current?.click()} disabled={imgBusy} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">{imgBusy ? "Uploading…" : open.image_url ? "Replace image" : "Add image"}</button>
                </>}
                <button onClick={() => copyShareLink(open)} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">{linkCopied ? "Link copied" : "Copy share link"}</button>
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
