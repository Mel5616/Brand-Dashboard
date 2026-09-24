"use client";

import { useEffect, useMemo, useState } from "react";

// Operations > Staff — who's off, in one place. Read-only mirror of
// Connecteam's approved time-off, synced by scripts/sync_connecteam.py.
// A month calendar (not the Timeline) because "who's off this week" is a
// day-by-day question, not a date-range bar.
type Entry = { id: number; connecteam_user_id: string; name: string; start_date: string; end_date: string; type: string; policy_name: string | null; note: string | null };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// Coloured by leave category, not by person — the question this calendar
// answers is "who's off and why", so sick/time off/unpaid needs to read at a
// glance, not just whose name it is. These are Connecteam's own configured
// policy names (checked against the real synced data, 23 Sep 2026) — there's
// no separate "Annual" or "Personal" policy on their side, "Time Off" is the
// catch-all for both. A policy name outside this list still shows, just in
// the neutral fallback colour, rather than being hidden.
const TYPE_META: Record<string, { label: string; color: string }> = {
  "Sick leave": { label: "Sick", color: "#b91c1c" },
  "Time Off": { label: "Time off", color: "#0369a1" },
  "Unpaid Leave": { label: "Unpaid", color: "#a16207" },
};
const FALLBACK_TYPE = { label: "Off", color: "#6b7280" };
const typeFor = (policyName: string | null) => (policyName && TYPE_META[policyName]) || FALLBACK_TYPE;

export function StaffCalendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set(Object.keys(TYPE_META)));

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Pull a little padding either side so entries spanning the month boundary still show.
  const rangeFrom = isoDate(new Date(year, month, 1 - startWeekday - 7));
  const rangeTo = isoDate(new Date(year, month + 1, 7));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/staff-time-off?from=${rangeFrom}&to=${rangeTo}`).then(r => r.json()).then(res => {
      setLoading(false);
      if (!res.ok) return;
      setNeedsSetup(!!res.needsSetup);
      setEntries(res.items || []);
    }).catch(() => setLoading(false));
  }, [rangeFrom, rangeTo]);

  const cells: (Date | null)[] = useMemo(() => {
    const out: (Date | null)[] = Array(startWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    return out;
  }, [year, month, startWeekday, daysInMonth]);

  // Any policy name actually present in the synced data, real names first
  // (in TYPE_META's order), then anything unexpected appended after.
  const typesPresent = useMemo(() => {
    const seen = new Set(entries.map(e => e.policy_name || FALLBACK_TYPE.label));
    return [...Object.keys(TYPE_META), ...[...seen].filter(t => !TYPE_META[t])].filter(t => seen.has(t));
  }, [entries]);

  const entriesFor = (day: Date) => {
    const iso = isoDate(day);
    return entries.filter(e => e.start_date <= iso && e.end_date >= iso && typeFilter.has(e.policy_name || FALLBACK_TYPE.label));
  };

  const today = isoDate(new Date());
  function toggleType(t: string) {
    setTypeFilter(prev => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next; });
  }

  if (needsSetup) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
        Staff isn&apos;t synced yet — run <code className="text-xs bg-white px-1 py-0.5 rounded">supabase/add_staff_time_off.sql</code>, then <code className="text-xs bg-white px-1 py-0.5 rounded">scripts/sync_connecteam.py</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 flex items-center justify-center">‹</button>
          <p className="text-base font-bold text-slate-800 w-40 text-center">{MONTH_NAMES[month]} {year}</p>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 flex items-center justify-center">›</button>
        </div>
        <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">Today</button>
      </div>

      {typesPresent.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typesPresent.map(t => {
            const meta = TYPE_META[t] || { ...FALLBACK_TYPE, label: t };
            const on = typeFilter.has(t);
            return (
              <button key={t} onClick={() => toggleType(t)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border transition-opacity"
                style={{ background: on ? `${meta.color}18` : "#fff", color: on ? meta.color : "#9ca3af", borderColor: on ? `${meta.color}40` : "#e5e7eb" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: on ? meta.color : "#d1d5db" }} />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {WEEKDAYS.map(w => <div key={w} className="text-[11px] font-bold uppercase tracking-wide text-gray-400 text-center py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[92px] border-b border-r border-gray-50 bg-gray-50/30" />;
            const iso = isoDate(day);
            const dayEntries = entriesFor(day);
            const isToday = iso === today;
            return (
              <button key={i} onClick={() => setSelected(iso)}
                className={`min-h-[92px] border-b border-r border-gray-50 p-1.5 text-left align-top hover:bg-gray-50/60 transition-colors ${selected === iso ? "ring-2 ring-inset ring-emerald-400" : ""}`}>
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${isToday ? "bg-emerald-500 text-white" : "text-gray-500"}`}>{day.getDate()}</span>
                <div className="mt-1 space-y-0.5">
                  {dayEntries.slice(0, 3).map(e => {
                    const meta = typeFor(e.policy_name);
                    return (
                      <div key={e.id} className="text-[10.5px] font-semibold rounded px-1.5 py-0.5 truncate" style={{ background: `${meta.color}18`, color: meta.color }} title={`${e.name} · ${e.policy_name || meta.label}`}>
                        {e.name}
                      </div>
                    );
                  })}
                  {dayEntries.length > 3 && <div className="text-[10px] text-gray-400 px-1.5">+{dayEntries.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (() => {
        const day = new Date(selected + "T00:00:00");
        const dayEntries = entriesFor(day);
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-700">{day.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
            </div>
            {dayEntries.length === 0 ? (
              <p className="text-sm text-gray-400">Nobody off this day.</p>
            ) : (
              <div className="space-y-1.5">
                {dayEntries.map(e => {
                  const meta = typeFor(e.policy_name);
                  return (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="text-[9.5px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0" style={{ background: `${meta.color}18`, color: meta.color }}>{e.policy_name || meta.label}</span>
                      <span className="font-semibold text-slate-700">{e.name}</span>
                      <span className="text-gray-400 text-xs ml-auto">{e.start_date === e.end_date ? "1 day" : `${e.start_date} – ${e.end_date}`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {loading && <p className="text-xs text-gray-400 text-center">Loading…</p>}
    </div>
  );
}
