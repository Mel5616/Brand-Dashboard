"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandMonthly } from "@/lib/db";
import { buildChannels, groupDirect, momPct, DIGITAL_CHANNELS, channelColor as colorOf, type ChannelSaleRow } from "@/lib/channels";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

// Small month-on-month direction badge — green up / red down, muted when flat or unknown.
function Mom({ series, idx }: { series: number[]; idx: number }) {
  const p = momPct(series, idx);
  if (p == null) return null;
  const up = p >= 0;
  return <span className={`ml-1.5 text-[10px] font-semibold ${Math.abs(p) < 0.5 ? "text-gray-300" : up ? "text-emerald-500" : "text-red-500"}`}>{up ? "▲" : "▼"}{Math.abs(p).toFixed(0)}%</span>;
}

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
type ShopifySource = { brand_id: number; month_key: string; source: string; revenue: number };

export function SalesPanel({
  scope, brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, googleAds, metaAds, marketingActuals, role, monthKeys, monthLabels, latest, canUpload,
}: {
  scope: number | "all";
  brands: Brand[];
  channelSales: ChannelSaleRow[];
  monthly: BrandMonthly[];
  tradeshows: Tradeshow[];
  tradeshowSales: TradeshowSale[];
  shopifySources: ShopifySource[];
  googleAds: { brand_id: number; month_key: string; spend: number }[];
  metaAds: { brand_id: number; month_key: string; spend: number }[];
  marketingActuals: { brand_id: number; month_key: string; channel: string; spend: number }[];
  role: "admin" | "member";
  monthKeys: string[];
  monthLabels: string[];
  latest: string;
  canUpload: boolean;
}) {
  const isAdmin = role === "admin";
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

  const computeChannels = (s: number | "all") =>
    buildChannels(s, { brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, latest });

  const allChannels = computeChannels(scope);
  // The digital team only sees digital channels (no wholesale/retail/total business).
  const channels = isAdmin ? allChannels : allChannels.filter(c => DIGITAL_CHANNELS.has(c.name));
  const hasData = channels.length > 0;
  const fyTotal = sum(channels.map(c => c.fy));
  const monthTotal = sum(channels.map(c => c.latest));
  const li = monthKeys.indexOf(latest);
  const prevKey = monthKeys[li - 1];
  const prevTotal = prevKey ? sum(channels.map(c => c.series[monthKeys.indexOf(prevKey)])) : 0;
  const mom = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) * 100 : null;
  const latestLabel = monthLabels[monthKeys.indexOf(latest)] ?? latest;

  // MER = marketing spend / revenue (lower is better). True (all channels, wholesale) for the
  // Director; Digital (paid digital / digital revenue) for the team.
  const inScope = <T extends { brand_id: number }>(rows: T[]) => rows.filter(r => scope === "all" || r.brand_id === scope);
  const gSpend = sum(inScope(googleAds).map(r => r.spend));
  const mSpend = sum(inScope(metaAds).map(r => r.spend));
  const oSpend = sum(inScope(marketingActuals).filter(a => a.channel !== "Google Advertising" && a.channel !== "Social Media (Meta)").map(a => a.spend));
  const digitalRev = sum(allChannels.filter(c => DIGITAL_CHANNELS.has(c.name)).map(c => c.fy));
  const trueRev = sum(allChannels.map(c => c.fy));
  const trueMer = trueRev > 0 ? ((gSpend + mSpend + oSpend) / trueRev) * 100 : null;
  const digitalMer = digitalRev > 0 ? ((gSpend + mSpend) / digitalRev) * 100 : null;
  const merValue = isAdmin ? trueMer : digitalMer;
  const merLabel = isAdmin ? "True MER" : "Digital MER";

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
        <p className="text-xs text-gray-400">{isAdmin ? "Whole business · Website Sales live from Shopify, other channels from the monthly upload" : "Digital channels only · D2C, marketplace and affiliate"}</p>
        <div className="flex items-center gap-2">{msg && <span className="text-xs text-gray-500">{msg}</span>}{Upload}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label={isAdmin ? "Total sales (FY)" : "Digital sales (FY)"} value={fmtFull(fyTotal)} accent="#1e3a5f" />
        <Card label={`${latestLabel} sales`} value={fmtFull(monthTotal)} sub={mom != null ? `${mom >= 0 ? "▲" : "▼"} ${Math.abs(mom).toFixed(0)}% vs prev` : undefined} accent="#10b981" />
        <Card label={merLabel} value={merValue != null ? merValue.toFixed(1) + "%" : "—"} sub={isAdmin ? "marketing spend ÷ all revenue" : "paid digital ÷ digital revenue"} accent="#f97316" />
        <Card label="Channels" value={String(channels.length)} accent="#a855f7" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Share by channel</h3>
          <p className="text-xs text-gray-400 mb-3">Full year</p>
          <div className="flex items-center gap-5">
            <div className="relative w-36 h-36 shrink-0">
              <Doughnut data={{ labels: channels.map(c => c.name), datasets: [{ data: channels.map(c => Math.max(0, c.fy)), backgroundColor: channels.map(c => colorOf(c.name)), borderWidth: 0 }] }}
                options={{ cutout: "66%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed as number)}` } } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] text-gray-400">Total</span><span className="text-sm font-bold text-slate-800">{fmt(fyTotal)}</span></div>
            </div>
            <div className="flex-1 space-y-1.5">
              {channels.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(c.name) }} />
                  <span className="text-gray-600 flex-1 truncate">{c.name}</span>
                  <span className="font-semibold text-slate-700">{fyTotal > 0 ? ((c.fy / fyTotal) * 100).toFixed(1) : "0"}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Monthly sales by channel</h3>
          <p className="text-xs text-gray-400 mb-3">Channel mix over the year</p>
          <div className="h-48">
            <Bar data={{ labels: monthLabels, datasets: channels.map(c => ({ label: c.name, data: c.series, backgroundColor: colorOf(c.name), stack: "s", borderWidth: 0 })) }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? 0)}` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => fmt(v as number) }, grid: { color: "#f3f4f6" } } } }} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-0.5">Sales by channel</h3>
        <p className="text-xs text-gray-400 mb-3">Full year and {latestLabel}, with month-on-month change</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
              <th className="text-left font-medium py-1.5">Channel</th>
              <th className="font-medium">FY total</th><th className="font-medium">Share</th><th className="font-medium">{latestLabel}</th>
            </tr>
          </thead>
          <tbody>
            {groupDirect(channels).map((c) => (
              c.isGroup ? (
                <React.Fragment key={c.name}>
                  <tr className="text-right border-b border-gray-50 text-slate-800 bg-slate-50/50">
                    <td className="text-left py-1.5"><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: "#1e3a5f" }} /><span className="font-semibold">{c.name}</span></span></td>
                    <td className="font-bold">{fmt(c.fy)}</td>
                    <td className="font-semibold">{fyTotal > 0 ? ((c.fy / fyTotal) * 100).toFixed(1) : "0"}%</td>
                    <td className="font-semibold whitespace-nowrap">{fmt(c.latest)}<Mom series={c.series} idx={li} /></td>
                  </tr>
                  {c.kids!.map(k => (
                    <tr key={k.name} className="text-right border-b border-gray-50 text-slate-500">
                      <td className="text-left py-1.5"><span className="inline-flex items-center gap-2 pl-5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: colorOf(k.name) }} />{k.name}</span></td>
                      <td>{fmt(k.fy)}</td>
                      <td>{fyTotal > 0 ? ((k.fy / fyTotal) * 100).toFixed(1) : "0"}%</td>
                      <td className="whitespace-nowrap">{fmt(k.latest)}<Mom series={k.series} idx={li} /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ) : (
                <tr key={c.name} className="text-right border-b border-gray-50 text-slate-700">
                  <td className="text-left py-1.5"><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: colorOf(c.name) }} />{c.name}</span></td>
                  <td className="font-semibold">{fmt(c.fy)}</td>
                  <td>{fyTotal > 0 ? ((c.fy / fyTotal) * 100).toFixed(1) : "0"}%</td>
                  <td className="whitespace-nowrap">{fmt(c.latest)}<Mom series={c.series} idx={li} /></td>
                </tr>
              )
            ))}
            <tr className="text-right font-bold text-slate-800 border-t-2 border-gray-100">
              <td className="text-left py-2">Total</td><td>{fmt(fyTotal)}</td><td>100%</td><td>{fmt(monthTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {scope === "all" && (() => {
        const mix = brands
          .map(b => { const bc = computeChannels(b.id).filter(c => isAdmin || DIGITAL_CHANNELS.has(c.name)); return { b, bc, tot: sum(bc.map(c => c.fy)) }; })
          .filter(x => x.tot > 0)
          .sort((a, b) => b.tot - a.tot);
        if (!mix.length) return null;
        return (
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Channel mix by brand</h3>
            <p className="text-xs text-gray-400 mb-4">Where each brand&apos;s sales come from · full year</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {mix.map(({ b, bc, tot }) => {
                const pos = sum(bc.filter(c => c.fy > 0).map(c => c.fy)) || 1;
                const cols = groupDirect(bc.filter(c => c.fy > 0));
                const Row = ({ name, value, color, child }: { name: string; value: number; color: string; child?: boolean }) => {
                  const pct = (value / pos) * 100;
                  return (
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className={`flex items-center gap-1.5 truncate min-w-0 ${child ? "text-slate-400" : "text-slate-600"}`}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="truncate">{name}</span>
                        </span>
                        <span className="text-slate-400 shrink-0 ml-2"><span className={`font-semibold ${child ? "text-slate-500" : "text-slate-700"}`}>{fmt(value)}</span> · {pct.toFixed(0)}%</span>
                      </div>
                      <div className={`rounded-full bg-gray-100 ${child ? "h-1" : "h-1.5"}`}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                };
                return (
                  <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-50">
                      <span className="text-sm font-semibold text-slate-700 truncate">{b.name}</span>
                      <span className="text-sm font-bold text-slate-800 shrink-0">{fmt(tot)}</span>
                    </div>
                    <div className="space-y-2">
                      {cols.map(c => (
                        <div key={c.name}>
                          <Row name={c.name} value={c.fy} color={c.isGroup ? "#4f9d86" : colorOf(c.name)} />
                          {c.isGroup && c.kids && (
                            <div className="ml-3 mt-1.5 space-y-1.5 border-l border-gray-100 pl-3">
                              {c.kids.map(k => <Row key={k.name} name={k.name} value={k.fy} color={colorOf(k.name)} child />)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
