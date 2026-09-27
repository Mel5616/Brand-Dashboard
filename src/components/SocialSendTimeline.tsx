"use client";

import { useEffect, useState } from "react";

// Send timeline (top of Owned & Earned > Social) — every social draft across
// the portfolio, scheduled and recently posted, on one list. Mirrors the
// email send timeline exactly. "Posted" is a manual status (no platform
// publishes automatically), so "Recent" reflects what's been marked done,
// not a live feed.
type Item = {
  id: string; brand_id: number; brand_name: string; brand_color: string;
  platform: string; format: string | null; caption: string | null; hashtags: string | null;
  campaign_name: string | null; status: string; when: string; is_future: boolean;
};

const STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved", posted: "Posted" };
const STATUS_STYLE: Record<string, string> = { draft: "bg-amber-50 text-amber-600", approved: "bg-sky-50 text-sky-600", posted: "bg-emerald-50 text-emerald-600" };
const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", pinterest: "Pinterest" };
const fmtWhen = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const truncate = (s: string | null, n: number) => (!s ? "" : s.length > n ? s.slice(0, n).trim() + "…" : s);

export function SocialSendTimeline() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");

  useEffect(() => {
    fetch("/api/social/send-timeline").then(r => r.json()).then(j => {
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
          <p className="font-medium">{truncate(i.caption, 90) || <span className="text-gray-300 italic">No caption yet</span>}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {PLATFORM_LABEL[i.platform] || i.platform}{i.format ? ` · ${i.format}` : ""}{i.campaign_name ? ` · ${i.campaign_name}` : ""}
          </p>
        </td>
        <td className="py-2.5 pr-4 whitespace-nowrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_STYLE[i.status] || "bg-slate-50 text-slate-500"}`}>
            {STATUS_LABEL[i.status] || i.status}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Send timeline</h2>
          <p className="text-sm text-slate-500">Every social draft across the portfolio, scheduled and recently posted. "Posted" is marked by hand, nothing publishes automatically.</p>
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
          <p className="text-sm text-slate-400 px-4 pb-4">Nothing scheduled.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <div className="px-4 pt-3 pb-1"><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Recent (last 14 days)</p></div>
        {recent.length ? (
          <table className="w-full text-sm border-collapse">
            <tbody>{recent.map(i => <Row key={i.id} i={i} />)}</tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400 px-4 pb-4">Nothing posted in the last 14 days.</p>
        )}
      </div>
    </section>
  );
}
