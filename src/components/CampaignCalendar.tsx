"use client";

import React, { useEffect, useRef, useState } from "react";
import { SendSchedule } from "./SendSchedule";
import { BlackFridayPlanner } from "./BlackFridayPlanner";
import { LivePromotions } from "./LivePromotions";

// Portfolio Campaign Calendar — a Now / Next / Later roadmap with team ownership.
// Persists to Supabase via /api/campaigns and /api/campaigns/maintenance.
// Each campaign carries a structured brief (JSONB). Admins edit; everyone can
// view and export a brief to PDF. Australian English. Owners default to TBC.

type Brief = Record<string, any>; // mostly text fields; complianceFlags is { label, note }[]
// brief.emails — the campaign's EDM drafts. Subject holds one option per line (first = chosen).
export type EmailDraft = { name: string; sendDate: string; segment: string; subject: string; preview: string; body: string };
type Campaign = {
  id: string; horizon: string; campaign: string; brand: string; tier: string;
  owner: string; channel: string; status: string; key_date: string; end_date?: string; note: string;
  sort_order: number; brief?: Brief; share_token?: string; image_url?: string | null;
  asana_task_gid?: string | null; asana_permalink_url?: string | null;
  deliverables_status?: { blog: number; edm: number; website: number; promo: number; social: number };
  performance_verdict?: string | null; performance_note?: string | null;
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
const STATUSES = ["Live", "Build", "Planned", "Pipeline", "Paused", "Completed"];
const STATUS_COLOR: Record<string, string> = { Live: "#2E7D5B", Build: "#C77D3C", Planned: "#3C6E9E", Pipeline: "#8A7BB0", Paused: "#9A9A9A", Completed: "#475569" };
// Closes the loop: what actually happened, feeds into the next AI Draft for
// this brand (src/app/api/campaigns/[id]/draft pulls recent verdicts in).
const VERDICT_META: Record<string, { label: string; color: string }> = {
  worked: { label: "Worked well", color: "#2E7D5B" },
  mixed: { label: "Mixed", color: "#C77D3C" },
  didnt_work: { label: "Didn't work", color: "#B4413C" },
  too_early: { label: "Too early to tell", color: "#9A9A9A" },
};
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
  // Per-discipline requirements — these push straight into that team's Asana
  // subtask (Push to Asana) instead of guessing from the deliverables list.
  { key: "edmBrief", label: "EDM requirements (Pier Ann)" },
  { key: "blogBrief", label: "Blog requirements" },
  { key: "paidBrief", label: "Paid Marketing requirements (Anna)" },
  { key: "socialsBrief", label: "Socials requirements (Nicky / Alicia)" },
  { key: "designBrief", label: "Design requirements (Diep)" },
  { key: "retailBrief", label: "Retail requirements (Alison)" },
  { key: "websiteBrief", label: "Website requirements (Melanie)" },
  { key: "affiliateBrief", label: "Affiliate requirements (Jane — UPPAbaby & Nanit only)" },
  { key: "creativeDirection", label: "Creative direction" },
  { key: "do", label: "Do" },
  { key: "dont", label: "Don't" },
  { key: "cascade", label: "Send cascade (social/Google mirrors)" },
  { key: "successMeasure", label: "Success measure" },
  { key: "dependencies", label: "Dependencies" },
  { key: "compliance", label: "Compliance" },
];
// The brief "Channels" field is a fixed checklist (stored as a comma-joined string).
const CHANNEL_OPTIONS = ["Brand Website", "D2C Offer", "Retail", "Baby Bunting", "Marketplace", "Google", "Meta", "EDM", "Blog", "Social Media", "Influencers", "Affiliate"];
const splitChannels = (v: string) => (v || "").split(",").map(s => s.trim()).filter(Boolean);
const GUARD = new Set(["do", "dont", "compliance"]);
const isFlagged = (v: string) => /^\s*(high|check)/i.test(v || "");

const jsonHeaders = { "Content-Type": "application/json" };

