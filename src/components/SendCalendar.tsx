"use client";
import { useEffect, useMemo, useState } from "react";

// Portfolio send calendar: every Klaviyo email campaign scheduled or sent in
// the window, across every brand, grouped by day. The point is the clash:
// two brands landing in the same shared inboxes on the same day shows up as
// two rows under one date before either has gone.
type Row = { brand_id: number; campaign_id: string; name: string; status: string | null; send_time: string | null; sent_at: string | null; subject: string | null; audiences: string | null; recipients: number | null; open_rate: number | null; revenue: number | null };
type Brand = { id: number; name: string; color?: string };
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne" });

export function SendCalendar({ brands }: { brands: Brand[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSent, setShowSent] = useState(false);
  useEffect(() => { fetch("/api/klaviyo/campaign-calendar").then(r => r.json()).then(j => { if (j.ok) { setRows(j.items || []); setNeedsSetup(!!j.needsSetup); } }).catch(() => {}); }, []);
  const brand = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands]);
  const groups = useMemo(() => {
    const now = Date.now();
    const list = rows.filter(r => r.send_time || r.sent_at).map(r => ({ ...r, when: (r.send_time || r.sent_at) as string })).filter(r => showSent || new Date(r.when).getTime() >= now - 86400000 || (r.status || "").toLowerCase() === "scheduled");
    const m = new Map<string, typeof list>();
    list.sort((a, b) => a.when.localeCompare(b.when)).forEach(r => { const k = dayKey(r.when); m.set(k, [...(m.get(k) || []), r]); });
    return [...m.entries()];
  }, [rows, showSent]);
  const clashes = groups.filter(([, rs]) => new Set(rs.map(r => r.brand_id)).size > 1).length;

  if (needsSetup) return <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">The send calendar needs <code className="text-xs bg-white px-1 py-0.5 rounded">supabase/add_klaviyo_flow_metrics_and_campaigns.sql</code> run in Supabase, then it fills from the nightly Klaviyo sync.</div>;

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Portfolio send calendar</h2>
          <p className="text-sm text-slate-500">Every scheduled Klaviyo campaign across all brands, from each brand&apos;s own account. {clashes > 0 ? <span className="text-amber-700 font-medium">{clashes} day{clashes === 1 ? "" : "s"} with more than one brand sending.</span> : "No days with two brands sending."}</p>
        </div>
        <label className="text-sm text-slate-500 flex items-center gap-2"><input type="checkbox" checked={showSent} onChange={e => setShowSent(e.target.checked)} /> Show last 30 days</label>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">Nothing scheduled yet. Campaigns appear here once they&apos;re scheduled in Klaviyo and the nightly sync has run.</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {groups.map(([day, rs]) => {
            const clash = new Set(rs.map(r => r.brand_id)).size > 1;
            return (
              <div key={day} className={`px-4 py-3 ${clash ? "bg-amber-50/60" : ""}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{day}{clash && <span className="ml-2 text-amber-700">· {new Set(rs.map(r => r.brand_id)).size} brands</span>}</p>
                <div className="space-y-1.5">
                  {rs.map(r => {
                    const b = brand.get(r.brand_id); const st = (r.status || "").toLowerCase();
                    return (
                      <div key={r.campaign_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 min-w-[130px]"><span className="w-2 h-2 rounded-full" style={{ background: b?.color || "#94a3b8" }} />{b?.name || r.brand_id}</span>
                        <span className="text-slate-400 tabular-nums">{timeOf(r.when)}</span>
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${st === "scheduled" ? "bg-blue-50 text-blue-700" : st === "sent" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status || "—"}</span>
                        <span className="text-slate-700">{r.subject || r.name}</span>
                        {r.audiences && <span className="text-slate-400 text-xs">→ {r.audiences}</span>}
                        {st === "sent" && r.recipients != null && <span className="text-slate-400 text-xs tabular-nums">{r.recipients.toLocaleString()} sent · {Math.round(r.open_rate || 0)}% open · ${Math.round(r.revenue || 0).toLocaleString()}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
