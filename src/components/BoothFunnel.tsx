"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { BoothFunnel as BoothFunnelData } from "@/lib/booth";

type PosLive = { ok: boolean; orders: number; revenue: number; daily: { date: string; revenue: number; orders: number }[] };

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const aud = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const num = (n: number) => n.toLocaleString("en-AU");

function fmtDay(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function BoothFunnel({ data }: { data: BoothFunnelData }) {
  const { totals, shows, daily, hasRows } = data;

  // Show picker: "all" = cumulative since go-live, else scope everything to one show.
  const [showSel, setShowSel] = useState<string>("all");
  const sel = showSel === "all" ? null : shows.find(s => s.show_name === showSel) ?? null;

  // Live Shopify POS — UPPAbaby store + Coolkidz booth till. Scoped to the selected
  // show's date window when one is picked, else cumulative since go-live.
  const [pos, setPos] = useState<PosLive | null>(null);
  const [posCk, setPosCk] = useState<PosLive | null>(null);
  const [posLoading, setPosLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setPosLoading(true);
    const p = new URLSearchParams();
    if (sel) { p.set("since", sel.start); p.set("until", sel.end); }
    const p2 = new URLSearchParams(p); p2.set("store", "coolkidz");
    Promise.all([
      fetch(`/api/booth-pos?${p.toString()}`).then(r => r.json()).catch(() => null),
      fetch(`/api/booth-pos?${p2.toString()}`).then(r => r.json()).catch(() => null),
    ]).then(([u, c]: [PosLive | null, PosLive | null]) => {
      if (!alive) return;
      setPos(u); setPosCk(c); setPosLoading(false);
    });
    return () => { alive = false; };
  }, [showSel, sel?.start, sel?.end]);

  if (!hasRows && !(pos && pos.orders > 0) && !(posCk && posCk.orders > 0)) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">📲</div>
        <p className="text-gray-600 font-medium">No expo activity yet.</p>
        <p className="text-sm text-gray-400 mt-1">QR scans and orders will appear here once the expo stand goes live.</p>
      </div>
    );
  }

  // QR funnel figures — the selected show's row, or the cumulative totals.
  const qr = sel ?? totals;
  const kpis = [
    { label: "QR Scans",        value: num(qr.scans),       color: "#6366f1" },
    { label: "Checkouts Started", value: num(qr.checkouts), color: "#0891b2" },
    { label: "Paid Orders",     value: num(qr.orders),      color: "#10b981" },
    { label: "Revenue (AUD)",   value: aud(qr.revenue),     color: "#0f172a" },
    { label: "Scan → Order",    value: `${qr.conversion}%`, color: "#f59e0b" },
  ];

  // Revenue-by-day must combine QR booth_events (daily) with live Shopify POS
  // (pos.daily) — POS is the bulk of booth revenue and lives in a separate feed.
  const mergedDaily = (() => {
    const map = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const d of daily) map.set(d.date, { date: d.date, revenue: d.revenue, orders: d.orders });
    for (const d of [...(pos?.daily ?? []), ...(posCk?.daily ?? [])]) {
      const cur = map.get(d.date) ?? { date: d.date, revenue: 0, orders: 0 };
      cur.revenue += d.revenue; cur.orders += d.orders;
      map.set(d.date, cur);
    }
    let arr = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (sel) arr = arr.filter(d => d.date >= sel.start && d.date <= sel.end);   // scope chart to the show
    return arr;
  })();
  const totalExpoRevenue = qr.revenue + (pos?.revenue ?? 0) + (posCk?.revenue ?? 0);
  const hasRevenue = mergedDaily.some(d => d.revenue > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-800">Expo Stand Funnel</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {sel ? `${sel.show_name} · ${sel.start === sel.end ? sel.start : `${sel.start} → ${sel.end}`}` : "Live QR expo stand data — scan → checkout → paid order"}
          </p>
        </div>
        {shows.length > 0 && (
          <select value={showSel} onChange={e => setShowSel(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="all">All shows (cumulative)</option>
            {shows.map(s => <option key={s.show_name} value={s.show_name}>{s.show_name}</option>)}
          </select>
        )}
      </div>

      {/* KPI row — QR funnel */}
      <div>
        <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-1.5 px-0.5">QR Expo Stand Funnel</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live POS — UPPAbaby + Coolkidz booth tills */}
      {([
        { label: "Shopify POS (UPPAbaby · live)", d: pos },
        { label: "Shopify POS (Coolkidz brands · live)", d: posCk },
      ] as const).map(sec => (
        <div key={sec.label}>
          <div className="flex items-center gap-2 mb-1.5 px-0.5 flex-wrap">
            <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.18em]">{sec.label}</p>
            {!posLoading && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border shadow-sm px-4 py-3 bg-white border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">POS Orders</p>
              <p className="text-xl font-bold mt-1 text-slate-700">{posLoading ? "…" : num(sec.d?.orders ?? 0)}</p>
            </div>
            <div className="rounded-xl border shadow-sm px-4 py-3 bg-white border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">POS Revenue</p>
              <p className="text-xl font-bold mt-1 text-slate-700">{posLoading ? "…" : aud(sec.d?.revenue ?? 0)}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Combined total — QR + both POS tills */}
      <div className="rounded-xl border border-emerald-100 shadow-sm px-4 py-3 bg-gradient-to-br from-emerald-50/70 to-white">
        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">Total Expo Stand Revenue</p>
        <p className="text-2xl font-bold mt-1 text-emerald-600">{posLoading ? "…" : aud(totalExpoRevenue)}</p>
        <p className="text-[10px] text-gray-400">QR + UPPAbaby POS + Coolkidz POS</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Per-show table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-slate-700">By Show</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Show", "Scans", "Checkouts", "Orders", "Revenue", "Conv."].map(h => (
                    <th key={h} className={`${h === "Show" ? "text-left" : "text-right"} px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shows.map(s => (
                  <tr key={s.show_name} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{s.show_name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{num(s.scans)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{num(s.checkouts)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{num(s.orders)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700 whitespace-nowrap">{aud(s.revenue)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${s.conversion >= 5 ? "bg-emerald-50 text-emerald-600" : s.conversion > 0 ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-400"}`}>{s.conversion}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="px-4 pt-2 pb-3 text-xs font-semibold text-gray-500">Total</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800">{num(totals.scans)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800">{num(totals.checkouts)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800">{num(totals.orders)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{aud(totals.revenue)}</td>
                  <td className="px-4 pt-2 pb-3 text-right font-bold text-slate-800">{totals.conversion}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Revenue by day */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Revenue by Day</h3>
          <p className="text-xs text-gray-400 mb-4">QR + POS paid order revenue (bars) and order count (line)</p>
          {hasRevenue ? (
            <div className="h-56">
              <Bar
                data={{
                  labels: mergedDaily.map(d => fmtDay(d.date)),
                  datasets: [
                    { type: "bar", label: "Revenue", data: mergedDaily.map(d => d.revenue), backgroundColor: "#6366f1", borderRadius: 4, yAxisID: "yRev", order: 2 },
                    { type: "line", label: "Orders", data: mergedDaily.map(d => d.orders), borderColor: "#10b981", backgroundColor: "#10b981", borderWidth: 2, pointRadius: 3, tension: 0.35, yAxisID: "yOrd", order: 1 },
                  ],
                } as any}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
                    tooltip: { callbacks: { label: (ctx: any) => ctx.dataset.label === "Revenue" ? ` Revenue: ${aud(ctx.parsed.y ?? 0)}` : ` Orders: ${ctx.parsed.y ?? 0}` } },
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } },
                    yRev: { position: "left", ticks: { callback: (v: any) => aud(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
                    yOrd: { position: "right", beginAtZero: true, ticks: { precision: 0, font: { size: 10 }, color: "#9ca3af" }, grid: { display: false } },
                  },
                }}
              />
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-center">
              <p className="text-sm text-gray-400 max-w-xs">Revenue appears once the first paid expo order comes through.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
