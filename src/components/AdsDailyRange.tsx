"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt, fmtFull } from "@/lib/format";

// Custom (daily) date-range view for Google / Meta Ads. Pulls day-level rows on
// demand from /api/ads-daily and shows range KPIs plus a per-day bar chart.
// The monthly whole-FY chart above is unchanged; this is the "any dates" view.

type Row = {
  brand_id: number; date: string; spend: number; impressions: number; clicks: number;
  revenue: number; purchases?: number; reach?: number;
};
type Metric = { id: string; label: string; kind: "money" | "count" | "ratio" };

const GOOGLE_METRICS: Metric[] = [
  { id: "spend", label: "Spend", kind: "money" },
  { id: "revenue", label: "Revenue", kind: "money" },
  { id: "roas", label: "ROAS", kind: "ratio" },
  { id: "clicks", label: "Clicks", kind: "count" },
  { id: "impressions", label: "Impressions", kind: "count" },
];
const META_METRICS: Metric[] = [
  ...GOOGLE_METRICS,
  { id: "purchases", label: "Purchases", kind: "count" },
  { id: "reach", label: "Reach", kind: "count" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const compact = (n: number) => n >= 1_000_000 ? (n / 1e6).toFixed(1) + "M" : n >= 1_000 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n));

export function AdsDailyRange({ platform, brandFilter, accent }:
  { platform: "google" | "meta"; brandFilter: "all" | number; accent: string }) {
  const metrics = platform === "meta" ? META_METRICS : GOOGLE_METRICS;
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => iso(new Date(today.getTime() - 29 * 864e5)));
  const [to, setTo] = useState(() => iso(today));
  const [metric, setMetric] = useState("spend");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    const b = brandFilter === "all" ? "all" : String(brandFilter);
    fetch(`/api/ads-daily?platform=${platform}&from=${from}&to=${to}&brand=${b}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (!live) return; if (d.needsSetup) setState("needsSetup"); else if (d.ok) { setRows(d.rows ?? []); setState("ready"); } else setState("error"); })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [platform, from, to, brandFilter]);

  // Range totals
  const tot = useMemo(() => {
    const t = { spend: 0, revenue: 0, clicks: 0, impressions: 0, purchases: 0, reach: 0 };
    for (const r of rows) {
      t.spend += r.spend || 0; t.revenue += r.revenue || 0; t.clicks += r.clicks || 0;
      t.impressions += r.impressions || 0; t.purchases += r.purchases || 0; t.reach += r.reach || 0;
    }
    return t;
  }, [rows]);
  const roas = tot.spend > 0 ? tot.revenue / tot.spend : 0;

  // Per-day series for the selected metric (summed across whatever brands are in scope)
  const byDay = useMemo(() => {
    const m = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number; purchases: number; reach: number }>();
    for (const r of rows) {
      const c = m.get(r.date) ?? { spend: 0, revenue: 0, clicks: 0, impressions: 0, purchases: 0, reach: 0 };
      c.spend += r.spend || 0; c.revenue += r.revenue || 0; c.clicks += r.clicks || 0;
      c.impressions += r.impressions || 0; c.purchases += r.purchases || 0; c.reach += r.reach || 0;
      m.set(r.date, c);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({
      date,
      value: metric === "roas" ? (v.spend > 0 ? v.revenue / v.spend : 0) : (v as any)[metric] ?? 0,
    }));
  }, [rows, metric]);

  const maxV = Math.max(0.0001, ...byDay.map(d => d.value));
  const mDef = metrics.find(m => m.id === metric)!;
  const fmtVal = (v: number, kind: string) => kind === "money" ? fmtFull(v) : kind === "ratio" ? v.toFixed(2) + "×" : Math.round(v).toLocaleString("en-AU");

  const kpis = [
    { label: "Spend", value: fmtFull(tot.spend) },
    { label: "Revenue", value: fmtFull(tot.revenue) },
    { label: "ROAS", value: roas.toFixed(2) + "×", good: true },
    { label: "Clicks", value: tot.clicks.toLocaleString("en-AU") },
    { label: "Impressions", value: compact(tot.impressions) },
    ...(platform === "meta" ? [
      { label: "Purchases", value: tot.purchases.toLocaleString("en-AU") },
      { label: "Reach", value: compact(tot.reach) },
    ] : []),
  ];

  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Custom date range <span className="font-normal text-gray-400 normal-case tracking-normal">· day by day</span></p>
          <p className="text-[11px] text-gray-400 mt-0.5">Pick any two dates. Totals and the chart below cover the selected window.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider flex flex-col gap-1">From
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider flex flex-col gap-1">To
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {[
          { label: "Last 7 days", d: 7 }, { label: "Last 14 days", d: 14 },
          { label: "Last 30 days", d: 30 }, { label: "Last 90 days", d: 90 },
        ].map(p => (
          <button key={p.d} onClick={() => { const t = new Date(); setTo(iso(t)); setFrom(iso(new Date(t.getTime() - (p.d - 1) * 864e5))); }}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition">
            {p.label}
          </button>
        ))}
      </div>

      {state === "needsSetup" ? (
        <p className="text-sm text-gray-400 py-6 text-center">Daily data isn&apos;t available yet — it appears after the next sync once the daily tables are set up.</p>
      ) : state === "error" ? (
        <p className="text-sm text-rose-500 py-6 text-center">Couldn&apos;t load daily data. Try again.</p>
      ) : (
        <>
          {/* Metric toggle */}
          <div className="inline-flex flex-wrap rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold mb-4">
            {metrics.map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-md transition ${metric === m.id ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Range KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5">
            {kpis.map(k => (
              <div key={k.label} className="bg-gray-50/70 rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">{k.label}</p>
                <p className={`text-lg font-bold leading-none mt-1 ${k.good ? "text-emerald-600" : "text-slate-800"}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Per-day bars */}
          {state === "loading" ? (
            <div className="h-40 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : byDay.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-gray-400">No {platform === "meta" ? "Meta" : "Google"} data for {from} → {to}.</div>
          ) : (
            <div>
              <div className="flex items-end gap-[2px] h-40 border-b border-gray-100" title={`${mDef.label} per day`}>
                {byDay.map(d => (
                  <div key={d.date} className="flex-1 min-w-0 group relative flex items-end h-full">
                    <div className="w-full rounded-t transition-all" style={{ height: `${Math.max(1, (d.value / maxV) * 100)}%`, background: accent }} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-[10px] rounded px-1.5 py-1 z-10">
                      {new Date(d.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · {fmtVal(d.value, mDef.kind)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                <span>{new Date(from + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                <span>{days} day{days === 1 ? "" : "s"} · {mDef.label}</span>
                <span>{new Date(to + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
