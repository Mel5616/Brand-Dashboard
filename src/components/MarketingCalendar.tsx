"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/db";

interface Props {
  events: CalendarEvent[];
  brands: any[];
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// Bucket each event by its title (and whether it came from the Campaigns tab).
const CATEGORIES = [
  { id: "tradeshow", label: "Tradeshows", color: "#0891b2" },
  { id: "worldday", label: "World Event Days", color: "#7c3aed" },
  { id: "campaign", label: "Campaigns", color: "#e8956b" },
  { id: "tuneup", label: "Tune Up Days", color: "#2dc8a5" },
  { id: "other", label: "Other", color: "#94a3b8" },
] as const;
function categorize(title: string, isCampaign?: boolean): string {
  const t = (title || "").toLowerCase();
  if (/tune[\s-]?up/.test(t)) return "tuneup";
  if (/\bexpo\b|trade\s?show|baby\s?show|\bfair\b/.test(t)) return "tradeshow";
  if (/^(world|international|national|global)\b/.test(t) || /\bday of\b/.test(t) || /\bday$/.test(t) ||
      /halloween|black friday|cyber (monday|weekend)|christmas|boxing day|easter|valentine|mother'?s day|father'?s day|click frenzy|singles'? day|new year/.test(t)) return "worldday";
  if (isCampaign || /\bsale|launch|%\s?off|\boff\b|coming soon|\bdrop\b|promo|campaign|offer|bundle/.test(t)) return "campaign";
  return "other";
}

function parseLocalDate(s: string): Date {
  // s is "YYYY-MM-DD" — build as local date to avoid tz shifting
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function MarketingCalendar({ events, brands }: Props) {
  const today = new Date();
  const [view, setView] = useState<"upcoming" | "month">("upcoming");
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => { fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.items ?? [])).catch(() => {}); }, []);

  const brandMap = Object.fromEntries(brands.map((b: any) => [b.id, b]));

  function brandFor(ev: CalendarEvent) {
    return ev.brand_id != null ? brandMap[ev.brand_id] : null;
  }

  // Dated campaigns (from the Campaigns tab) become calendar events too, coloured by brand.
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const brandIdByName = (name: string) => {
    const n = norm(name); if (!n) return null;
    const hit = brands.find((b: any) => { const bn = norm(b.name); return bn && (bn === n || bn.startsWith(n) || n.startsWith(bn)); });
    return hit ? hit.id : null;
  };
  const campaignEvents: any[] = campaigns
    .filter(c => /^\d{4}-\d{2}-\d{2}/.test(c.key_date || ""))
    .map(c => ({ uid: `campaign-${c.id}`, title: c.campaign || "Campaign", description: c.brief?.oneLiner || c.note || "", location: "", start_date: c.key_date.slice(0, 10), end_date: c.key_date.slice(0, 10), all_day: true, brand_id: brandIdByName(c.brand), _isCampaign: true }));
  // Drop personal/travel noise that syncs in from the shared Apple Calendar.
  const isPersonal = (e: any) => /^\s*(flight|hotel|booking|boarding|check.?in|itinerary|car hire|rental)\b|booking number/i.test(`${e.title || ""} ${e.description || ""}`);
  const allEvents = [...events, ...campaignEvents].filter(e => !isPersonal(e));

  // Normalize event date ranges
  const normalized = allEvents
    .filter(e => e.start_date)
    .map(e => {
      const start = parseLocalDate(e.start_date);
      // iCal all-day DTEND is exclusive — subtract a day for display
      let end = e.end_date ? parseLocalDate(e.end_date) : start;
      if (e.all_day && e.end_date) end = new Date(end.getTime() - 86400000);
      if (end < start) end = start;
      return { ...e, _start: start, _end: end };
    });

  // ── Upcoming list ──────────────────────────────────────────────────
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = normalized
    .filter(e => e._end >= startOfToday)
    .sort((a, b) => a._start.getTime() - b._start.getTime());

  const active = upcoming.filter(e => e._start <= startOfToday && e._end >= startOfToday);
  const future = upcoming.filter(e => e._start > startOfToday);

  function fmtRange(e: typeof normalized[number]) {
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    const s = e._start.toLocaleDateString("en-AU", opts);
    if (e._end.getTime() === e._start.getTime()) return s;
    return `${s} – ${e._end.toLocaleDateString("en-AU", opts)}`;
  }

  function EventRow({ e }: { e: typeof normalized[number] }) {
    const brand = brandFor(e);
    const color = brand?.color ?? "#94a3b8";
    return (
      <div className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
        <div className="w-1 rounded-full self-stretch flex-shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">{e.title}</span>
            {brand && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
                {brand.name}
              </span>
            )}
            {(e as any)._isCampaign && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">Campaign</span>}
          </div>
          {e.location && <p className="text-[11px] text-gray-400 mt-0.5">📍 {e.location}</p>}
          {e.description && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{e.description}</p>}
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 mt-0.5">{fmtRange(e)}</span>
      </div>
    );
  }

  // ── Month grid ─────────────────────────────────────────────────────
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function eventsOnDay(day: Date) {
    return normalized.filter(e => day >= e._start && day <= e._end)
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }

  if (allEvents.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">📅</div>
        <p className="text-gray-600 font-medium">No campaigns synced yet</p>
        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
          Share your Apple Calendar publicly, add the URL to <code className="bg-gray-100 px-1 rounded">stores.config.json</code>,
          then run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_calendar.py</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Marketing Calendar</h2>
          <p className="text-xs text-gray-400 mt-0.5">Apple Calendar + dated campaigns · {allEvents.length} events</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["upcoming", "month"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition ${view === v ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "upcoming" ? (
        <div className="space-y-4">
          {active.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-2.5 border-b border-gray-50 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Running Now</span>
              </div>
              <div className="divide-y divide-gray-50">
                {active.map(e => <EventRow key={e.uid} e={e} />)}
              </div>
            </div>
          )}

          {CATEGORIES.map(cat => {
            const list = future.filter(e => categorize(e.title, (e as any)._isCampaign) === cat.id);
            if (!list.length) return null;
            return (
              <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-2.5 border-b border-gray-50 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{cat.label}</span>
                  <span className="text-[11px] text-gray-300 ml-auto">{list.length}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {list.map(e => <EventRow key={e.uid} e={e} />)}
                </div>
              </div>
            );
          })}
          {future.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-6 text-sm text-gray-400 text-center">No upcoming events scheduled</div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">‹</button>
            <h3 className="text-sm font-semibold text-gray-800">{MONTHS[month]} {year}</h3>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="min-h-[72px] rounded-lg bg-gray-50/40" />;
              const isToday = day.toDateString() === today.toDateString();
              const dayEvents = eventsOnDay(day);
              return (
                <div key={i} className={`min-h-[72px] rounded-lg border p-1.5 ${isToday ? "border-indigo-300 bg-indigo-50/30" : "border-gray-100"}`}>
                  <div className={`text-[11px] font-semibold mb-1 ${isToday ? "text-indigo-600" : "text-gray-400"}`}>{day.getDate()}</div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(e => {
                      const brand = brandFor(e);
                      const color = brand?.color ?? "#94a3b8";
                      return (
                        <div key={e.uid} className="text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium" style={{ background: `${color}18`, color }} title={e.title}>
                          {e.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && <div className="text-[9px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