// ── Timeline (Gantt) view ────────────────────────────────────────────────
// Read-only visualisation, not a new source of truth: each discipline's
// window is computed from the campaign's own key_date/end_date with fixed
// lead/lag offsets, not stored anywhere. Matches the requirement fields
// already on the brief (edmBrief, socialsBrief, paidBrief, designBrief) plus
// the blog/EDM drafts "Generate campaign kit" already creates.
const addDaysD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DISCIPLINES: { key: string; label: string; color: string; offset: (key: Date, end: Date) => [Date, Date] }[] = [
  { key: "design", label: "Design", color: "#ec4899", offset: (key) => [addDaysD(key, -21), addDaysD(key, -1)] },
  { key: "blog", label: "Blog", color: "#6366f1", offset: (key) => [addDaysD(key, -7), key] },
  { key: "paid", label: "Google / Paid", color: "#f59e0b", offset: (key, end) => [key, end] },
  { key: "social", label: "Social", color: "#0ea5e9", offset: (key, end) => [addDaysD(key, -3), end] },
  { key: "edm", label: "EDM", color: "#d946ef", offset: (key, end) => [key, end] },
];
function disciplineRanges(item: Campaign) {
  const key = parseDate(item.key_date) || new Date();
  const end = parseDate(item.end_date ?? "") || addDaysD(key, 14);
  return DISCIPLINES.map(d => { const [start, e] = d.offset(key, end); return { ...d, start, end: e < start ? start : e }; });
}
function TimelineGantt({ items, onOpen }: { items: Campaign[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const visible = items.filter(i => i.status !== "Completed" && parseDate(i.key_date)).sort((a, b) => (a.key_date || "").localeCompare(b.key_date || ""));
  if (!visible.length) return <p className="text-sm text-gray-400 py-8 text-center bg-white rounded-2xl border border-gray-100">No upcoming campaigns with a start date set.</p>;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const allDates = [today, ...visible.flatMap(c => disciplineRanges(c).flatMap(r => [r.start, r.end]))];
  const rangeStart = new Date(Math.min(...allDates.map(d => d.getTime()))); rangeStart.setDate(1);
  const rangeEndRaw = new Date(Math.max(...allDates.map(d => d.getTime())));
  const rangeEnd = new Date(rangeEndRaw.getFullYear(), rangeEndRaw.getMonth() + 1, 0);
  const totalMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime());
  const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - rangeStart.getTime()) / totalMs) * 100));

  const months: { label: string; leftPct: number }[] = [];
  for (let cur = new Date(rangeStart); cur <= rangeEnd; cur.setMonth(cur.getMonth() + 1)) {
    months.push({ label: cur.toLocaleDateString("en-AU", { month: "short", year: "numeric" }), leftPct: pct(new Date(cur)) });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="relative h-6 mb-2 border-b border-gray-100 ml-[15rem]">
          {months.map(m => <div key={m.label} className="absolute top-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wide" style={{ left: `${m.leftPct}%` }}>{m.label}</div>)}
          <div className="absolute top-0 bottom-[-1px] w-px bg-emerald-400" style={{ left: `${pct(today)}%` }} title="Today" />
        </div>
        <div className="space-y-0.5">
          {visible.map(c => {
            const isOpen = expanded.has(c.id);
            const ranges = disciplineRanges(c);
            const rowStart = new Date(Math.min(...ranges.map(r => r.start.getTime())));
            const rowEnd = new Date(Math.max(...ranges.map(r => r.end.getTime())));
            return (
              <div key={c.id} className="border-b border-gray-50 last:border-0 py-1.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => setExpanded(p => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                    className="text-gray-300 hover:text-slate-500 text-xs w-4 shrink-0">{isOpen ? "▾" : "▸"}</button>
                  <button onClick={() => onOpen(c.id)} className="flex items-center gap-1.5 w-[13.5rem] shrink-0 text-left hover:underline">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[c.status] ?? "#9A9A9A" }} />
                    <span className="text-xs font-medium text-slate-700 truncate">{c.brand} — {c.campaign}</span>
                  </button>
                  <span className="relative flex-1 h-4">
                    <span className="absolute top-1 h-2 rounded-full bg-slate-200" style={{ left: `${pct(rowStart)}%`, width: `${Math.max(0.6, pct(rowEnd) - pct(rowStart))}%` }} />
                  </span>
                </div>
                {isOpen && (
                  <div className="mt-1 space-y-1">
                    {ranges.map(r => {
                      // Blog, EDM and Social link back to real drafts today —
                      // Design/Paid stay pure date estimates until something
                      // produces real content for them too.
                      const trackable = r.key === "blog" || r.key === "edm" || r.key === "social";
                      const done = trackable && (c.deliverables_status?.[r.key as "blog" | "edm" | "social"] ?? 0) > 0;
                      return (
                        <div key={r.key} className="flex items-center gap-2">
                          <span className="w-4 shrink-0" />
                          <span className="text-[10px] text-gray-400 w-[13.5rem] shrink-0 truncate pl-1.5 flex items-center gap-1">
                            {r.label}
                            {trackable && <span title={done ? "Connected draft exists" : "No draft connected yet"}>{done ? "✓" : "○"}</span>}
                          </span>
                          <span className="relative flex-1 h-3">
                            <span className="absolute top-0.5 h-2 rounded-full" style={{ left: `${pct(r.start)}%`, width: `${Math.max(0.6, pct(r.end) - pct(r.start))}%`, background: r.color, opacity: trackable && !done ? 0.35 : 1 }}
                              title={`${r.label}: ${r.start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${r.end.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}${trackable ? (done ? " · connected" : " · not connected yet") : ""}`} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-gray-300 mt-3">Auto-estimated from each campaign's key/end date, not editable here — open the campaign to adjust dates.</p>
    </div>
  );
}

export function CampaignCalendar({ canEdit = false, brands = [], onStartBlog, onStartEdm, onSendToPlanner, onStartPromo, onStartSocial }: { canEdit?: boolean; brands?: { id: number; name: string; live?: boolean }[]; onStartBlog?: (draftId: string) => void; onStartEdm?: (draftId: string) => void; onSendToPlanner?: () => void; onStartPromo?: () => void; onStartSocial?: (draftId: string) => void }) {
  const [view, setView] = useState<"roadmap" | "timeline" | "sends" | "bf" | "promos">("roadmap");
  const [items, setItems] = useState<Campaign[]>([]);
  const [maint, setMaint] = useState<Maint[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [asanaBusy, setAsanaBusy] = useState(false);
  const [asanaError, setAsanaError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [emailCopied, setEmailCopied] = useState<number | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVersion, setAiVersion] = useState(0);
  const [linkBusy, setLinkBusy] = useState<"blog" | "edm" | "promo" | "social" | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitStep, setKitStep] = useState<string | null>(null);
  const [kitResults, setKitResults] = useState<{ label: string; ok: boolean; note?: string }[] | null>(null);
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
  const briefDraft = useRef<Record<string, Record<string, any>>>({});
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
  // Draft the blank narrative fields with Claude from the card note — only
  // fills what's empty, never touches a field that already has content. The
  // brief textareas are uncontrolled (defaultValue), so bump aiVersion into
  // their key to force a remount once the fill lands.
  async function draftBriefWithAI(item: Campaign) {
    setAiBusy(true); setAiError(null);
    const res = await fetch(`/api/campaigns/${item.id}/draft`, { method: "POST" }).then(r => r.json()).catch(() => null);
    setAiBusy(false);
    if (res?.ok) {
      briefDraft.current[item.id] = res.item.brief;
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: res.item.brief } : it)));
      setAiVersion(v => v + 1);
    } else setAiError(res?.error || "Couldn't draft that — try again.");
  }
  // "Start blog →" / "Start EDM →" — generates a real draft in Blog Writing /
  // Email Writing from this campaign's one-liner + objective, then the parent
  // switches tabs and opens it (same hand-off Blog Writing already uses for
  // "Send as EDM →": see BlogStudio's onSendAsEdm / EmailStudio's openDraftId).
  function campaignBrief(item: Campaign): string {
    const b = item.brief as any;
    return [b?.oneLiner, b?.objective].filter(Boolean).join(" — ") || item.note || item.campaign;
  }
  async function startBlog(item: Campaign) {
    const brand = brands.find(b => b.name === item.brand) ?? brands.find(b => item.brand.includes(b.name));
    if (!brand) { setLinkError(`Couldn't match "${item.brand}" to a single brand to start a blog draft.`); return; }
    setLinkBusy("blog"); setLinkError(null);
    const blogBrief = (item.brief as any)?.blogBrief as string | undefined;
    const res = await fetch("/api/blog-drafts", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ brand_id: brand.id, brand_name: brand.name, brief: blogBrief?.trim() || campaignBrief(item), campaign_id: item.id, campaign_name: item.campaign, scheduled_for: item.key_date }) }).then(r => r.json()).catch(() => null);
    setLinkBusy(null);
    if (res?.ok) onStartBlog?.(res.item.id);
    else setLinkError(res?.error || "Couldn't start a blog draft for that brand.");
  }
  async function startEdm(item: Campaign) {
    const brand = brands.find(b => b.name === item.brand) ?? brands.find(b => item.brand.includes(b.name));
    if (!brand) { setLinkError(`Couldn't match "${item.brand}" to a single brand to send an EDM from.`); return; }
    setLinkBusy("edm"); setLinkError(null);
    const res = await fetch("/api/edm-drafts", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ brand_id: brand.id, brand_name: brand.name, brief: campaignBrief(item), campaign_id: item.id, campaign_name: item.campaign }) }).then(r => r.json()).catch(() => null);
    setLinkBusy(null);
    if (res?.ok) onStartEdm?.(res.item.id);
    else setLinkError(res?.error || "Couldn't start an EDM draft for that brand.");
  }
  // "Start D2C promo →" — lays the campaign's offer/mechanic out as a real
  // entry in the D2C promo tracker (site_deals, Plan > Promotions), instead
  // of it only living as free text in the brief. Best-effort $ extraction so
  // the value badge is pre-filled when the offer is a dollar figure.
  async function startD2cPromo(item: Campaign) {
    const offer = String((item.brief as any)?.offerMechanic || "").trim();
    if (!offer) { setLinkError("Add an offer/mechanic to the brief first — that's what the promo is built from."); return; }
    setLinkBusy("promo"); setLinkError(null);
    const priceMatch = offer.match(/\$\s?[\d,]+(\.\d{2})?/);
    const periodEnd = item.end_date && parseDate(item.end_date) ? item.end_date : (addDays(item.key_date, 30) ?? item.key_date);
    const res = await fetch("/api/site-deals", {
      method: "POST", headers: jsonHeaders, body: JSON.stringify({
        brand: item.brand, title: item.campaign, note: offer.slice(0, 300),
        period_start: item.key_date, period_end: periodEnd,
        price: priceMatch ? priceMatch[0].replace(/\s/g, "") : null,
        campaign_id: item.id, campaign_name: item.campaign,
      }),
    }).then(r => r.json()).catch(() => null);
    setLinkBusy(null);
    if (res?.ok) onStartPromo?.();
    else setLinkError(res?.error || "Couldn't create the promo.");
  }
  // "Start social →" — generates one Instagram feed draft from the
  // campaign's socialsBrief (falling back to the general brief) and jumps
  // to Social Writing to review it. One platform to start; more can be
  // generated for the same brief from Social Writing directly.
  async function startSocial(item: Campaign) {
    const brand = brands.find(b => b.name === item.brand) ?? brands.find(b => item.brand.includes(b.name));
    if (!brand) { setLinkError(`Couldn't match "${item.brand}" to a single brand to start a social draft.`); return; }
    setLinkBusy("social"); setLinkError(null);
    const socialsBrief = (item.brief as any)?.socialsBrief as string | undefined;
    const res = await fetch("/api/social-drafts", {
      method: "POST", headers: jsonHeaders, body: JSON.stringify({
        brand_id: brand.id, brand_name: brand.name, brief: socialsBrief?.trim() || campaignBrief(item),
        platform: "instagram", format: "feed", campaign_id: item.id, campaign_name: item.campaign,
      }),
    }).then(r => r.json()).catch(() => null);
    setLinkBusy(null);
    if (res?.ok) onStartSocial?.(res.item.id);
    else setLinkError(res?.error || "Couldn't start a social draft for that brand.");
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function htmlFromPlainBody(text: string): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paras = (text || "").split(/\n{2,}/).filter(Boolean)
      .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;font-family:Arial,Helvetica,sans-serif;">${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
    return `<div style="max-width:600px;margin:0 auto;">${paras}</div>`;
  }
  // "Send to Email Planner →" on a campaign's hand-written email draft —
  // imports it as-is (already has real subject/body, no need to regenerate)
  // into edm_drafts so it shows on the EDM Planner calendar at its send date.
  async function sendToPlanner(item: Campaign, em: EmailDraft) {
    const brand = brands.find(b => b.name === item.brand) ?? brands.find(b => item.brand.includes(b.name));
    if (!brand) { setLinkError(`Couldn't match "${item.brand}" to a single brand to send this email to.`); return; }
    setLinkBusy("edm"); setLinkError(null);
    const subject = (em.subject || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || item.campaign;
    const res = await fetch("/api/edm-drafts", {
      method: "POST", headers: jsonHeaders, body: JSON.stringify({
        import: true, brand_id: brand.id, subject, preview_text: em.preview || null,
        body_html: htmlFromPlainBody(em.body || ""), scheduled_for: DATE_RE.test(em.sendDate || "") ? em.sendDate : null,
        brief: `From campaign: ${item.campaign}${em.segment ? ` — segment: ${em.segment}` : ""}`,
        campaign_id: item.id, campaign_name: item.campaign,
      }),
    }).then(r => r.json()).catch(() => null);
    setLinkBusy(null);
    if (res?.ok) onSendToPlanner?.();
    else setLinkError(res?.error || "Couldn't send that email to the planner.");
  }
  const addDays = (iso: string, n: number) => { const d = parseDate(iso); if (!d) return null; d.setDate(d.getDate() + n); return isoDate(d); };
  const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  // The brief's "deliverables" field often already spells out real send
  // dates + a topic per email, e.g. "Thu 1 Oct: The list nobody gives you /
  // Thu 15 Oct: What midwives actually pack" — parse those out so each EDM
  // gets its own real date and its own topic, instead of guessing key_date
  // +7/+14 with the same generic brief repeated three times.
  function parseDeliverableSends(item: Campaign): { date: string; topic: string }[] {
    const text = String((item.brief as any)?.deliverables || "");
    const keyDate = parseDate(item.key_date);
    const endDate = parseDate(item.end_date ?? "");
    const out: { date: string; topic: string }[] = [];
    const re = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s*:\s*([^\n/]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const day = Number(m[1]);
      const month = MONTH_NUM[m[2].slice(0, 3).toLowerCase()];
      if (!month || !day) continue;
      let year = keyDate?.getFullYear() ?? new Date().getFullYear();
      if (keyDate && month < keyDate.getMonth() + 1 && endDate && endDate.getFullYear() > keyDate.getFullYear()) year = endDate.getFullYear();
      out.push({ date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, topic: m[3].replace(/\)+\s*$/, "").trim() });
    }
    return out;
  }
  // "Generate campaign kit" — one click for a blank campaign: drafts the
  // blog post, proposes EDM sends spread across the campaign window (only
  // when brief.emails is still empty — a campaign with hand-written emails
  // already uses "Send to Email Planner →" per email instead), and files a
  // Website Request ticket if the channel/note points at a build. Every step
  // is independent and reported separately — one failing doesn't block the rest.
  // Every kit step used to swallow its failure into a bare "failed": a
  // gateway timeout, an expired session or a network drop all looked the
  // same. Reads the JSON when there is some and otherwise explains the HTTP
  // status so the result line says what actually went wrong.
  async function kitCall(url: string, init?: RequestInit): Promise<{ ok: boolean; error?: string; [k: string]: any }> {
    let res: Response;
    try { res = await fetch(url, init); }
    catch (e: any) { return { ok: false, error: `network error (${String(e?.message || e).slice(0, 80)}) — keep this tab open while it runs` }; }
    const text = await res.text().catch(() => "");
    try {
      const j = JSON.parse(text);
      if (j && typeof j === "object") { if (!j.ok && !j.error) j.error = `HTTP ${res.status}`; return j; }
    } catch { /* not JSON */ }
    if (res.status === 504) return { ok: false, error: "timed out (504) — the draft took longer than Vercel allows; try again" };
    if (res.status === 401) return { ok: false, error: "signed out (401) — reload the page and sign in again" };
    return { ok: false, error: `HTTP ${res.status} ${res.statusText || ""}`.trim() + (text ? `: ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}` : "") };
  }

  async function generateKit(item: Campaign) {
    const brand = brands.find(b => b.name === item.brand) ?? brands.find(b => item.brand.includes(b.name));
    if (!brand) { setKitResults([{ label: "Setup", ok: false, note: `Couldn't match "${item.brand}" to a single brand.` }]); return; }
    setKitBusy(true); setKitResults(null);
    const brief = campaignBrief(item);
    const results: { label: string; ok: boolean; note?: string }[] = [];

    // Re-running the kit on a campaign that already has connected drafts used
    // to just pile up duplicates alongside them. Now it overwrites: a linked
    // draft still in "draft"/"rejected" (not yet sent/published) is deleted
    // and replaced with fresh content: one already sent or published is left
    // alone and reported as skipped, never silently deleted.
    const wantsBlog = splitChannels((item.brief as any)?.channels ?? "").includes("Blog");
    if (wantsBlog) {
      const existingBlogs = await fetch(`/api/blog-drafts?brand_id=${brand.id}&campaign_id=${item.id}`).then(r => r.json()).catch(() => null);
      const blogRows: { id: string; status: string }[] = existingBlogs?.ok ? existingBlogs.items : [];
      const untouchedBlog = blogRows.find(r => r.status === "published");
      if (untouchedBlog) {
        results.push({ label: "Blog draft", ok: true, note: "skipped — already published, not overwritten" });
      } else {
        for (const r of blogRows) await fetch(`/api/blog-drafts?id=${r.id}`, { method: "DELETE" }).catch(() => null);
        setKitStep(blogRows.length ? "Rewriting blog post… (30–60s)" : "Drafting blog post… (30–60s)");
        const blogBrief = (item.brief as any)?.blogBrief as string | undefined;
        const blogRes = await kitCall("/api/blog-drafts", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ brand_id: brand.id, brand_name: brand.name, brief: blogBrief?.trim() || brief, campaign_id: item.id, campaign_name: item.campaign, scheduled_for: item.key_date }) });
        results.push({ label: "Blog draft", ok: !!blogRes?.ok, note: blogRes?.ok ? (blogRows.length ? "overwrote the existing draft" : undefined) : (blogRes?.error || "failed") });
      }
    } else {
      results.push({ label: "Blog draft", ok: true, note: "skipped — Blog isn't ticked in this campaign's Channels" });
    }

    const existingEmails: EmailDraft[] = (item.brief as any)?.emails ?? [];
    if (existingEmails.length === 0) {
      // Three ways to find the real send plan, cheapest/most reliable first:
      // 1. A "Thu 1 Oct: topic" style deliverables list (parseDeliverableSends,
      //    free, no AI call).
      // 2. When that finds nothing (deliverables rewritten as a checklist,
      //    say), ask Claude to read edmBrief the way a person would — it can
      //    follow relative/conditional wording ("within 48 hours", "once sold
      //    out") that a regex can't, and returns date: null for a send that's
      //    genuinely trigger-based rather than inventing a calendar date.
      // 3. Only if both come back empty: the old blind +7/+14 day guess.
      let sends: { date: string | null; topic: string }[] = parseDeliverableSends(item);
      let sendsSource: "deliverables" | "edmBrief" | "guess" = sends.length ? "deliverables" : "guess";
      if (!sends.length) {
        setKitStep("Reading the EDM brief for send dates…");
        const parsed = await kitCall(`/api/campaigns/${item.id}/parse-sends`, { method: "POST" });
        if (parsed?.ok && Array.isArray(parsed.sends) && parsed.sends.length) { sends = parsed.sends; sendsSource = "edmBrief"; }
      }
      const base = item.key_date && parseDate(item.key_date) ? item.key_date : isoDate(new Date());
      if (!sends.length) sends = ([base, addDays(base, 7), addDays(base, 14)].filter(Boolean) as string[]).map(date => ({ date, topic: "" }));
      const existingEdms = await fetch(`/api/edm-drafts?brand_id=${brand.id}&campaign_id=${item.id}`).then(r => r.json()).catch(() => null);
      const edmRows: { id: string; status: string; scheduled_for: string | null }[] = existingEdms?.ok ? existingEdms.items : [];
      let edmOk = 0, edmOverwritten = 0, edmSkippedSent = 0, edmFirstError = "";
      for (let i = 0; i < sends.length; i++) {
        const matching = edmRows.filter(r => r.scheduled_for === sends[i].date);
        const untouchable = matching.find(r => r.status === "sent");
        if (untouchable) { edmSkippedSent++; continue; }
        for (const r of matching) await fetch(`/api/edm-drafts?id=${r.id}`, { method: "DELETE" }).catch(() => null);
        if (matching.length) edmOverwritten++;
        setKitStep(`${matching.length ? "Rewriting" : "Writing"} EDM ${i + 1} of ${sends.length}… (30–60s each)`);
        const emailBrief = sends[i].topic ? `${brief}. This specific send: ${sends[i].topic}` : brief;
        const r = await kitCall("/api/edm-drafts", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ brand_id: brand.id, brand_name: brand.name, brief: emailBrief, scheduled_for: sends[i].date, campaign_id: item.id, campaign_name: item.campaign }) });
        if (r?.ok) edmOk++; else if (!edmFirstError) edmFirstError = r?.error || "failed";
      }
      const edmNotes = [
        edmOk < (sends.length - edmSkippedSent) ? `one or more failed: ${edmFirstError || "check Email Writing"}` : null,
        edmOverwritten ? `overwrote ${edmOverwritten} existing draft${edmOverwritten === 1 ? "" : "s"}` : null,
        edmSkippedSent ? `${edmSkippedSent} already sent, not touched` : null,
        sendsSource === "deliverables" ? "dates and topics read from the brief's deliverables" : sendsSource === "edmBrief" ? "dates and topics read from the EDM requirements brief" : null,
      ].filter(Boolean).join(" · ");
      results.push({ label: `EDM sends (${edmOk}/${sends.length})`, ok: edmOk > 0 || edmSkippedSent > 0, note: edmNotes || undefined });
    } else {
      results.push({ label: "EDM sends", ok: true, note: "skipped — this campaign already has hand-written email drafts, use Send to Email Planner instead" });
    }

    const needsWebsite = /website|landing page|configurator|shopify|d2c/i.test(`${item.channel} ${item.note}`);
    if (needsWebsite) {
      const existingRequests = await fetch(`/api/website-requests?campaign_id=${item.id}`).then(r => r.json()).catch(() => null);
      const requestRows: { id: string }[] = existingRequests?.ok ? existingRequests.items : [];
      if (requestRows.length) {
        results.push({ label: "Website Request ticket", ok: true, note: "skipped — already filed for this campaign" });
      } else {
        setKitStep("Filing Website Request ticket…");
        const wr = await fetch("/api/website-requests", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ brand: item.brand, description: `Build/landing page needed for campaign "${item.campaign}": ${item.note}`.slice(0, 2000), change_type: "new_page", priority: "normal", campaign_id: item.id, campaign_name: item.campaign }) }).then(r => r.json()).catch(() => null);
        results.push({ label: "Website Request ticket", ok: !!wr?.ok, note: wr?.ok ? undefined : (wr?.error || "failed") });
      }
    }

    setKitBusy(false); setKitStep(null); setKitResults(results);
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
  // "Design required" — flags the campaign onto the Design tab so the designer
  // sees it in her queue. Stored in brief.designRequired; saves immediately.
  function toggleDesignRequired(item: Campaign) {
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}) };
    cur.designRequired = !cur.designRequired;
    briefDraft.current[item.id] = cur;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: { ...cur } } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { brief: { ...cur } } as Partial<Campaign>);
  }
  // Compliance flags — structured { label, note } rows stored in brief.complianceFlags.
  function setFlags(item: Campaign, flags: { label: string; note: string }[]) {
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}), complianceFlags: flags };
    briefDraft.current[item.id] = cur;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: { ...cur } } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { brief: { ...cur } } as Partial<Campaign>);
  }
  // Email drafts — structured sends stored in brief.emails, copied straight into Klaviyo.
  function setEmails(item: Campaign, emails: EmailDraft[]) {
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}), emails };
    briefDraft.current[item.id] = cur;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: { ...cur } } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { brief: { ...cur } } as Partial<Campaign>);
  }
  // Whether the drafts render on the shared brief sheet (default on).
  function setShowEmails(item: Campaign, on: boolean) {
    const cur = { ...(briefDraft.current[item.id] ?? (item.brief as any) ?? {}), showEmails: on };
    briefDraft.current[item.id] = cur;
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, brief: { ...cur } } : it)));
    if (item.id.startsWith("temp-")) return;
    patch(item.id, { brief: { ...cur } } as Partial<Campaign>);
  }
  function updateEmail(item: Campaign, i: number, field: keyof EmailDraft, value: string) {
    const arr = [...((item.brief?.emails as EmailDraft[]) ?? [])];
    arr[i] = { ...arr[i], [field]: value };
    setEmails(item, arr);
  }
  // Klaviyo wants the chosen subject (first line), the preview text, then the body.
  const emailText = (e: EmailDraft) => [
    `Subject: ${(e?.subject ?? "").split("\n")[0].trim()}`,
    `Preview text: ${e?.preview ?? ""}`,
    "",
    e?.body ?? "",
  ].join("\n");
  async function copyEmail(e: EmailDraft, i: number) {
    try { await navigator.clipboard.writeText(emailText(e)); setEmailCopied(i); setTimeout(() => setEmailCopied(null), 1500); }
    catch { setError("Could not copy. Select the text and copy it manually."); }
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
    const emails: EmailDraft[] = c.brief?.emails ?? [];
    if (emails.length) {
      lines.push("", `— Email drafts (${emails.length}) —`);
      emails.forEach((e, i) => lines.push(
        "",
        `${i + 1}. ${e.name || "Untitled send"}${e.sendDate ? ` · ${e.sendDate}` : ""}${e.segment ? ` · to: ${e.segment}` : ""}`,
        emailText(e),
      ));
    }
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

  async function pushToAsana(item: Campaign) {
    setAsanaBusy(true); setAsanaError(null);
    try {
      const j = await (await fetch("/api/campaigns/asana-push", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ id: item.id }) })).json();
      if (!j.ok) { setAsanaError(j.error || "Push failed"); return; }
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, asana_task_gid: j.taskGid, asana_permalink_url: j.permalink } : it)));
      if (j.permalink) window.open(j.permalink, "_blank");
    } catch { setAsanaError("Couldn't reach Asana — try again."); }
    finally { setAsanaBusy(false); }
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
        <div className="flex items-center gap-3">
          {view === "roadmap" && <>
            <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="accent-slate-600" />
              Show completed
            </label>
            <button onClick={exportCSV} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition motion-reduce:transition-none">Export CSV</button>
            <button onClick={exportJSON} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition motion-reduce:transition-none">Export JSON</button>
          </>}
        </div>
      </div>

      <div className="flex gap-1 mb-4 no-print">
        {([["roadmap", "Roadmap"], ["timeline", "Timeline"], ["sends", "Send Schedule"], ["bf", "Black Friday"], ["promos", "Live Promotions"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`text-sm font-medium rounded-lg px-3 py-1.5 transition motion-reduce:transition-none ${view === id ? "bg-slate-800 text-white" : "text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "roadmap" && <>
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
          {(() => {
            // With 12 brands, the real risk isn't one bad campaign, it's a
            // brand going quiet without anyone noticing — flag any live brand
            // with nothing in Now or Next (Later is fine to be sparse this far out).
            const liveBrands = brands.filter(b => b.live !== false);
            const activeBrandNames = new Set(items.filter(c => (c.horizon === "now" || c.horizon === "next") && c.status !== "Completed").map(c => c.brand));
            const quiet = liveBrands.filter(b => !activeBrandNames.has(b.name) && ![...activeBrandNames].some(n => n.includes(b.name)));
            if (!quiet.length) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 no-print">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Nothing planned in Now/Next for:</span>{" "}
                  {quiet.map((b, i) => <span key={b.id}>{b.name}{i < quiet.length - 1 ? ", " : ""}</span>)}
                </p>
              </div>
            );
          })()}
          <div className="grid gap-4 md:grid-cols-3">
            {HORIZONS.map(h => {
              const rows = items.filter(i => i.horizon === h.id && (showCompleted || i.status !== "Completed")).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
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
                          onClick={() => canEdit ? setOpenId(c.id) : (c.share_token && window.open(`/c/${c.share_token}`, "_blank"))}
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === "Enter") { if (canEdit) setOpenId(c.id); else if (c.share_token) window.open(`/c/${c.share_token}`, "_blank"); } }}
                          draggable={canEdit}
                          onDragStart={canEdit ? (e => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }) : undefined}
                          onDragEnd={canEdit ? (() => { setDragId(null); setDragOver(null); }) : undefined}
                          className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:border-emerald-200 hover:shadow transition motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-emerald-400 ${canEdit ? "active:cursor-grabbing" : ""} ${dragId === c.id ? "opacity-40" : ""}`}
                        >
                          {c.image_url && <img src={c.image_url} alt="" className="w-full h-28 object-cover" />}
                          <div className={`space-y-1.5 px-3 pb-3 ${c.image_url ? "pt-1.5" : "pt-3"}`}>
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
                          {c.note && <p className="text-[11px] text-gray-500 leading-snug whitespace-pre-line">{c.note}</p>}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {([
                              ["blog", "📝", "Blog"],
                              ["edm", "✉️", "EDM"],
                              ["social", "📷", "Social"],
                              ["website", "🌐", "Website"],
                              ["promo", "🎟️", "Promo"],
                            ] as const).map(([key, icon, label]) => {
                              const n = c.deliverables_status?.[key] ?? 0;
                              return (
                                <span key={key} title={n ? `${n} ${label} draft${n === 1 ? "" : "s"} connected` : `No ${label} connected yet`}
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${n ? "bg-emerald-50 text-emerald-700" : "text-gray-300 bg-gray-50"}`}>
                                  {n ? "✓" : "○"} {icon} {label}{n > 1 ? ` (${n})` : ""}
                                </span>
                              );
                            })}
                            {c.performance_verdict && VERDICT_META[c.performance_verdict] && (
                              <span title={c.performance_note || undefined} className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ color: VERDICT_META[c.performance_verdict].color, background: `${VERDICT_META[c.performance_verdict].color}18` }}>
                                ● {VERDICT_META[c.performance_verdict].label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            {c.share_token
                              ? <a href={`/c/${c.share_token}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                  className="text-[11px] font-medium text-emerald-500 hover:text-emerald-700 hover:underline flex items-center gap-1">{flagged && <span title="Compliance flag" className="text-amber-500">⚠</span>}Open brief →</a>
                              : <p className="text-[11px] font-medium text-emerald-500 flex items-center gap-1">{flagged && <span title="Compliance flag" className="text-amber-500">⚠</span>}Open brief →</p>}
                            {(canEdit || (c.brief as any)?.designRequired) && (
                              <button
                                onClick={canEdit ? (e => { e.stopPropagation(); toggleDesignRequired(c); }) : undefined}
                                title={canEdit ? "Flag this campaign to the Design tab" : "On the Design tab"}
                                className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 transition-colors ${(c.brief as any)?.designRequired
                                  ? "bg-pink-100 text-pink-700"
                                  : "text-gray-300 border border-dashed border-gray-200 hover:text-pink-500 hover:border-pink-200"} ${canEdit ? "" : "cursor-default"}`}>
                                🎨 {(c.brief as any)?.designRequired ? "Design required ✓" : "Design required"}
                              </button>
                            )}
                          </div>
                          </div>
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
      </>}

      {view === "timeline" && <TimelineGantt items={items} onOpen={setOpenId} />}
      {view === "sends" && <SendSchedule canEdit={canEdit} />}
      {view === "bf" && <BlackFridayPlanner canEdit={canEdit} />}
      {view === "promos" && <LivePromotions canEdit={canEdit} brands={brands} />}

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
                {canEdit && (() => {
                  const hasSomethingToDraftFrom = !!open.note?.trim() || Object.values(open.brief ?? {}).some(v => String(v ?? "").trim());
                  return (
                    <div className="no-print flex items-center gap-2">
                      <button onClick={() => draftBriefWithAI(open)} disabled={aiBusy || !hasSomethingToDraftFrom}
                        title={!hasSomethingToDraftFrom ? "Add a card note or fill in at least one field first" : "Fill any blank fields below from the card note and what's already filled in"}
                        className="text-[13px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg px-3 py-1.5 disabled:opacity-40 transition">
                        {aiBusy ? "✨ Drafting…" : "✨ Draft blank fields with AI"}
                      </button>
                      {aiError && <p className="text-xs text-rose-500">{aiError}</p>}
                    </div>
                  );
                })()}
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
                          key={open.id + f.key + aiVersion}
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

              {/* Compliance flags — structured "check before send" items */}
              <div className="space-y-2 border-t border-gray-100 pt-4 mt-3">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-amber-700">Compliance flags <span className="font-normal lowercase tracking-normal text-gray-300">· check before send</span></label>
                {(open.brief?.complianceFlags ?? []).map((fl: any, i: number) => (
                  <div key={i} className="flex gap-2 items-start rounded-lg bg-amber-50 border border-amber-200 p-2">
                    <div className="flex-1 space-y-1">
                      <input readOnly={ro} defaultValue={fl?.label ?? ""} placeholder="Label (e.g. GWP value claim)"
                        onBlur={e => { const arr = [...(open.brief?.complianceFlags ?? [])]; arr[i] = { ...arr[i], label: e.target.value }; setFlags(open, arr); }}
                        className="w-full bg-white/70 text-[13px] font-medium text-amber-900 rounded px-2 py-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 read-only:cursor-default placeholder:text-amber-300" />
                      <textarea readOnly={ro} defaultValue={fl?.note ?? ""} rows={2} placeholder="What to check, and why"
                        onBlur={e => { const arr = [...(open.brief?.complianceFlags ?? [])]; arr[i] = { ...arr[i], note: e.target.value }; setFlags(open, arr); }}
                        className="w-full bg-white/70 text-[13px] text-amber-900 rounded px-2 py-1 resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 read-only:cursor-default placeholder:text-amber-300" />
                    </div>
                    {canEdit && <button onClick={() => setFlags(open, (open.brief?.complianceFlags ?? []).filter((_: any, j: number) => j !== i))} className="text-amber-500 hover:text-amber-700 text-xs px-1" aria-label="Remove flag">✕</button>}
                  </div>
                ))}
                {canEdit && <button onClick={() => setFlags(open, [...(open.brief?.complianceFlags ?? []), { label: "", note: "" }])} className="text-[13px] font-medium text-amber-700 hover:text-amber-800">+ Add compliance flag</button>}
              </div>

              {/* Performance — closes the loop, feeds the next AI Draft for this brand */}
              <div className="space-y-2 border-t border-gray-100 pt-4 mt-3">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Performance <span className="font-normal lowercase tracking-normal text-gray-300">· what actually happened, so next time's AI draft can reference it</span>
                </label>
                <select value={open.performance_verdict ?? ""} disabled={ro} onChange={e => { commitText(open.id, "performance_verdict", e.target.value); saveText(open.id, "performance_verdict", e.target.value); }}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-default">
                  <option value="">Not assessed yet</option>
                  {Object.entries(VERDICT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <textarea key={open.id + "performance_note"} readOnly={ro} defaultValue={open.performance_note ?? ""} rows={2} placeholder="What worked, what didn't, what to change next time"
                  onChange={e => saveText(open.id, "performance_note", e.target.value)} onBlur={e => commitText(open.id, "performance_note", e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 leading-relaxed rounded px-1 -ml-1 resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 read-only:cursor-default placeholder:text-gray-300 placeholder:italic border border-gray-100" />
              </div>

              {/* Email drafts — the actual copy, ready to paste into Klaviyo */}
              <div className="space-y-3 border-t border-gray-100 pt-4 mt-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                    Email drafts <span className="font-normal lowercase tracking-normal text-gray-300">· paste into Klaviyo, a human sends</span>
                  </label>
                  {canEdit && (
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer shrink-0" title="When off, the drafts stay here for the email team but don't render on the shared brief sheet">
                      <input type="checkbox" checked={(open.brief as any)?.showEmails !== false} onChange={e => setShowEmails(open, e.target.checked)} className="accent-sky-500" />
                      show on brief
                    </label>
                  )}
                </div>
                {(((open.brief?.emails as EmailDraft[]) ?? [])).map((em, i) => {
                  const inp = "w-full bg-white/80 text-[13px] text-slate-700 rounded px-2 py-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 read-only:cursor-default placeholder:text-sky-300";
                  return (
                    <div key={i} className="rounded-lg bg-sky-50/60 border border-sky-100 p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <input readOnly={ro} defaultValue={em?.name ?? ""} placeholder="Send name (e.g. Launch)"
                          onBlur={e => updateEmail(open, i, "name", e.target.value)}
                          className={`${inp} flex-1 font-semibold text-slate-800`} />
                        <input readOnly={ro} defaultValue={em?.sendDate ?? ""} placeholder="Send date"
                          onBlur={e => updateEmail(open, i, "sendDate", e.target.value)} className={`${inp} w-32`} />
                        {canEdit && <button onClick={() => setEmails(open, ((open.brief?.emails as EmailDraft[]) ?? []).filter((_, j) => j !== i))} className="text-sky-500 hover:text-sky-700 text-xs px-1" aria-label="Remove email draft">✕</button>}
                      </div>
                      <input readOnly={ro} defaultValue={em?.segment ?? ""} placeholder="Send to — a segment, not the whole list"
                        onBlur={e => updateEmail(open, i, "segment", e.target.value)} className={inp} />
                      <div>
                        <span className="block text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Subject <span className="normal-case tracking-normal text-gray-300">· one per line, the first is used</span></span>
                        <textarea readOnly={ro} defaultValue={em?.subject ?? ""} rows={2} placeholder="Subject line options"
                          onBlur={e => updateEmail(open, i, "subject", e.target.value)} className={`${inp} resize-y`} />
                      </div>
                      <input readOnly={ro} defaultValue={em?.preview ?? ""} placeholder="Preview text"
                        onBlur={e => updateEmail(open, i, "preview", e.target.value)} className={inp} />
                      <textarea readOnly={ro} defaultValue={em?.body ?? ""} rows={8} placeholder="Email body"
                        onBlur={e => updateEmail(open, i, "body", e.target.value)} className={`${inp} resize-y leading-relaxed`} />
                      <div className="no-print flex justify-end gap-2">
                        {canEdit && (
                          <button onClick={() => sendToPlanner(open, em)} disabled={linkBusy === "edm" || !em?.subject?.trim() || !em?.body?.trim()}
                            title={!em?.sendDate ? "No send date set — it'll land in the planner unscheduled" : undefined}
                            className="text-[13px] font-medium text-fuchsia-700 bg-white border border-fuchsia-200 hover:bg-fuchsia-50 rounded-lg px-3 py-1 transition disabled:opacity-40">
                            {linkBusy === "edm" ? "Sending…" : "Send to Email Planner →"}
                          </button>
                        )}
                        <button onClick={() => copyEmail(em, i)} className="text-[13px] font-medium text-sky-700 bg-white border border-sky-200 hover:bg-sky-50 rounded-lg px-3 py-1 transition">
                          {emailCopied === i ? "Copied" : "Copy for Klaviyo"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {canEdit && <button onClick={() => setEmails(open, [...(((open.brief?.emails as EmailDraft[]) ?? [])), { name: "", sendDate: "", segment: "", subject: "", preview: "", body: "" }])} className="text-[13px] font-medium text-sky-700 hover:text-sky-800">+ Add email draft</button>}
              </div>

              {/* Footer */}
              {asanaError && (
                <p role="alert" className="no-print text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">{asanaError}</p>
              )}
              {linkError && (
                <p role="alert" className="no-print text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">{linkError}</p>
              )}
              {kitBusy && (
                <div className="no-print flex items-center gap-2 text-[13px] text-emerald-700 mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {kitStep}
                </div>
              )}
              {kitResults && (
                <div className="no-print text-[13px] space-y-0.5 mt-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  {kitResults.map((r, i) => (
                    <p key={i} className={r.ok ? "text-emerald-700" : "text-rose-600"}>{r.ok ? "✓" : "✗"} {r.label}{r.note ? ` — ${r.note}` : ""}</p>
                  ))}
                </div>
              )}
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
                {canEdit && <>
                  <button onClick={() => generateKit(open)} disabled={kitBusy} title={kitBusy ? undefined : "Drafts the blog post if Blog is ticked in Channels, proposes 3 EDM sends, and files a Website Request if the brief points at a build. Re-running overwrites what's already connected, unless it's already been sent or published."}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">
                    {kitBusy
                      ? <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      : "✨"} {kitBusy ? "Generating kit…" : "Generate campaign kit"}
                  </button>
                  {splitChannels((open.brief as any)?.channels ?? "").includes("Blog") && (
                    <button onClick={() => startBlog(open)} disabled={linkBusy === "blog"} title="Drafts from the brief's Blog requirements (or the general brief if that's blank)"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15.828H9v-2.828l8.586-8.586zM3 8l7 5" /></svg>
                      {linkBusy === "blog" ? "Starting…" : "Start blog →"}
                    </button>
                  )}
                  <button onClick={() => startEdm(open)} disabled={linkBusy === "edm"} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-fuchsia-500 hover:bg-fuchsia-600 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {linkBusy === "edm" ? "Starting…" : "Start EDM →"}
                  </button>
                  <button onClick={() => startD2cPromo(open)} disabled={linkBusy === "promo"} title="Lays the brief's offer/mechanic out as a real entry in the D2C promo tracker"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {linkBusy === "promo" ? "Starting…" : "Start D2C promo →"}
                  </button>
                  <button onClick={() => startSocial(open)} disabled={linkBusy === "social"} title="Drafts an Instagram caption from the brief's socialsBrief (or the general brief if that's blank)"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-pink-500 hover:bg-pink-600 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" strokeWidth={2} /><circle cx="12" cy="12" r="3.5" strokeWidth={2} /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                    {linkBusy === "social" ? "Starting…" : "Start social →"}
                  </button>
                  <button onClick={() => pushToAsana(open)} disabled={asanaBusy} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#F06A6A] hover:bg-[#e05555] rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="18" cy="7" r="4" /><circle cx="6" cy="7" r="4" /><circle cx="12" cy="16" r="4" /></svg>
                    {asanaBusy ? "Pushing…" : open.asana_task_gid ? "Update Asana task" : "Push to Asana"}
                  </button>
                  {open.asana_permalink_url && (
                    <a href={open.asana_permalink_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">View in Asana ↗</a>
                  )}
                  <button onClick={() => copyBrief(open)} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">{copied ? "Copied" : "Copy brief"}</button>
                  <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => uploadCampaignImage(open, e.target.files?.[0])} />
                  <button onClick={() => imgRef.current?.click()} disabled={imgBusy} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60 motion-reduce:transition-none">{imgBusy ? "Uploading…" : open.image_url ? "Replace image" : "Add image"}</button>
                  <button onClick={() => copyShareLink(open)} className="text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">{linkCopied ? "Link copied" : "Copy share link"}</button>
                  <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition motion-reduce:transition-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                    Export PDF
                  </button>
                </>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
