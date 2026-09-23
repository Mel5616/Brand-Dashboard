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
// A soft, distinguishable colour per person, stable across renders — not
// meaningful, just so five people off the same week don't blur together.
const PERSON_COLORS = ["#0e7490", "#9e2f72", "#b45309", "#15803d", "#4338ca", "#be123c", "#0369a1", "#a21caf"];
function colorFor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length];
}

export function StaffCalendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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

  const entriesFor = (day: Date) => {
    const iso = isoDate(day);
    return entries.filter(e => e.start_date <= iso && e.end_date >= iso);
  };

  const people = useMemo(() => Array.from(new Set(entries.map(e => e.name))).sort(), [entries]);
  const today = isoDate(new Date());

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

      {people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {people.map(name => (
            <span key={name} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: `${colorFor(name)}18`, color: colorFor(name) }}>
              <span className="w-2 h-2 rounded-full" style={{ background: colorFor(name) }} />
              {name}
            </span>
          ))}
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
                  {dayEntries.slice(0, 3).map(e => (
                    <div key={e.id} className="text-[10.5px] font-semibold rounded px-1.5 py-0.5 truncate" style={{ background: `${colorFor(e.name)}18`, color: colorFor(e.name) }} title={`${e.name}${e.policy_name ? ` · ${e.policy_name}` : ""}`}>
                      {e.name}
                    </div>
                  ))}
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
                {dayEntries.map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(e.name) }} />
                    <span className="font-semibold text-slate-700">{e.name}</span>
                    {e.policy_name && <span className="text-gray-400">· {e.policy_name}</span>}
                    <span className="text-gray-400 text-xs ml-auto">{e.start_date === e.end_date ? "1 day" : `${e.start_date} – ${e.end_date}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {loading && <p className="text-xs text-gray-400 text-center">Loading…</p>}
    </div>
  );
}
