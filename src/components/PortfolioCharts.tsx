"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS, BarElement, CategoryScale, LinearScale,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { fmt } from "@/lib/format";
import { buildChannels, channelColor } from "@/lib/channels";

ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
const cum = (a: number[]) => a.reduce((acc: number[], v, i) => { acc.push((acc[i - 1] ?? 0) + v); return acc; }, []);

// Tiny inline trend line for KPI cards (no axes/labels).
export function Sparkline({ data, color = "#1e3a5f" }: { data: number[]; color?: string }) {
  if (!data.some(v => v)) return null;
  return (
    <div className="h-7 mt-1.5">
      <Line data={{ labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, backgroundColor: color + "1f", borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.35 }] }}
        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, elements: { line: { borderCapStyle: "round" } } }} />
    </div>
  );
}

// Whole-portfolio visuals for the overview: trend vs target, channel mix over time,
// brand contribution, and the biggest YoY movers.
export function PortfolioCharts({ brands, tiers, monthly, targets, monthKeys, monthLabels, channelSales, tradeshows, tradeshowSales, shopifySources, latest, fyLabel }: any) {
  const labels = monthLabels;

  const monthlyRev = monthKeys.map((mk: string) => sum(monthly.filter((m: any) => m.month_key === mk).map((m: any) => m.revenue)));
  const monthlyTarget = monthKeys.map((mk: string) => sum(targets.filter((t: any) => t.month_key === mk).map((t: any) => t.revenue_target ?? 0)));

  // Per-brand FY revenue + YoY (prev_revenue is the same months a year earlier).
  const brandRows = useMemo(() => brands.map((b: any) => {
    const rows = monthly.filter((m: any) => m.brand_id === b.id && monthKeys.includes(m.month_key));
    const fy = sum(rows.map((m: any) => m.revenue));
    const prev = sum(rows.map((m: any) => (m as any).prev_revenue ?? 0));
    const tgt = sum(targets.filter((t: any) => t.brand_id === b.id && monthKeys.includes(t.month_key)).map((t: any) => t.revenue_target ?? 0));
    return { b, fy, prev, tgt, yoy: prev > 0 ? ((fy - prev) / prev) * 100 : null };
  }).filter((r: any) => r.fy > 0).sort((a: any, b: any) => b.fy - a.fy), [brands, monthly, targets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Channel mix over time (top channels, stacked).
  const channelMix = useMemo(() => {
    const biz = buildChannels("all", { brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, latest });
    const top = [...biz].filter((c: any) => c.fy > 0).sort((a: any, b: any) => b.fy - a.fy).slice(0, 7);
    return top.map((c: any) => ({ label: c.name, color: channelColor(c.name), data: monthKeys.map((_: string, i: number) => c.series?.[i] ?? 0) }));
  }, [brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, latest]);

  const movers = useMemo(() => {
    const withYoY = brandRows.filter((r: any) => r.yoy != null);
    const up = [...withYoY].sort((a: any, b: any) => b.yoy - a.yoy).slice(0, 4);
    const down = [...withYoY].sort((a: any, b: any) => a.yoy - b.yoy).slice(0, 4).filter((r: any) => r.yoy < 0);
    return { up, down };
  }, [brandRows]);

  const baseScales: any = { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } };
  const card = "bg-white rounded-2xl border border-gray-100 shadow-sm p-5";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      {/* Cumulative pacing (burn-up) — full width */}
      <div className={card + " lg:col-span-2"}>
        <h3 className="text-sm font-semibold text-slate-700">Cumulative pacing</h3>
        <p className="text-xs text-gray-400 mb-3">{fyLabel} · revenue to date vs the target plan — above the line is ahead</p>
        <div className="h-52">
          <Line data={{ labels, datasets: [
            { label: "Target plan", data: cum(monthlyTarget), borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
            { label: "Revenue", data: cum(monthlyRev), borderColor: "#10b981", backgroundColor: "#10b9811f", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 },
          ] }} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? 0)}` } } }, scales: baseScales }} />
        </div>
      </div>

      {/* Revenue vs target */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-700">Revenue vs target</h3>
        <p className="text-xs text-gray-400 mb-3">{fyLabel} · monthly actual vs plan</p>
        <div className="h-56">
          <Line data={{ labels, datasets: [
            { label: "Target", data: monthlyTarget, borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
            { label: "Revenue", data: monthlyRev, borderColor: "#1e3a5f", backgroundColor: "#1e3a5f1f", borderWidth: 2, pointRadius: 2, fill: true, tension: 0.3 },
          ] }} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? 0)}` } } }, scales: baseScales }} />
        </div>
      </div>

      {/* Channel mix over time */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-700">Channel mix over time</h3>
        <p className="text-xs text-gray-400 mb-3">Where revenue comes from, month by month</p>
        <div className="h-56">
          <Bar data={{ labels, datasets: channelMix.map((c: any) => ({ label: c.label, data: c.data, backgroundColor: c.color, borderRadius: 2, stack: "c" })) }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 10 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? 0)}` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { stacked: true, ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } } }} />
        </div>
      </div>

      {/* Brand contribution */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-700">Brand contribution</h3>
        <p className="text-xs text-gray-400 mb-3">{fyLabel} revenue by brand</p>
        <div style={{ height: Math.max(220, brandRows.length * 24) }}>
          <Bar data={{ labels: brandRows.map((r: any) => r.b.name), datasets: [{ label: "Revenue", data: brandRows.map((r: any) => r.fy), backgroundColor: brandRows.map((r: any) => r.b.color || "#6366f1"), borderRadius: 3 }] }}
            options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => { const r = brandRows[c.dataIndex]; return ` ${fmt(c.parsed.x ?? 0)}${r.tgt > 0 ? ` · ${Math.round((r.fy / r.tgt) * 100)}% of target` : ""}`; } } } }, scales: { x: { ticks: { callback: (v: any) => fmt(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#6b7280" } } } }} />
        </div>
      </div>

      {/* Top movers (YoY) */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-700">Top movers <span className="font-normal text-gray-400">· vs last year</span></h3>
        {movers.up.length === 0 && movers.down.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No prior-year comparison available yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-2">Biggest gains</p>
              <ul className="space-y-1.5">
                {movers.up.map((r: any) => (
                  <li key={r.b.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.b.color }} /><span className="text-slate-700 truncate">{r.b.name}</span></span>
                    <span className="font-semibold text-emerald-600 shrink-0">▲ {Math.round(r.yoy)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-rose-500 mb-2">Biggest drops</p>
              <ul className="space-y-1.5">
                {movers.down.length === 0 ? <li className="text-xs text-gray-300">None down vs last year 🎉</li> : movers.down.map((r: any) => (
                  <li key={r.b.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.b.color }} /><span className="text-slate-700 truncate">{r.b.name}</span></span>
                    <span className="font-semibold text-rose-500 shrink-0">▼ {Math.abs(Math.round(r.yoy))}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
