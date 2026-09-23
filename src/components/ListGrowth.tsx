"use client";
import { useEffect, useMemo, useState } from "react";

// List growth by source (Email → Performance): weekly subscribes per Klaviyo
// list, per brand, last 12 weeks. Each list is a door into the database —
// newsletter popup, hospital-bag checklist gate, giveaway, product
// registration — so this is what's actually growing each brand and how.
type Row = { brand_id: number; week_start: string; list_name: string; subscribes: number; unsubscribes: number };
type Brand = { id: number; name: string; color?: string };
const wk = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export function ListGrowth({ brands, brandFilter = "all" }: { brands: Brand[]; brandFilter?: number | "all" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [openState, setOpen] = useState<number | null>(null);
  const open = typeof brandFilter === "number" ? brandFilter : openState; // a single-brand filter is always expanded
  useEffect(() => { fetch("/api/klaviyo/list-growth").then(r => r.json()).then(j => { if (j.ok) { setRows(j.items || []); setNeedsSetup(!!j.needsSetup); } }).catch(() => {}); }, []);
  const weeks = useMemo(() => [...new Set(rows.map(r => r.week_start))].sort(), [rows]);
  const perBrand = useMemo(() => brands.filter(b => brandFilter === "all" || b.id === brandFilter).map(b => {
    const mine = rows.filter(r => r.brand_id === b.id);
    const byWeek = weeks.map(w => mine.filter(r => r.week_start === w).reduce((s, r) => s + r.subscribes, 0));
    const last4 = byWeek.slice(-4).reduce((s, n) => s + n, 0), prev4 = byWeek.slice(-8, -4).reduce((s, n) => s + n, 0);
    const lists = [...mine.reduce<Map<string, { subs: number; unsubs: number; recent: number }>>((m, r) => { const c = m.get(r.list_name) || { subs: 0, unsubs: 0, recent: 0 }; c.subs += r.subscribes; c.unsubs += r.unsubscribes; if (weeks.slice(-4).includes(r.week_start)) c.recent += r.subscribes; m.set(r.list_name, c); return m; }, new Map()).entries()].sort((a, c) => c[1].subs - a[1].subs);
    return { b, byWeek, total: byWeek.reduce((s, n) => s + n, 0), last4, prev4, lists };
  }).filter(x => x.total > 0).sort((a, c) => c.last4 - a.last4), [brands, rows, weeks, brandFilter]);

  if (needsSetup) return <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">List growth needs <code className="text-xs bg-white px-1 py-0.5 rounded">supabase/add_reviews_email_upgrade.sql</code> run in Supabase, then it fills from the next Klaviyo sync.</div>;
  if (!rows.length) return null;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">List growth by source</h2>
          <p className="text-sm text-slate-500">New list subscribes per week, last 12 weeks, from each brand&apos;s own Klaviyo. Each list is a signup door: popup, checklist gate, giveaway, registration. Click a brand for the split.</p>
        </div>
        <p className="text-[11px] text-slate-400">{weeks.length ? `${wk(weeks[0])} → ${wk(weeks[weeks.length - 1])}` : ""}</p>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
        {perBrand.map(({ b, byWeek, last4, prev4, lists }) => {
          const max = Math.max(1, ...byWeek); const isOpen = open === b.id;
          const chg = prev4 > 0 ? Math.round(((last4 - prev4) / prev4) * 100) : null;
          return (
            <div key={b.id} className={`rounded-xl border bg-white px-3 py-2.5 ${isOpen ? "border-emerald-300 col-span-full" : "border-slate-200"}`}>
              <button onClick={() => setOpen(isOpen ? null : b.id)} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: b.color || "#94a3b8" }} />{b.name}</p>
                  <p className="text-sm tabular-nums"><span className="font-semibold text-slate-800">{last4.toLocaleString()}</span><span className="text-slate-400 text-xs"> last 4 wks</span>{chg != null && <span className={`text-xs ml-1.5 ${chg >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{chg >= 0 ? "+" : ""}{chg}%</span>}</p>
                </div>
                <div className="flex items-end gap-px h-8 mt-1.5">{byWeek.map((n, i) => <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, (n / max) * 100)}%`, background: b.color || "#94a3b8", opacity: i >= byWeek.length - 4 ? 0.9 : 0.4 }} title={`${wk(weeks[i])}: ${n}`} />)}</div>
              </button>
              {isOpen && (
                <table className="w-full text-xs mt-3">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400"><th className="text-left font-semibold py-1">List</th><th className="text-right font-semibold py-1">Last 4 wks</th><th className="text-right font-semibold py-1">12 wks</th><th className="text-right font-semibold py-1">Unsubs</th><th className="text-right font-semibold py-1">Share</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">{lists.map(([l, c]) => <tr key={l}><td className="py-1 text-slate-700">{l}</td><td className="py-1 text-right tabular-nums">{c.recent.toLocaleString()}</td><td className="py-1 text-right tabular-nums">{c.subs.toLocaleString()}</td><td className="py-1 text-right tabular-nums text-slate-400">{c.unsubs ? c.unsubs.toLocaleString() : "—"}</td><td className="py-1 text-right tabular-nums text-slate-500">{Math.round((c.subs / Math.max(1, lists.reduce((s, x) => s + x[1].subs, 0))) * 100)}%</td></tr>)}</tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
