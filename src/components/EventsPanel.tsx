"use client";

import type { EventbriteEvent } from "@/lib/db";
import { fmt } from "@/lib/format";

// Eventbrite events with ticket/attendee data — upcoming and past, with a KPI summary.
export function EventsPanel({ events, brands }: { events: EventbriteEvent[]; brands: { id: number; name: string; color?: string }[] }) {
  if (!events.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-500 font-medium">No events yet</p>
        <p className="text-xs text-gray-400 mt-1">Events appear here once the Eventbrite sync has run. Run <code className="bg-gray-50 px-1 rounded">supabase/add_eventbrite_events.sql</code>, add <code className="bg-gray-50 px-1 rounded">eventbriteToken</code> to the config, then sync.</p>
      </div>
    );
  }

  const now = Date.now();
  const parse = (s: string | null) => (s ? Date.parse(s) : 0);
  const upcoming = events.filter(e => parse(e.start_at) >= now).sort((a, b) => parse(a.start_at) - parse(b.start_at));
  const past = events.filter(e => parse(e.start_at) < now).sort((a, b) => parse(b.start_at) - parse(a.start_at));

  const ticketsSold = events.reduce((s, e) => s + (e.tickets_sold || 0), 0);
  const revenue = events.reduce((s, e) => s + (e.gross_revenue || 0), 0);
  const cap = events.reduce((s, e) => s + (e.capacity || 0), 0);
  const fillPct = cap > 0 ? Math.round((ticketsSold / cap) * 100) : null;

  const kpis = [
    { label: "Upcoming events", value: String(upcoming.length), accent: "#1e3a5f" },
    { label: "Tickets sold", value: ticketsSold.toLocaleString(), accent: "#10b981" },
    { label: "Ticket revenue", value: fmt(revenue), accent: "#f97316" },
    { label: "Capacity filled", value: fillPct != null ? fillPct + "%" : "—", accent: "#a855f7" },
  ];

  const dateOf = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const brandOf = (id: number | null) => id == null ? null : brands.find(b => b.id === id);

  const Row = (e: EventbriteEvent) => {
    const pct = e.capacity ? Math.min(100, Math.round((e.tickets_sold / e.capacity) * 100)) : null;
    const b = brandOf(e.brand_id);
    const card = (
      <div className="flex items-center gap-4 py-3">
        <div className="w-20 shrink-0 text-xs text-gray-400 font-medium">{dateOf(e.start_at)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">{e.name || "Event"}</p>
          <p className="text-[11px] text-gray-400 truncate">{[e.venue, b?.name].filter(Boolean).join(" · ") || (e.status ?? "")}</p>
        </div>
        <div className="w-40 shrink-0">
          {pct != null ? (
            <>
              <div className="flex justify-between text-[10px] text-gray-400 mb-0.5"><span>{e.tickets_sold.toLocaleString()} / {e.capacity?.toLocaleString()}</span><span>{pct}%</span></div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "#10b981" : "#3b82f6" }} /></div>
            </>
          ) : <span className="text-[11px] text-gray-400">{e.tickets_sold.toLocaleString()} sold</span>}
        </div>
        <div className="w-24 shrink-0 text-right text-sm font-semibold text-slate-800">{fmt(e.gross_revenue || 0)}</div>
      </div>
    );
    return e.url
      ? <a key={e.event_id} href={e.url} target="_blank" rel="noopener noreferrer" className="block px-2 -mx-2 rounded-lg hover:bg-gray-50/70 transition-colors">{card}</a>
      : <div key={e.event_id}>{card}</div>;
  };

  // Upcoming Tune-Up Days grouped into state cards.
  const STATE_ORDER = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
  const shortDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
  const byState = new Map<string, EventbriteEvent[]>();
  for (const e of upcoming) {
    const k = (e.state && e.state.trim()) || "Other";
    (byState.get(k) ?? byState.set(k, []).get(k)!).push(e);
  }
  const stateCards = [...byState.entries()].sort((a, b) => {
    const ai = STATE_ORDER.indexOf(a[0]), bi = STATE_ORDER.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b[1].length - a[1].length;
  });

  const MiniRow = (e: EventbriteEvent) => {
    const pct = e.capacity ? Math.min(100, Math.round((e.tickets_sold / e.capacity) * 100)) : null;
    const inner = (
      <div className="flex items-center gap-3 py-2">
        <div className="w-12 shrink-0 text-[11px] text-gray-400 font-medium">{shortDate(e.start_at)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-700 truncate">{(e.name || "Event").replace(/^Tune[-\s]?Up Day\s*[-–]\s*/i, "")}</p>
          {pct != null && <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "#10b981" : "#3b82f6" }} /></div>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-gray-400">{pct != null ? `${e.tickets_sold}/${e.capacity} · ${pct}%` : `${e.tickets_sold} sold`}</p>
          <p className="text-[13px] font-semibold text-slate-800 leading-tight">{fmt(e.gross_revenue || 0)}</p>
        </div>
      </div>
    );
    return e.url
      ? <a key={e.event_id} href={e.url} target="_blank" rel="noopener noreferrer" className="block px-2 -mx-2 rounded-lg hover:bg-gray-50/70 transition-colors">{inner}</a>
      : <div key={e.event_id}>{inner}</div>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: k.accent }} />{k.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Upcoming Tune-Up Days by state</h3>
          <div className="grid md:grid-cols-2 gap-4 items-start">
            {stateCards.map(([st, list]) => {
              const sold = list.reduce((s, e) => s + (e.tickets_sold || 0), 0);
              const cap = list.reduce((s, e) => s + (e.capacity || 0), 0);
              const pct = cap > 0 ? Math.round((sold / cap) * 100) : null;
              return (
                <div key={st} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white rounded-md px-2 py-0.5" style={{ background: "#1e3a5f" }}>{st}</span>
                      <span className="text-xs font-medium text-gray-400">{list.length} {list.length === 1 ? "day" : "days"}</span>
                    </div>
                    {pct != null && <span className="text-[11px] text-gray-400">{sold.toLocaleString()}/{cap.toLocaleString()} · {pct}%</span>}
                  </div>
                  <div className="divide-y divide-gray-50">{list.map(MiniRow)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Past events</h3>
          <div className="divide-y divide-gray-50">{past.map(Row)}</div>
        </div>
      )}
    </div>
  );
}
