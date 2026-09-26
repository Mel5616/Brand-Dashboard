"use client";

import { useEffect, useState } from "react";

// Send timeline (top of Email Marketing > Performance) — every real Klaviyo
// send across the portfolio, past and scheduled, on one list. Backed by
// klaviyo_campaigns (synced nightly). "Upcoming" is genuinely what's queued
// in Klaviyo right now, not a plan — if nothing's listed, nothing's actually
// scheduled to go out.
type Item = {
  id: string; brand_id: number; brand_name: string; brand_color: string;
  name: string; subject: string | null; audiences: string | null; status: string | null;
  when: string; is_future: boolean;
  recipients: number | null; open_rate: number | null; click_rate: number | null; revenue: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  Sent: "Sent", Sending: "Sending", Scheduled: "Scheduled",
  "Queued without Recipients": "Scheduled", Draft: "Draft", Cancelled: "Cancelled",
};
const fmtWhen = (s: string) => new Date(s).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Melbourne" });
const money = (n: number | null) => (n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString()}`);
const pct = (n: number | null) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);

export function EmailSendTimeline() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");

  useEffect(() => {
    fetch("/api/klaviyo/send-timeline").then(r => r.json()).then(j => {
      setLoading(false);
      if (!j.ok) return;
      setNeedsSetup(!!j.needsSetup);
      setItems(j.items || []);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) return null;

  const brands = [...new Map(items.map(i => [i.brand_id, { id: i.brand_id, name: i.brand_name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const shown = items.filter(i => brandFilter === "all" || i.brand_id === brandFilter);
  const upcoming = shown.filter(i => i.is_future).sort((a, b) => a.when.localeCompare(b.when));
  const recent = shown.filter(i => !i.is_future);

  function Row({ i }: { i: Item }) {
    return (
      <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 align-top">
        <td className="py-2.5 pl-4 pr-3 font-semibold text-slate-700 whitespace-nowrap text-xs">{fmtWhen(i.when)}</td>
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${i.brand_color}1a`, color: i.brand_color }}>{i.brand_name}</span>
        </td>
        <td className="py-2.5 px-3 text-slate-700">
          <p className="font-medium">{i.subject || i.name}</p>
          {i.audiences && <p className="text-[11px] text-gray-400 mt-0.5">{i.audiences}</p>}
        </td>
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${i.is_future ? "bg-sky-50 text-sky-600" : "bg-emerald-50 text-emerald-600"}`}>
            {i.status ? (STATUS_LABEL[i.status] || i.status) : (i.is_future ? "Scheduled" : "Sent")}
          </span>
        </td>
        <td className="py-2.5 pr-4 text-right text-xs text-slate-500 whitespace-nowrap tabular-nums">
          {i.is_future ? "—" : <>{i.recipients?.toLocaleString() ?? "—"} sent &middot; {pct(i.open_rate)} open &middot; {pct(i.click_rate)} click &middot; {money(i.revenue)}</>}
        </td>
      </tr>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Send timeline</h2>
          <p className="text-sm text-slate-500">Every real send across the portfolio, past and scheduled — from Klaviyo, not a plan.</p>
        </div>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
          <option value="all">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-4">
        <div className="px-4 pt-3 pb-1"><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Upcoming</p></div>
        {upcoming.length ? (
          <table className="w-full text-sm border-collapse">
            <tbody>{upcoming.map(i => <Row key={i.id} i={i} />)}</tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400 px-4 pb-4">Nothing scheduled in Klaviyo right now.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <div className="px-4 pt-3 pb-1"><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Recent (last 14 days)</p></div>
        {recent.length ? (
          <table className="w-full text-sm border-collapse">
            <tbody>{recent.map(i => <Row key={i.id} i={i} />)}</tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400 px-4 pb-4">No sends in the last 14 days.</p>
        )}
      </div>
    </section>
  );
}
