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

// The current UPPAbaby POS orders are test data, not confirmed booth sales —
// the feed stays visible but is clearly labelled. Set to false once real.
const POS_IS_TEST = true;

export function BoothFunnel({ data }: { data: BoothFunnelData }) {
  const { totals, shows, daily, hasRows } = data;

  // Live UPPAbaby Shopify POS — fetched on demand when this tab opens
  const [pos, setPos] = useState<PosLive | null>(null);
  const [posLoading, setPosLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/booth-pos")
      .then(r => r.json())
      .then((d: PosLive) => { if (alive) { setPos(d); setPosLoading(false); } })
      .catch(() => { if (alive) setPosLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!hasRows && !(pos && pos.orders > 0)) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">📲</div>
        <p className="text-gray-600 font-medium">No expo activity yet.</p>
        <p className="text-sm text-gray-400 mt-1">QR scans and orders will appear here once the booth goes live.</p>
      </div>
    );
  }

  const kpis = [
    { label: "QR Scans",        value: num(totals.scans),       color: "#6366f1" },
    { label: "Checkouts Started", value: num(totals.checkouts), color: "#0891b2" },
    { label: "Paid Orders",     value: num(totals.orders),      color: "#10b981" },
    { label: "Revenue (AUD)",   value: aud(totals.revenue),     color: "#0f172a" },
    { label: "Scan → Order",    value: `${totals.conversion}%`, color: "#f59e0b" },
  ];

  const hasRevenue = daily.some(d => d.revenue > 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800">Expo Booth Funnel</h2>
        <p className="text-xs text-gray-400 mt-0.5">Live QR booth data — scan → checkout → paid order</p>
      </div>

      {/* KPI row — QR funnel */}
      <div>
        <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-1.5 px-0.5">QR Booth Funnel</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live POS + combined total */}
      <div>
        <div className="flex items-center gap-2 mb-1.5 px-0.5 flex-wrap">
          <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.18em]">Shopify POS (UPPAbaby · live · last 180 days)</p>
          {!posLoading && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live" />}
          {POS_IS_TEST && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠ Test data — not real sales</span>
          )}
        </div>
        {POS_IS_TEST && (
          <p className="text-[11px] text-amber-600 mb-2 px-0.5">These POS figures are sample/test orders, not confirmed booth sales. They’re excluded from real revenue until live.</p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className={`rounded-xl border shadow-sm px-4 py-3 ${POS_IS_TEST ? "border-amber-200 bg-amber-50/40" : "bg-white border-gray-100"}`}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">POS Orders {POS_IS_TEST && <span className="text-amber-500">· test</span>}</p>
            <p className="text-xl font-bold mt-1 text-slate-700">{posLoading ? "…" : num(pos?.orders ?? 0)}</p>
          </div>
          <div className={`rounded-xl border shadow-sm px-4 py-3 ${POS_IS_TEST ? "border-amber-200 bg-amber-50/40" : "bg-white border-gray-100"}`}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">POS Revenue {POS_IS_TEST && <span className="text-amber-500">· test</span>}</p>
            <p className="text-xl font-bold mt-1 text-slate-700">{posLoading ? "…" : aud(pos?.revenue ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-indigo-100 shadow-sm px-4 py-3 bg-gradient-to-br from-indigo-50/70 to-white">
            <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest">Total Booth Revenue</p>
            <p className="text-xl font-bold mt-1 text-indigo-600">{posLoading ? "…" : aud(totals.revenue + (pos?.revenue ?? 0))}</p>
            <p className="text-[10px] text-gray-400">QR + POS{POS_IS_TEST ? " (incl. test)" : ""}</p>
          </div>
        </div>
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
          <p className="text-xs text-gray-400 mb-4">Paid order revenue (bars) and order count (line)</p>
          {hasRevenue ? (
            <div className="h-56">
              <Bar
                data={{
                  labels: daily.map(d => fmtDay(d.date)),
                  datasets: [
                    { type: "bar", label: "Revenue", data: daily.map(d => d.revenue), backgroundColor: "#6366f1", borderRadius: 4, yAxisID: "yRev", order: 2 },
                    { type: "line", label: "Orders", data: daily.map(d => d.orders), borderColor: "#10b981", backgroundColor: "#10b981", borderWidth: 2, pointRadius: 3, tension: 0.35, yAxisID: "yOrd", order: 1 },
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
