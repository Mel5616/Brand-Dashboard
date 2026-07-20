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

  // Past-event benchmark: what a Tune-Up day usually fills to by event day.
  const pastWithCap = past.filter(e => (e.capacity || 0) > 0);
  const pastAvgFill = pastWithCap.length
    ? Math.round((pastWithCap.reduce((s, e) => s + e.tickets_sold / e.capacity!, 0) / pastWithCap.length) * 100)
    : null;

  const kpis = [
    { label: "Upcoming events", value: String(upcoming.length), accent: "#0e7490" },
    { label: "Tickets sold", value: ticketsSold.toLocaleString(), accent: "#14b8a6" },
    { label: "Ticket revenue", value: fmt(revenue), accent: "#0ea5e9" },
    { label: "Capacity filled", value: fillPct != null ? fillPct + "%" : "—", accent: "#06b6d4" },
    { label: "Past events avg fill", value: pastAvgFill != null ? pastAvgFill + "%" : "—", accent: "#8b5cf6" },
  ];

  // Fill risk for upcoming events: how full vs how soon.
  const daysTo = (e: EventbriteEvent) => Math.max(0, Math.ceil((parse(e.start_at) - now) / 86400_000));
  const riskOf = (e: EventbriteEvent): "soldout" | "high" | "watch" | "ok" | null => {
    if (!e.capacity) return null;
    const p = e.tickets_sold / e.capacity;
    if (p >= 1) return "soldout";
    const d = daysTo(e);
    if (d <= 10 && p < 0.6) return "high";
    if (d <= 21 && p < 0.5) return "watch";
    return "ok";
  };
  const RISK: Record<string, { label: string; cls: string }> = {
    soldout: { label: "SOLD OUT", cls: "bg-slate-800 text-white" },
    high: { label: "needs push", cls: "bg-rose-100 text-rose-600" },
    watch: { label: "watch", cls: "bg-amber-100 text-amber-700" },
  };
  const atRisk = upcoming.filter(e => ["high", "watch"].includes(riskOf(e) || "")).sort((a, b) => parse(a.start_at) - parse(b.start_at));

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

  // Upcoming Tune-Up Days grouped into month cards (chronological).
  const shortDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
  const monthKeyOf = (s: string | null) => { const d = s ? new Date(s) : null; return d && !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "9999-99"; };
  const monthLabelOf = (s: string | null) => { const d = s ? new Date(s) : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "Undated"; };
  // Only actual Tune-Up Days belong in the monthly cards; other events (launches,
  // brand events like Nobody Told Me) get their own list below.
  const isTuneUp = (e: EventbriteEvent) => /tune[-\s]?up/i.test(e.name || "");
  const otherUpcoming = upcoming.filter(e => !isTuneUp(e));
  const byMonth = new Map<string, EventbriteEvent[]>();
  for (const e of upcoming.filter(isTuneUp)) {
    const k = monthKeyOf(e.start_at);
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(e);
  }
  const monthCards = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const MiniRow = (e: EventbriteEvent) => {
    const pct = e.capacity ? Math.min(100, Math.round((e.tickets_sold / e.capacity) * 100)) : null;
    const risk = riskOf(e);
    const barCol = risk === "high" ? "#f43f5e" : risk === "watch" ? "#f59e0b" : pct != null && pct >= 90 ? "#10b981" : "#3b82f6";
    const inner = (
      <div className="py-2">
        <div className="flex items-center gap-3">
          <div className="w-12 shrink-0">
            <p className="text-[11px] text-gray-400 font-medium">{shortDate(e.start_at)}</p>
            <p className="text-[9.5px] text-gray-300">{daysTo(e)}d out</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-slate-700 truncate">
              {(e.name || "Event").replace(/^Tune[-\s]?Up Day\s*[-–]\s*/i, "")}
              {risk && RISK[risk] && <span className={`ml-1.5 align-middle text-[9px] font-bold rounded px-1 py-0.5 ${RISK[risk].cls}`}>{RISK[risk].label}</span>}
            </p>
            <p className="text-[10px] text-gray-400 truncate">{[e.state, e.venue].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-gray-400">{pct != null ? `${e.tickets_sold}/${e.capacity} · ${pct}%` : `${e.tickets_sold} sold`}</p>
            <p className="text-[13px] font-semibold text-slate-800 leading-tight">{fmt(e.gross_revenue || 0)}</p>
          </div>
        </div>
        {pct != null && (
          <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1 ml-[60px]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barCol }} />
            {pastAvgFill != null && <div className="absolute top-0 h-full w-px bg-slate-400" style={{ left: `${Math.min(100, pastAvgFill)}%` }} title={`Past events average: ${pastAvgFill}%`} />}
          </div>
        )}
      </div>
    );
    return e.url
      ? <a key={e.event_id} href={e.url} target="_blank" rel="noopener noreferrer" className="block px-2 -mx-2 rounded-lg hover:bg-gray-50/70 transition-colors">{inner}</a>
      : <div key={e.event_id}>{inner}</div>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: k.accent }} />{k.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Events that need marketing attention: close to the date, under-filled */}
      {atRisk.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500 mb-1.5">🔔 Needs a push · {atRisk.length}</p>
          <div className="flex flex-wrap gap-2">
            {atRisk.map(e => {
              const pct = e.capacity ? Math.round((e.tickets_sold / e.capacity) * 100) : 0;
              const hi = riskOf(e) === "high";
              const chip = (
                <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-full px-2.5 py-1 ${hi ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                  {(e.name || "Event").replace(/^Tune[-\s]?Up Day\s*[-–]\s*/i, "")}
                  <span className="font-normal opacity-70">{pct}% · {daysTo(e)}d out</span>
                </span>
              );
              return e.url ? <a key={e.event_id} href={e.url} target="_blank" rel="noopener noreferrer">{chip}</a> : <span key={e.event_id}>{chip}</span>;
            })}
          </div>
          <p className="text-[10.5px] text-gray-400 mt-1.5">Under 60% filled within 10 days (red) or under 50% within 3 weeks (amber) — worth an EDM or social nudge to the local audience.</p>
        </div>
      )}

      {/* Fill by state — where the tickets are and aren't selling */}
      {(() => {
        const byState = new Map<string, { sold: number; cap: number; n: number }>();
        for (const e of upcoming) {
          const st = (e as any).state || "—";
          if (!e.capacity) continue;
          const cur = byState.get(st) ?? { sold: 0, cap: 0, n: 0 };
          cur.sold += e.tickets_sold || 0; cur.cap += e.capacity || 0; cur.n++;
          byState.set(st, cur);
        }
        const rows = [...byState.entries()].filter(([s]) => s !== "—").sort((a, b) => b[1].cap - a[1].cap);
        if (rows.length < 2) return null;
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Upcoming fill by state</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {rows.map(([st, v]) => {
                const p = Math.round((v.sold / v.cap) * 100);
                return (
                  <div key={st} className="flex items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-slate-600 w-9">{st}</span>
                    <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-3 rounded-full" style={{ width: `${p}%`, background: p >= 70 ? "#10b981" : p >= 50 ? "#3b82f6" : "#f59e0b" }} />
                    </div>
                    <span className="text-[11px] text-gray-400 w-24 text-right">{v.sold}/{v.cap} · {p}% · {v.n} ev</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Upcoming Tune-Up Days by month</h3>
          <div className="grid md:grid-cols-2 gap-4 items-start">
            {monthCards.map(([key, list]) => {
              const sold = list.reduce((s, e) => s + (e.tickets_sold || 0), 0);
              const cap = list.reduce((s, e) => s + (e.capacity || 0), 0);
              const pct = cap > 0 ? Math.round((sold / cap) * 100) : null;
              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">{monthLabelOf(list[0].start_at)}</span>
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

      {otherUpcoming.length > 0 && (
        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600 mb-1">🎉 Other upcoming events</h3>
          <div className="divide-y divide-gray-50">{otherUpcoming.map(Row)}</div>
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
