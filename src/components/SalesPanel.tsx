"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandMonthly } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

type ChannelSaleRow = { month_key: string; brand: string; customer_group: string; register: string; value: number; is_online: boolean };

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const brandMatch = (dash: string, sheet: string) => {
  const a = norm(dash), b = norm(sheet);
  return !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));
};
const CH_COLORS = ["#1e3a5f", "#10b981", "#f97316", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#92400e", "#22c55e", "#64748b", "#eab308", "#0ea5e9"];

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">{accent && <span className="w-2 h-2 rounded-full inline-block" style={{ background: accent }} />}{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

type Tradeshow = { id: string; date_start: string };
type TradeshowSale = { tradeshow_id: string; brand_id: number; revenue: number };
type FaireSale = { brand_id: number; month_key: string; revenue: number };

export function SalesPanel({
  scope, brands, channelSales, monthly, tradeshows, tradeshowSales, faireSales, monthKeys, monthLabels, latest, canUpload,
}: {
  scope: number | "all";
  brands: Brand[];
  channelSales: ChannelSaleRow[];
  monthly: BrandMonthly[];
  tradeshows: Tradeshow[];
  tradeshowSales: TradeshowSale[];
  faireSales: FaireSale[];
  monthKeys: string[];
  monthLabels: string[];
  latest: string;
  canUpload: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg("Reading spreadsheet...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false });
      const years = grid[0] as any[], hdr = grid[1] as any[];
      // month_key per column from year row + month-number header row
      const colMonth: Record<number, string> = {};
      for (let j = 3; j < hdr.length; j++) {
        const y = years[j], mo = hdr[j];
        if (typeof y === "number" && typeof mo === "number") colMonth[j] = `${y}-${String(mo).padStart(2, "0")}`;
      }
      // Aggregate by primary key (month, brand, group, register) — the export can repeat combos.
      // The group is repeated on every row, so a blank group genuinely means "no group".
      const agg = new Map<string, ChannelSaleRow>();
      for (let i = 2; i < grid.length; i++) {
        const r = grid[i] as any[];
        const brand = r[1] ? String(r[1]).trim() : "";
        const register = r[2] ? String(r[2]).trim() : "";
        if (!register || !brand) continue;
        const cg = r[0] ? String(r[0]).trim() : "Other";
        for (const j of Object.keys(colMonth).map(Number)) {
          const v = r[j];
          if (typeof v === "number" && v !== 0) {
            const mk = colMonth[j], key = `${mk}|${brand}|${cg}|${register}`;
            const ex = agg.get(key);
            if (ex) ex.value = Math.round((ex.value + v) * 100) / 100;
            else agg.set(key, { month_key: mk, brand, customer_group: cg, register, value: Math.round(v * 100) / 100, is_online: /^shopify/i.test(register) });
          }
        }
      }
      const rows = [...agg.values()];
      if (!rows.length) throw new Error("No data rows found. Check the file matches the monthly export format.");
      const months = [...new Set(rows.map(r => r.month_key))].sort();
      setMsg(`Parsed ${rows.length.toLocaleString()} rows across ${months.length} month(s) (${months[0]} to ${months[months.length - 1]}). Saving...`);
      const res = await fetch("/api/channel-sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.message || "Save failed");
      setMsg(`Saved. Refreshing...`);
      setTimeout(() => window.location.reload(), 700);
    } catch (err: any) {
      setMsg(`Could not import: ${err.message}`); setBusy(false);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── scope ──
  const rows = scope === "all" ? channelSales : channelSales.filter(r => brandMatch(brands.find(b => b.id === scope)?.name ?? "", r.brand));
  const liveMonthly = scope === "all" ? monthly : monthly.filter(m => m.brand_id === scope);
  const offline = rows.filter(r => !r.is_online); // Shopify rows excluded — online comes live
  const hasData = offline.length > 0 || liveMonthly.some(m => m.revenue > 0);

  // Tradeshow sales (per show → month via date_start). These are Shopify/POS orders inside
  // the live Website Sales total, so we report them separately and net them out of online.
  const showMonth = Object.fromEntries(tradeshows.map(t => [t.id, (t.date_start || "").slice(0, 7)]));
  const tsByMonth = (mk: string) => sum(
    tradeshowSales
      .filter(s => showMonth[s.tradeshow_id] === mk && (scope === "all" || s.brand_id === scope))
      .map(s => s.revenue)
  );
  // Faire orders (live from Shopify, source_name:faire) → reported under Partnerships,
  // and netted out of the live Website Sales total so they aren't double-counted.
  const faireByMonth = (mk: string) => sum(
    faireSales.filter(f => f.month_key === mk && (scope === "all" || f.brand_id === scope)).map(f => f.revenue)
  );

  // Channel classification for the file (non-Shopify) rows:
  //   API → Marketplace · no-group Backend/Cloud → Website Sales · else map/keep the customer group.
  const CHANNEL_MAP: Record<string, string> = {
    "Online Store": "Online Only Stores",
    "Affiliate": "Affiliates",
    "Coolkidz": "Website Sales",
    "Direct Customer": "Website Sales",
    "Tradeshow Sales": "Tradeshows",
  };
  const channelOf = (r: ChannelSaleRow) =>
    r.register === "API" ? "Marketplace"
    : (!r.customer_group || r.customer_group === "Other") ? "Website Sales"
    : (CHANNEL_MAP[r.customer_group] ?? r.customer_group);

  // Website Sales = live total Shopify (less tradeshow) + its file backend/cloud + no-group lines.
  const valueOf = (ch: string, mk: string) => {
    const fileSum = sum(offline.filter(r => channelOf(r) === ch && r.month_key === mk).map(r => r.value));
    if (ch === "Tradeshows") return tsByMonth(mk) + fileSum;
    if (ch === "Partnerships") return faireByMonth(mk) + fileSum;
    const base = ch === "Website Sales" ? sum(liveMonthly.filter(m => m.month_key === mk).map(m => m.revenue)) - tsByMonth(mk) - faireByMonth(mk) : 0;
    return base + fileSum;
  };

  const names = new Set<string>(["Website Sales", "Tradeshows", "Partnerships", ...offline.map(channelOf)]);
  const channelRow = (name: string) => {
    const series = monthKeys.map(mk => valueOf(name, mk));
    return { name, series, fy: sum(series), latest: valueOf(name, latest) };
  };
  const channels = [...names].map(channelRow).filter(c => c.fy !== 0).sort((a, b) => b.fy - a.fy);

  const fyTotal = sum(channels.map(c => c.fy));
  const monthTotal = sum(channels.map(c => c.latest));
  const prevKey = monthKeys[monthKeys.indexOf(latest) - 1];
  const prevTotal = prevKey ? sum(channels.map(c => c.series[monthKeys.indexOf(prevKey)])) : 0;
  const mom = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) * 100 : null;
  const online = channels.find(c => c.name === "Website Sales");
  const onlinePct = fyTotal > 0 ? ((online?.fy ?? 0) / fyTotal) * 100 : 0;
  const latestLabel = monthLabels[monthKeys.indexOf(latest)] ?? latest;

  const Upload = canUpload ? (
    <div className="no-print">
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-60 rounded-lg px-3.5 py-1.5 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        {busy ? "Working..." : "Upload monthly data"}
      </button>
    </div>
  ) : null;

  if (!hasData) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{Upload}</div>
        {msg && <p className="text-xs text-gray-500 text-right">{msg}</p>}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 font-medium">No channel sales loaded yet</p>
          <p className="text-sm text-gray-400 mt-1">{canUpload ? "Upload the monthly sales spreadsheet to see the by-channel report." : "Ask an admin to upload the monthly sales file."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">Website Sales is pulled live from Shopify · other channels from the monthly upload</p>
        <div className="flex items-center gap-2">{msg && <span className="text-xs text-gray-500">{msg}</span>}{Upload}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total sales (FY)" value={fmtFull(fyTotal)} accent="#1e3a5f" />
        <Card label={`${latestLabel} sales`} value={fmtFull(monthTotal)} sub={mom != null ? `${mom >= 0 ? "▲" : "▼"} ${Math.abs(mom).toFixed(0)}% vs prev` : undefined} accent="#10b981" />
        <Card label="Online share" value={onlinePct.toFixed(0) + "%"} sub="of total sales" accent="#f97316" />
        <Card label="Channels" value={String(channels.length)} accent="#a855f7" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Share by channel</h3>
          <p className="text-xs text-gray-400 mb-3">Full year</p>
          <div className="flex items-center gap-5">
            <div className="relative w-36 h-36 shrink-0">
              <Doughnut data={{ labels: channels.map(c => c.name), datasets: [{ data: channels.map(c => Math.max(0, c.fy)), backgroundColor: channels.map((_, i) => CH_COLORS[i % CH_COLORS.length]), borderWidth: 0 }] }}
                options={{ cutout: "66%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed as number)}` } } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] text-gray-400">Total</span><span className="text-sm font-bold text-slate-800">{fmt(fyTotal)}</span></div>
            </div>
            <div className="flex-1 space-y-1.5">
              {channels.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CH_COLORS[i % CH_COLORS.length] }} />
                  <span className="text-gray-600 flex-1 truncate">{c.name}</span>
                  <span className="font-semibold text-slate-700">{fyTotal > 0 ? ((c.fy / fyTotal) * 100).toFixed(1) : "0"}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Monthly sales</h3>
          <p className="text-xs text-gray-400 mb-3">Total across all channels</p>
          <div className="h-48">
            <Bar data={{ labels: monthLabels, datasets: [{ label: "Sales", data: monthKeys.map(mk => sum(channels.map(c => c.series[monthKeys.indexOf(mk)]))), backgroundColor: "#1e3a5f", borderRadius: 3 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.y ?? 0)}` } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => fmt(v as number) }, grid: { color: "#f3f4f6" } } } }} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-0.5">Sales by channel</h3>
        <p className="text-xs text-gray-400 mb-3">Full year and {latestLabel}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
              <th className="text-left font-medium py-1.5">Channel</th>
              <th className="font-medium">FY total</th><th className="font-medium">Share</th><th className="font-medium">{latestLabel}</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c, i) => (
              <tr key={c.name} className="text-right border-b border-gray-50 text-slate-700">
                <td className="text-left py-1.5"><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: CH_COLORS[i % CH_COLORS.length] }} />{c.name}</span></td>
                <td className="font-semibold">{fmt(c.fy)}</td>
                <td>{fyTotal > 0 ? ((c.fy / fyTotal) * 100).toFixed(1) : "0"}%</td>
                <td>{fmt(c.latest)}</td>
              </tr>
            ))}
            <tr className="text-right font-bold text-slate-800 border-t-2 border-gray-100">
              <td className="text-left py-2">Total</td><td>{fmt(fyTotal)}</td><td>100%</td><td>{fmt(monthTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
