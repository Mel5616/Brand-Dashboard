"use client";

import { useEffect, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import { fmtFull } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Brand = { id: number; name: string; color?: string };
type Row = { brand_id: number; month_key: string; spend: number; sales: number; impressions: number; clicks: number; note: string | null };

const labelOf = (mk: string) => {
  const [y, m] = mk.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return `${d.toLocaleDateString("en-AU", { month: "short" })} ${y.slice(2)}`;
};
const roasColor = (r: number) => r >= 4 ? "text-emerald-600 bg-emerald-50" : r >= 2 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50";
const FALLBACK_COLORS = ["#FF9900", "#6366f1", "#14b8a6", "#f97316", "#e11d48", "#8b5cf6", "#0ea5e9"];

// Amazon's own "Advertised product brand" spelling doesn't always match ours
// 1:1 (case, sub-lines like "Frida Mom") — normalise and fold known aliases
// into the parent brand rather than dropping or double-counting them.
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const ALIASES: Record<string, string> = { FRIDAMOM: "FRIDA" };
function matchBrand(name: string, brands: Brand[]): number | null {
  const n = norm(name);
  const target = ALIASES[n] ?? n;
  return brands.find(b => norm(b.name) === target)?.id ?? null;
}

// Amazon Ads results (spend + attributed sales) per brand × month — its own
// card, not folded into Budget & Expenses, because this isn't a planned
// budget line, it's a paid channel with results to judge on its own ROAS,
// same as Google/Meta/Pinterest. No live API (needs an approved Amazon Ads
// developer app), so it's filled by uploading the "Advertised product"
// report from Amazon Ads console each month.
export function AmazonAdsCard({ brands }: { brands: Brand[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  function load() {
    fetch("/api/amazon-ads").then(r => r.json()).then(j => {
      if (j.needsSetup) setNeedsSetup(true);
      setRows(j.rows ?? []);
    }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const brand = (id: number) => brands.find(b => b.id === id);
  const brandName = (id: number) => brand(id)?.name ?? `#${id}`;
  const brandColor = (id: number, i: number) => brand(id)?.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];

  async function handleFile(file: File) {
    setMsg(""); setBusy("Reading report…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const totals = new Map<string, { spend: number; sales: number; impressions: number; clicks: number }>();
      for (const r of grid) {
        const name = String(r["Advertised product brand"] ?? "").trim();
        if (!name) continue;
        const cur = totals.get(name) ?? { spend: 0, sales: 0, impressions: 0, clicks: 0 };
        cur.spend += Number(r["Total cost"]) || 0;
        cur.sales += Number(r["Sales"]) || 0;
        cur.impressions += Number(r["Impressions"]) || 0;
        cur.clicks += Number(r["Clicks"]) || 0;
        totals.set(name, cur);
      }
      if (!totals.size) { setBusy(""); setMsg("No \"Advertised product brand\" rows found — is this the Advertised product report?"); return; }
      const unmatched: string[] = [];
      const merged = new Map<number, { spend: number; sales: number; impressions: number; clicks: number }>();
      for (const [name, t] of totals) {
        const bid = matchBrand(name, brands);
        if (bid == null) { unmatched.push(name); continue; }
        const cur = merged.get(bid) ?? { spend: 0, sales: 0, impressions: 0, clicks: 0 };
        cur.spend += t.spend; cur.sales += t.sales; cur.impressions += t.impressions; cur.clicks += t.clicks;
        merged.set(bid, cur);
      }
      if (!merged.size) { setBusy(""); setMsg(`No brand names in that file matched ours. Seen: ${[...totals.keys()].join(", ")}`); return; }
      const outRows = [...merged.entries()].map(([brand_id, t]) => ({
        brand_id, month_key: month, spend: Math.round(t.spend * 100) / 100, sales: Math.round(t.sales * 100) / 100,
        impressions: Math.round(t.impressions), clicks: Math.round(t.clicks),
        note: `Amazon Ads Advertised product report · ${file.name}`,
      }));
      const res = await fetch("/api/amazon-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: outRows }) }).then(r => r.json());
      setBusy("");
      if (res.needsSetup) { setNeedsSetup(true); return; }
      if (!res.ok) { setMsg(res.error || "Upload failed."); return; }
      setMsg(`Loaded ${outRows.length} brand${outRows.length === 1 ? "" : "s"} for ${labelOf(month)}.` + (unmatched.length ? ` Skipped (no brand match): ${unmatched.join(", ")}` : ""));
      load();
    } catch {
      setBusy(""); setMsg("Couldn't read that file — is it the Advertised product export (CSV or XLSX)?");
    }
  }

  async function del(brand_id: number, month_key: string) {
    if (!confirm(`Remove Amazon Ads for ${brandName(brand_id)} · ${labelOf(month_key)}?`)) return;
    await fetch(`/api/amazon-ads?brand_id=${brand_id}&month_key=${month_key}`, { method: "DELETE" });
    load();
  }

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-sm text-gray-500">
      Amazon Ads: run <code className="bg-gray-100 px-1 rounded">supabase/add_amazon_ads.sql</code> to set this up.
    </div>
  );

  const byMonth = new Map<string, Row[]>();
  for (const r of rows) byMonth.set(r.month_key, [...(byMonth.get(r.month_key) ?? []), r]);
  const months = [...byMonth.keys()].sort().reverse();
  const latest = months[0];
  const latestRows = latest ? (byMonth.get(latest) ?? []).slice().sort((a, b) => b.spend - a.spend) : [];
  const latestSpend = latestRows.reduce((s, r) => s + r.spend, 0);
  const latestSales = latestRows.reduce((s, r) => s + r.sales, 0);
  const latestClicks = latestRows.reduce((s, r) => s + r.clicks, 0);
  const latestImpr = latestRows.reduce((s, r) => s + r.impressions, 0);
  const latestRoas = latestSpend > 0 ? latestSales / latestSpend : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-[13px]" style={{ background: "#FF9900" }}>a</span>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Amazon Ads</h3>
            <p className="text-xs text-gray-400">Results, not a planned budget line — spend + attributed sales per brand, uploaded from Amazon Ads console each month.</p>
          </div>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-[#1E9DC2] hover:underline shrink-0">{open ? "Hide" : "Upload a report"}</button>
      </div>

      {open && (
        <div className="mt-3 border-t border-gray-100 pt-3 flex items-center gap-2 flex-wrap">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
          <label className="text-sm font-semibold text-white bg-[#1E9DC2] hover:bg-[#187ea3] rounded-lg px-3 py-1.5 cursor-pointer">
            {busy || "Choose file"}
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </label>
          <span className="text-xs text-gray-400">Amazon Ads console → Measurement &amp; Reporting → Sponsored ads reporting → Advertised product template, all campaigns, one month.</span>
        </div>
      )}
      {msg && <p className="text-xs text-gray-500 mt-2">{msg}</p>}

      {latest && (
        <>
          {/* Headline strip for the latest month */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400">{labelOf(latest)} spend</p>
              <p className="text-xl font-bold text-gray-900">{fmtFull(latestSpend)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Attributed sales</p>
              <p className="text-xl font-bold text-gray-900">{fmtFull(latestSales)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Blended ROAS</p>
              <p className={`text-xl font-bold ${latestRoas >= 4 ? "text-emerald-600" : latestRoas >= 2 ? "text-amber-600" : "text-rose-600"}`}>{latestRoas.toFixed(1)}×</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Clicks · CTR</p>
              <p className="text-xl font-bold text-gray-900">{latestClicks.toLocaleString()} <span className="text-[11px] font-medium text-gray-400">· {latestImpr > 0 ? ((latestClicks / latestImpr) * 100).toFixed(2) + "%" : "—"}</span></p>
            </div>
          </div>

          {/* Spend vs Sales by brand */}
          <div className="mt-4 h-52">
            <Bar
              data={{
                labels: latestRows.map(r => brandName(r.brand_id)),
                datasets: [
                  { label: "Spend", data: latestRows.map(r => r.spend), backgroundColor: "#cbd5e1", borderRadius: 4, yAxisID: "y" },
                  { label: "Sales", data: latestRows.map(r => r.sales), backgroundColor: latestRows.map((r, i) => brandColor(r.brand_id, i)), borderRadius: 4, yAxisID: "y1" },
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmtFull(c.parsed.y)}` } } },
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                  y: { position: "left", ticks: { callback: (v: any) => fmtFull(v), font: { size: 10 } }, grid: { color: "#f3f4f6" }, title: { display: true, text: "Spend", font: { size: 10 } } },
                  y1: { position: "right", ticks: { callback: (v: any) => fmtFull(v), font: { size: 10 } }, grid: { display: false }, title: { display: true, text: "Sales", font: { size: 10 } } },
                },
              }}
            />
          </div>
        </>
      )}

      {months.length > 0 && (
        <div className="mt-4 space-y-3">
          {months.slice(0, 6).map(mk => {
            const mrows = (byMonth.get(mk) ?? []).slice().sort((a, b) => b.spend - a.spend);
            const totSpend = mrows.reduce((s, r) => s + r.spend, 0);
            const totSales = mrows.reduce((s, r) => s + r.sales, 0);
            return (
              <div key={mk} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5">
                  <span className="text-xs font-bold text-slate-600">{labelOf(mk)}</span>
                  <span className="text-xs text-gray-500">{fmtFull(totSpend)} spend · {fmtFull(totSales)} sales · {totSpend > 0 ? (totSales / totSpend).toFixed(1) + "×" : "—"} blended ROAS</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-gray-400">
                      <th className="text-left font-semibold px-3 py-1.5">Brand</th>
                      <th className="text-right font-semibold px-3 py-1.5">Spend</th>
                      <th className="text-right font-semibold px-3 py-1.5">Sales</th>
                      <th className="text-right font-semibold px-3 py-1.5">ROAS</th>
                      <th className="text-right font-semibold px-3 py-1.5">Impr.</th>
                      <th className="text-right font-semibold px-3 py-1.5">Clicks</th>
                      <th className="text-right font-semibold px-3 py-1.5">CTR</th>
                      <th className="px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mrows.map((r, i) => {
                      const roas = r.spend > 0 ? r.sales / r.spend : 0;
                      const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null;
                      return (
                        <tr key={r.brand_id} className="hover:bg-gray-50/60">
                          <td className="px-3 py-1.5 text-slate-700">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(r.brand_id, i) }} />
                              {brandName(r.brand_id)}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{fmtFull(r.spend)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{fmtFull(r.sales)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${roasColor(roas)}`}>{roas.toFixed(1)}×</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-400">{r.impressions > 0 ? r.impressions.toLocaleString() : "—"}</td>
                          <td className="px-3 py-1.5 text-right text-gray-400">{r.clicks > 0 ? r.clicks.toLocaleString() : "—"}</td>
                          <td className="px-3 py-1.5 text-right text-gray-400">{ctr != null ? ctr.toFixed(2) + "%" : "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => del(r.brand_id, r.month_key)} className="text-gray-300 hover:text-rose-500 text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
