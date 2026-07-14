"use client";

import { useState, useEffect, useRef } from "react";
import { fmtFull } from "@/lib/format";
import { AustraliaMap } from "./AustraliaMap";
import { LiveShowPanel } from "./LiveShowPanel";
import type { Tradeshow, TradeshowSale, Brand } from "@/lib/db";

function showStatus(ts: Tradeshow): "live" | "upcoming" | "past" {
  const now = new Date();
  const start = new Date(ts.date_start + "T00:00:00");
  const end = new Date(ts.date_end + "T23:59:59");
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "past";
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const EXPENSE_CATEGORIES = ["Printing", "Staff", "Floor Space", "Travel", "Accommodation", "Stand", "Setup/Packdown", "Advertising"];

// Every calendar day a show runs (date_start … date_end), for per-day door
// attendance. Capped so a bad date range can't produce a huge list.
function showDays(ts: Tradeshow): string[] {
  const days: string[] = [];
  if (!ts.date_start || !ts.date_end) return days;
  // Parse and step in UTC so toISOString() doesn't roll the date back a day in
  // timezones ahead of UTC (e.g. Australia).
  const d = new Date(ts.date_start + "T00:00:00Z"), end = new Date(ts.date_end + "T00:00:00Z");
  for (let i = 0; d <= end && i < 14; i++, d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}

// Compact currency for chart/map labels
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

// Australia tile-grid cartogram: each state placed in its rough relative
// position (1-indexed CSS grid col/row). Names match the Shopify province strings.
const AU_TILES = [
  { code: "NT",  name: "Northern Territory",            col: 2, row: 1 },
  { code: "QLD", name: "Queensland",                    col: 3, row: 1 },
  { code: "WA",  name: "Western Australia",             col: 1, row: 2 },
  { code: "SA",  name: "South Australia",               col: 2, row: 2 },
  { code: "NSW", name: "New South Wales",               col: 3, row: 2 },
  { code: "ACT", name: "Australian Capital Territory",  col: 4, row: 2 },
  { code: "VIC", name: "Victoria",                      col: 3, row: 3 },
  { code: "TAS", name: "Tasmania",                      col: 3, row: 4 },
];

function stateLabel(fullName: string) {
  return AU_TILES.find(t => t.name === fullName)?.code ?? fullName;
}

export function TradeshowAccordion({
  tradeshows, tradeshowBrands, tradeshowSales, brands, monthKeys, admin = false,
}: {
  tradeshows: Tradeshow[];
  tradeshowBrands: { tradeshow_id: string; brand_id: number }[];
  tradeshowSales: TradeshowSale[];
  brands: Brand[];
  monthKeys?: string[]; // restrict to shows whose start month is in the selected FY
  admin?: boolean;
}) {
  // Door attendance per show-day, keyed `${tradeshow_id}|${day}`. `attendance` is
  // the live (typed) value; `savedRef` tracks what's actually persisted so the
  // change-guard and failure-revert compare against the server, not the keystroke.
  const [attendance, setAttendance] = useState<Record<string, number>>({});
  const savedRef = useRef<Record<string, number>>({});
  const [attNeedsSetup, setAttNeedsSetup] = useState(false);
  useEffect(() => {
    fetch("/api/tradeshows/attendance").then(r => r.json()).then(d => {
      if (d.needsSetup) setAttNeedsSetup(true);
      else if (d.ok) { const m: Record<string, number> = {}; for (const r of d.rows) m[`${r.tradeshow_id}|${r.day}`] = Number(r.attendance) || 0; setAttendance(m); savedRef.current = { ...m }; }
    }).catch(() => {});
  }, []);
  const [attMsg, setAttMsg] = useState<{ text: string; ok: boolean } | null>(null);
  async function saveAttendance(tradeshow_id: string, day: string, value: number) {
    const key = `${tradeshow_id}|${day}`;
    const v = Math.max(0, Math.round(value) || 0);
    if ((savedRef.current[key] ?? 0) === v) return;   // unchanged vs what's persisted
    setAttendance(p => ({ ...p, [key]: v }));
    try {
      const res = await fetch("/api/tradeshows/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeshow_id, day, attendance: v }) });
      if (res.ok) { savedRef.current[key] = v; setAttMsg({ text: "Saved", ok: true }); setTimeout(() => setAttMsg(m => m?.ok ? null : m), 2000); }
      else {
        setAttendance(p => ({ ...p, [key]: savedRef.current[key] ?? 0 }));   // revert to last saved
        setAttMsg({ text: res.status === 401 ? "Session expired — refresh the page, sign in, then re-enter." : "Couldn’t save, try again.", ok: false });
      }
    } catch {
      setAttendance(p => ({ ...p, [key]: savedRef.current[key] ?? 0 }));
      setAttMsg({ text: "Couldn’t save — check your connection.", ok: false });
    }
  }

  // Line-item show expenses: each entry is allocated to a category with a label
  // (who/what), amount and optional note — e.g. Staff · Melanie · $300 · 4 hours.
  type ExpItem = { id: string; tradeshow_id: string; category: string; label: string; amount: number; note: string };
  const [expItems, setExpItems] = useState<ExpItem[]>([]);
  const [expNeedsSetup, setExpNeedsSetup] = useState(false);
  const [expMsg, setExpMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [expForm, setExpForm] = useState({ category: EXPENSE_CATEGORIES[0], label: "", amount: "", note: "" });
  const [expBusy, setExpBusy] = useState(false);
  // Which shows have their expense line-item list expanded (collapsed by default —
  // the category bars + total carry the summary).
  const [expListOpen, setExpListOpen] = useState<Set<string>>(new Set());
  const toggleExpList = (id: string) => setExpListOpen(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => {
    fetch("/api/tradeshows/expenses").then(r => r.json()).then(d => {
      if (d.needsSetup) setExpNeedsSetup(true);
      else if (d.ok) setExpItems((d.rows ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) || 0 })));
    }).catch(() => {});
  }, []);
  async function addExpense(tradeshow_id: string) {
    if (!expForm.amount || Number(expForm.amount) <= 0) { setExpMsg({ text: "Enter an amount.", ok: false }); return; }
    setExpBusy(true);
    try {
      const res = await fetch("/api/tradeshows/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeshow_id, ...expForm, amount: Number(expForm.amount) }) });
      const d = await res.json().catch(() => ({ ok: false }));
      if (res.ok && d.ok) { setExpItems(p => [...p, { ...d.item, amount: Number(d.item.amount) || 0 }]); setExpForm(f => ({ category: f.category, label: "", amount: "", note: "" })); setExpMsg({ text: "Added", ok: true }); setTimeout(() => setExpMsg(m => m?.ok ? null : m), 2000); }
      else setExpMsg({ text: res.status === 401 ? "Session expired — refresh, sign in, re-enter." : (d.error || "Couldn’t save, try again."), ok: false });
    } catch { setExpMsg({ text: "Couldn’t save — check your connection.", ok: false }); }
    finally { setExpBusy(false); }
  }
  async function delExpense(id: string) {
    const d = await fetch(`/api/tradeshows/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(r => r.json()).catch(() => ({ ok: false }));
    if (d.ok) setExpItems(p => p.filter(x => x.id !== id));
  }

  // Post-show report (HTML/PDF) attached per show, keyed by tradeshow_id.
  type Report = { tradeshow_id: string; title: string; html_url: string; file_name: string; uploaded_at: string };
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [uploadingReport, setUploadingReport] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/tradeshows/report").then(r => r.json()).then(d => {
      if (d.ok && d.rows) { const m: Record<string, Report> = {}; for (const r of d.rows) m[r.tradeshow_id] = r; setReports(m); }
    }).catch(() => {});
  }, []);
  async function uploadReport(tradeshow_id: string, file: File, title: string) {
    setUploadingReport(tradeshow_id);
    try {
      const fd = new FormData(); fd.set("tradeshow_id", tradeshow_id); fd.set("file", file); fd.set("title", title);
      const d = await fetch("/api/tradeshows/report", { method: "POST", body: fd }).then(r => r.json());
      if (d.ok) setReports(p => ({ ...p, [tradeshow_id]: d.item }));
      else if (typeof window !== "undefined") window.alert(d.error || "Upload failed");
    } finally { setUploadingReport(null); }
  }
  async function removeReport(tradeshow_id: string) {
    if (typeof window !== "undefined" && !window.confirm("Remove this post-show report?")) return;
    const d = await fetch(`/api/tradeshows/report?tradeshow_id=${encodeURIComponent(tradeshow_id)}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) setReports(p => { const n = { ...p }; delete n[tradeshow_id]; return n; });
  }
  // Keep only shows that fall within the selected financial year
  const fyShows = monthKeys ? tradeshows.filter(t => monthKeys.includes(t.date_start.slice(0, 7))) : tradeshows;
  const sorted = [...fyShows].sort((a, b) => a.date_start.localeCompare(b.date_start));

  const upcoming = sorted.filter(t => showStatus(t) !== "past");          // live + upcoming, soonest first
  const past     = sorted.filter(t => showStatus(t) === "past").reverse(); // most recent first

  // Auto-expand live + next upcoming
  const liveIds = new Set(upcoming.filter(t => showStatus(t) === "live").map(t => t.id));
  if (upcoming.find(t => showStatus(t) === "upcoming")) {
    liveIds.add(upcoming.find(t => showStatus(t) === "upcoming")!.id);
  }
  const [open, setOpen] = useState<Set<string>>(liveIds);

  const liveShows    = sorted.filter(t => showStatus(t) === "live");
  const nextUpcoming = upcoming.find(t => showStatus(t) === "upcoming");
  const [view, setView] = useState<"live" | "all">(liveShows.length > 0 ? "live" : "all");

  function toggle(id: string) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Summary (scoped to the selected FY's shows) ───────────────────────
  const fyShowIds = new Set(fyShows.map(t => t.id));
  const fySales   = tradeshowSales.filter(s => fyShowIds.has(s.tradeshow_id));
  const totalRevAll = fySales.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const liveCount   = sorted.filter(t => showStatus(t) === "live").length;

  // Revenue per show, then aggregate by state and by brand
  const revByShow = new Map<string, number>();
  fySales.forEach(s => revByShow.set(s.tradeshow_id, (revByShow.get(s.tradeshow_id) ?? 0) + (s.revenue ?? 0)));

  const stateTotals: Record<string, number> = {};
  fyShows.forEach(ts => { stateTotals[ts.state] = (stateTotals[ts.state] ?? 0) + (revByShow.get(ts.id) ?? 0); });
  const maxState = Math.max(1, ...Object.values(stateTotals));

  const brandTotalsMap: Record<number, number> = {};
  fySales.forEach(s => { brandTotalsMap[s.brand_id] = (brandTotalsMap[s.brand_id] ?? 0) + (s.revenue ?? 0); });
  const brandRows = Object.entries(brandTotalsMap)
    .map(([bid, rev]) => ({ brand: brands.find(b => b.id === Number(bid)), rev }))
    .filter(r => r.brand && r.rev > 0)
    .sort((a, b) => b.rev - a.rev) as { brand: Brand; rev: number }[];
  const maxBrand = Math.max(1, ...brandRows.map(r => r.rev));

  const topStateEntry = Object.entries(stateTotals).sort((a, b) => b[1] - a[1])[0];
  const hasVisuals = totalRevAll > 0;

  // Best-performing show this FY (by synced revenue), for the season rollup KPI.
  const topShowEntry = [...revByShow.entries()].sort((a, b) => b[1] - a[1])[0];
  const topShow = topShowEntry ? fyShows.find(t => t.id === topShowEntry[0]) : undefined;

  function dateRange(ts: Tradeshow) {
    const s = new Date(ts.date_start + "T00:00:00");
    const e = new Date(ts.date_end + "T00:00:00");
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    if (ts.date_start === ts.date_end) return `${s.toLocaleDateString("en-AU", opts)} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth())
      return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()].charAt(0) + MONTHS[s.getMonth()].slice(1).toLowerCase()} ${s.getFullYear()}`;
    return `${s.toLocaleDateString("en-AU", opts)} – ${e.toLocaleDateString("en-AU", opts)} ${e.getFullYear()}`;
  }

  function ShowCard({ ts }: { ts: Tradeshow }) {
    const status = showStatus(ts);
    const isOpen = open.has(ts.id);
    const start  = new Date(ts.date_start + "T00:00:00");

    const participating = tradeshowBrands
      .filter(tb => tb.tradeshow_id === ts.id)
      .map(tb => brands.find(b => b.id === tb.brand_id))
      .filter(Boolean) as Brand[];

    const sales       = tradeshowSales.filter(s => s.tradeshow_id === ts.id);
    const totalRev    = sales.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totalOrders = sales.reduce((s, r) => s + (r.orders ?? 0), 0);

    const accent = status === "live" ? "#10b981" : status === "upcoming" ? "#6366f1" : "#94a3b8";

    return (
      <div className={`rounded-xl border overflow-hidden transition-shadow ${isOpen ? "border-gray-200 shadow-sm" : "border-gray-100"} ${status === "past" ? "opacity-80" : ""}`}>
        <button onClick={() => toggle(ts.id)} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50/70 transition-colors">
          {/* Calendar chip */}
          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 border" style={{ borderColor: `${accent}33`, background: `${accent}0d` }}>
            <span className="text-[9px] font-bold tracking-wider" style={{ color: accent }}>{MONTHS[start.getMonth()]}</span>
            <span className="text-lg font-bold leading-none text-slate-700">{start.getDate()}</span>
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-800 truncate">{ts.name}</span>
              {status === "live" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">● LIVE</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{dateRange(ts)}{ts.location ? ` · ${ts.location}` : ""}</p>
            {participating.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                {participating.slice(0, 8).map(b => (
                  <span key={b.id} className="w-2 h-2 rounded-full" style={{ background: b.color }} title={b.name} />
                ))}
                {participating.length > 8 && <span className="text-[10px] text-gray-400 ml-0.5">+{participating.length - 8}</span>}
              </div>
            )}
          </div>

          {/* Revenue */}
          <div className="text-right flex-shrink-0">
            {totalRev > 0 ? (
              <>
                <p className="text-sm font-bold text-slate-800">{fmtFull(totalRev)}</p>
                <p className="text-[11px] text-gray-400">{totalOrders} orders</p>
              </>
            ) : (
              <p className="text-[11px] text-gray-300">{status === "upcoming" ? "Not started" : "No sales"}</p>
            )}
          </div>

          <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60 space-y-3">
            {status === "live" && <LiveShowPanel showId={ts.id} brands={brands} live />}
            {status === "past" && <LiveShowPanel showId={ts.id} brands={brands} live={false} />}
            {status === "live" && (
              <p className="text-[10px] text-gray-400 px-0.5">Live figures query Shopify in real time. The table below is the last synced snapshot.</p>
            )}

            {/* Door attendance — visitors per day, entered after each expo */}
            {status !== "upcoming" && (() => {
              const days = showDays(ts);
              const total = days.reduce((s, d) => s + (attendance[`${ts.id}|${d}`] || 0), 0);
              if (!admin && total === 0) return null;   // nothing to show non-admins yet
              return (
                <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white px-4 py-3.5 shadow-sm">
                  <div className="flex items-end justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="grid place-items-center w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 00-3-3.87" /></svg>
                      </span>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Door attendance</p>
                      {attMsg && <span className={`text-[10px] font-medium ${attMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{attMsg.ok ? "✓ " : ""}{attMsg.text}</span>}
                    </div>
                    <p className="text-right leading-none"><span className="text-2xl font-extrabold text-slate-800 tabular-nums">{total.toLocaleString()}</span><span className="text-[11px] text-gray-400 ml-1">total visitors</span></p>
                  </div>
                  {attNeedsSetup ? (
                    <p className="text-[11px] text-gray-400">Run <code className="bg-gray-100 px-1 rounded">add_tradeshow_attendance.sql</code> to enable attendance.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      {days.map(day => {
                        const key = `${ts.id}|${day}`;
                        const label = new Date(day + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
                        return admin ? (
                          <label key={key} className="flex flex-col gap-1 bg-white rounded-lg border border-emerald-100 px-2.5 py-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
                            <input type="number" min={0} value={attendance[key] ?? ""} placeholder="0"
                              onChange={e => setAttendance(p => ({ ...p, [key]: e.target.value === "" ? 0 : Math.max(0, Math.round(Number(e.target.value)) || 0) }))}
                              onBlur={e => saveAttendance(ts.id, day, Number(e.target.value) || 0)}
                              className="w-28 text-lg font-bold text-slate-800 tabular-nums border-0 border-b-2 border-emerald-100 focus:border-emerald-400 px-0 py-0.5 focus:outline-none bg-transparent" />
                          </label>
                        ) : (
                          <div key={key} className="flex flex-col gap-1 bg-white rounded-lg border border-emerald-100 px-3 py-2 min-w-[7rem]">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
                            <span className="text-lg font-bold text-slate-800 tabular-nums">{(attendance[key] || 0).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Post-show report — the one-page HTML report attached after the expo */}
            {status !== "upcoming" && (() => {
              const rep = reports[ts.id];
              if (!rep && !admin) return null;
              return (
                <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Post-show report</p>
                    {rep
                      ? <a href={`/api/tradeshows/report/view?tradeshow_id=${encodeURIComponent(ts.id)}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline break-all">{rep.title || rep.file_name || "View report"} ↗</a>
                      : <p className="text-[12px] text-gray-400">No report attached yet.</p>}
                  </div>
                  {admin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 cursor-pointer whitespace-nowrap">
                        {uploadingReport === ts.id ? "Uploading…" : rep ? "Replace" : "Upload report"}
                        <input type="file" accept=".html,.htm,text/html,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadReport(ts.id, f, ts.name); e.currentTarget.value = ""; }} />
                      </label>
                      {rep && <button onClick={() => removeReport(ts.id)} className="text-xs text-gray-400 hover:text-rose-500">Remove</button>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Show expenses: line items allocated to categories, with a visual breakdown */}
            {(() => {
              const items = expItems.filter(x => x.tradeshow_id === ts.id);
              const totalExp = items.reduce((s, x) => s + x.amount, 0);
              if (!admin && totalExp === 0) return null;
              const net = totalRev - totalExp;
              const byCat = EXPENSE_CATEGORIES.map(c => ({ cat: c, sum: items.filter(x => x.category === c).reduce((s, x) => s + x.amount, 0) })).filter(c => c.sum > 0);
              const maxCat = Math.max(1, ...byCat.map(c => c.sum));
              return (
                <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Show expenses <span className="font-normal normal-case tracking-normal text-gray-400">· ex GST</span></p>
                      {expMsg && <span className={`text-[10px] font-medium ${expMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{expMsg.ok ? "✓ " : ""}{expMsg.text}</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-slate-800">{fmtFull(totalExp)}</span>
                      <span className="text-[11px] text-gray-400 ml-1">total cost</span>
                      {totalRev > 0 && totalExp > 0 && <span className={`ml-2 text-[12px] font-semibold ${net >= 0 ? "text-emerald-600" : "text-rose-500"}`}>Profit {net < 0 ? "-" : ""}{fmtFull(Math.abs(net))}</span>}
                    </div>
                  </div>

                  {expNeedsSetup ? (
                    <p className="text-[11px] text-gray-400">Run <code className="bg-gray-100 px-1 rounded">add_tradeshow_expense_items.sql</code> to enable expenses.</p>
                  ) : (
                    <>
                      {/* Category breakdown bars */}
                      {byCat.length > 0 && (
                        <div className="space-y-1">
                          {byCat.sort((a, b) => b.sum - a.sum).map(c => (
                            <div key={c.cat} className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500 w-28 shrink-0">{c.cat}</span>
                              <div className="flex-1 h-3.5 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-300/80 rounded" style={{ width: `${Math.max(3, Math.round((c.sum / maxCat) * 100))}%` }} /></div>
                              <span className="text-[12px] font-semibold text-slate-700 tabular-nums w-16 text-right shrink-0">{fmtFull(c.sum)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Line items — collapsed behind a toggle so the block stays compact */}
                      {items.length > 0 && (
                        <div className="border-t border-gray-100 pt-1.5">
                          <button onClick={() => toggleExpList(ts.id)} className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-700">
                            <svg className={`w-3.5 h-3.5 transition-transform ${expListOpen.has(ts.id) ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            {expListOpen.has(ts.id) ? "Hide" : "Show"} {items.length} entr{items.length === 1 ? "y" : "ies"}
                          </button>
                          {expListOpen.has(ts.id) && (
                            <div className="divide-y divide-gray-50 mt-1">
                              {items.map(x => (
                                <div key={x.id} className="flex items-center gap-2 py-1.5 group">
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">{x.category}</span>
                                  <span className="text-[13px] text-slate-700 min-w-0 truncate">{x.label || "—"}{x.note && <span className="text-gray-400"> · {x.note}</span>}</span>
                                  <span className="text-[13px] font-semibold text-slate-800 tabular-nums ml-auto shrink-0">{fmtFull(x.amount)}</span>
                                  {admin && <button onClick={() => delExpense(x.id)} className="text-gray-300 hover:text-rose-500 text-sm px-1 opacity-0 group-hover:opacity-100 shrink-0">✕</button>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Add an expense */}
                      {admin && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none">
                            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <input value={expForm.label} onChange={e => setExpForm(f => ({ ...f, label: e.target.value }))} placeholder="Who / what (e.g. Melanie)" className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 flex-1 min-w-[130px] focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                          <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1.5 w-24"><span className="text-gray-400 text-[13px]">$</span>
                            <input type="number" min={0} value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full text-[13px] tabular-nums px-1 focus:outline-none" /></div>
                          <input value={expForm.note} onChange={e => setExpForm(f => ({ ...f, note: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addExpense(ts.id); }} placeholder="Note (e.g. 4 hours)" className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 flex-1 min-w-[110px] focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                          <button onClick={() => addExpense(ts.id)} disabled={expBusy} className="text-[13px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5 disabled:opacity-60">{expBusy ? "Adding…" : "+ Add"}</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {sales.length === 0 ? (
              status !== "live" ? <p className="text-xs text-gray-400 py-2 text-center">No sales data synced yet.</p> : null
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2">Brand</th>
                    <th className="text-right font-semibold uppercase tracking-wide text-[10px] pb-2">Revenue (ex-GST)</th>
                    <th className="text-right font-semibold uppercase tracking-wide text-[10px] pb-2">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sales].sort((a, b) => b.revenue - a.revenue).map(sale => {
                    const brand = brands.find(b => b.id === sale.brand_id);
                    return (
                      <tr key={sale.brand_id} className="border-t border-gray-100">
                        <td className="py-1.5 flex items-center gap-2">
                          {brand && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brand.color }} />}
                          <span className="text-slate-600">{brand?.name ?? `Brand ${sale.brand_id}`}</span>
                        </td>
                        <td className="text-right font-semibold text-slate-800">{fmtFull(sale.revenue)}</td>
                        <td className="text-right text-gray-500">{sale.orders}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="pt-2 text-gray-600">Total</td>
                    <td className="pt-2 text-right text-slate-800">{fmtFull(totalRev)}</td>
                    <td className="pt-2 text-right text-gray-600">{totalOrders}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Live Expo header card (name, dates, location, brand dots) ─────────
  function LiveHeader({ ts }: { ts: Tradeshow }) {
    const participating = tradeshowBrands
      .filter(tb => tb.tradeshow_id === ts.id)
      .map(tb => brands.find(b => b.id === tb.brand_id))
      .filter(Boolean) as Brand[];
    return (
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">● LIVE</span>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800 truncate">{ts.name}</h3>
          <p className="text-xs text-gray-400 truncate">{dateRange(ts)}{ts.location ? ` · ${ts.location}` : ""}</p>
        </div>
        {participating.length > 0 && (
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {participating.slice(0, 10).map(b => (
              <span key={b.id} className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} title={b.name} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View switch: Live Expo command-centre vs the full show list */}
      <div className="flex items-center gap-2">
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView("live")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${view === "live" ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}
          >
            {liveShows.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            Live Expo
          </button>
          <button
            onClick={() => setView("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${view === "all" ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}
          >
            All Shows
          </button>
        </div>
        {liveShows.length > 0 && view !== "live" && (
          <span className="text-[11px] text-emerald-600 font-medium">{liveShows.length} show{liveShows.length > 1 ? "s" : ""} live now →</span>
        )}
      </div>

      {/* ── LIVE EXPO command centre ──────────────────────────────────── */}
      {view === "live" && (
        <div className="space-y-4">
          {liveShows.length > 0 ? (
            liveShows.map(ts => (
              <div key={ts.id} className="bg-white rounded-2xl border border-emerald-200/70 shadow-sm p-4">
                {LiveHeader({ ts })}
                <LiveShowPanel showId={ts.id} brands={brands} live />
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">No expo live right now</p>
              <p className="text-xs text-gray-400 mt-1">
                {nextUpcoming
                  ? <>Next up: <span className="text-slate-600 font-medium">{nextUpcoming.name}</span> · {dateRange(nextUpcoming)}{nextUpcoming.location ? ` · ${nextUpcoming.location}` : ""}</>
                  : "No upcoming shows scheduled."}
              </p>
              <button onClick={() => setView("all")} className="mt-3 text-xs font-semibold text-emerald-600 hover:underline">View all shows →</button>
            </div>
          )}
        </div>
      )}

      {/* ── ALL SHOWS (existing list + portfolio visuals) ─────────────── */}
      {view === "all" && (
      <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Upcoming", value: upcoming.length.toString(), sub: liveCount > 0 ? `${liveCount} live now` : "shows scheduled" },
          { label: "Tradeshow Revenue", value: fmtFull(totalRevAll), sub: "ex-GST, all shows" },
          { label: "Top Show", value: topShow ? topShow.name.replace(/ Baby Expo$/, "") : "—", sub: topShowEntry ? fmtK(topShowEntry[1]) : "no sales yet" },
          { label: "Top State", value: topStateEntry ? stateLabel(topStateEntry[0]) : "—", sub: topStateEntry ? fmtK(topStateEntry[1]) : "no sales yet" },
          { label: "Top Brand", value: brandRows[0]?.brand.name ?? "—", sub: brandRows[0] ? fmtK(brandRows[0].rev) : "no sales yet" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{s.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1 truncate">{s.value}</p>
            <p className="text-[11px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Visuals: sales-by-state map + top brands */}
      {!hasVisuals && fyShows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">No tradeshow sales in this financial year yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {fyShows.length} show{fyShows.length > 1 ? "s" : ""} scheduled but none have recorded sales.
            The Sales by State map and top-brands chart appear once shows start selling — or switch the year selector at the top of the dashboard to a past financial year.
          </p>
        </div>
      )}
      {hasVisuals && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Australia sales heat map */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700">Sales by State</h3>
            <p className="text-xs text-gray-400 mb-2">Total tradeshow revenue by location</p>
            <AustraliaMap valueByState={stateTotals} max={maxState} fmt={fmtK} />
          </div>

          {/* Top brands */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700">Top Brands at Shows</h3>
            <p className="text-xs text-gray-400 mb-4">Total revenue across all tradeshows</p>
            <div className="space-y-2.5">
              {brandRows.slice(0, 8).map(r => (
                <div key={r.brand.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-24 truncate flex-shrink-0">{r.brand.name}</span>
                  <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${Math.max(4, (r.rev / maxBrand) * 100)}%`, background: r.brand.color }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-12 text-right flex-shrink-0">{fmtK(r.rev)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">Upcoming & Live</h3>
          {/* Called as plain functions (not <ShowCard/>): a locally-defined component
              type changes identity every parent render, so React would unmount and
              remount each card on every keystroke — losing focus and scroll. */}
          <div className="space-y-2">{upcoming.map(ts => <div key={ts.id}>{ShowCard({ ts })}</div>)}</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Past Shows</h3>
          <div className="space-y-2">{past.map(ts => <div key={ts.id}>{ShowCard({ ts })}</div>)}</div>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
          No tradeshows configured yet.
        </div>
      )}
      </div>
      )}
    </div>
  );
}
