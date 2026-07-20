"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend,
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { ReportData, ChannelSlice } from "@/lib/report";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

const pctS = (n: number) => `${(n * 100).toFixed(1)}%`;
const CH_COLORS = ["#0e7490", "#10b981", "#0ea5e9", "#92400e", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#14b8a6"];
const chColor = (i: number) => CH_COLORS[i % CH_COLORS.length];

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
        {accent && <span className="w-2 h-2 rounded-full inline-block" style={{ background: accent }} />}{label}
      </p>
      <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function DonutCard({ title, subtitle, slices, total }: { title: string; subtitle: string; slices: ChannelSlice[]; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
      <div className="flex items-center gap-5">
        <div className="relative w-36 h-36 shrink-0">
          <Doughnut
            data={{ labels: slices.map(s => s.channel), datasets: [{ data: slices.map(s => s.value), backgroundColor: slices.map((_, i) => chColor(i)), borderWidth: 0 }] }}
            options={{ cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed as number)}` } } } }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-400">Total</span>
            <span className="text-sm font-bold text-slate-800">{fmt(total)}</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {slices.map((s, i) => (
            <div key={s.channel} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: chColor(i) }} />
              <span className="text-gray-600 flex-1 truncate">{s.channel}</span>
              <span className="font-semibold text-slate-700">{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// Pacing bar: actual vs where you should be by today. Fill is actual as a share
// of expected; the 100% line = exactly on pace.
function PaceRow({ label, actual, expected, colour }: { label: string; actual: number; expected: number; colour: string }) {
  const ratio = expected > 0 ? actual / expected : null;
  const pctOf = ratio != null ? ratio * 100 : null;
  const verdict = ratio == null ? { text: "no plan", cls: "bg-slate-100 text-slate-500" }
    : ratio >= 1.05 ? { text: `▲ ${Math.round((ratio - 1) * 100)}% ahead`, cls: "bg-emerald-100 text-emerald-700" }
    : ratio >= 0.95 ? { text: "● on pace", cls: "bg-sky-100 text-sky-700" }
    : { text: `▼ ${Math.round((1 - ratio) * 100)}% behind`, cls: "bg-rose-100 text-rose-600" };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[12px] font-semibold text-slate-600">{label}</p>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${verdict.cls}`}>{verdict.text}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (pctOf ?? 0) / 2)}%`, background: colour }} />
        <div className="absolute inset-y-0 w-px bg-slate-700" style={{ left: "50%" }} title="On pace" />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">{fmtFull(actual)} actual · {fmtFull(expected)} expected by today</p>
    </div>
  );
}

export function BrandReport({ r }: { r: ReportData }) {
  const elapsedPct = r.elapsed * 100;
  const usedPct = r.pctBudgetUsed * 100;
  const behind = elapsedPct - usedPct; // +ve = behind pace on spend
  const remaining = r.marketingBudgetFY - r.spendYTD;

  const headline = [
    { label: "ROAS", value: r.roas != null ? `${r.roas.toFixed(1)}×` : "—", sub: "sales per $1 marketing", accent: "#14b8a6" },
    { label: "Forecast (full year)", value: r.forecast != null ? fmtFull(r.forecast) : "—", sub: r.forecastPctOfTarget != null ? `${pctS(r.forecastPctOfTarget)} of target at current pace` : "—", accent: "#0e7490" },
    { label: "Share of portfolio", value: pctS(r.shareOfPortfolio), sub: "of total company sales", accent: "#14b8a6" },
    { label: "Momentum", value: r.momentumPct != null ? `${r.momentumPct >= 0 ? "▲" : "▼"} ${Math.abs(r.momentumPct * 100).toFixed(0)}%` : "—", sub: r.momentumMonth ? `MoM · ${r.momentumMonth}` : "—", accent: "#0ea5e9" },
  ];
  const kpis = [
    { label: "Sales target FY", value: fmtFull(r.salesTargetFY), accent: "#14b8a6" },
    { label: "Actual sales YTD", value: fmtFull(r.actualSalesYTD), sub: `${pctS(r.pctToTarget)} to target`, accent: "#14b8a6" },
    { label: "Marketing budget FY", value: fmtFull(r.marketingBudgetFY), accent: "#0e7490" },
    { label: "Spend YTD", value: fmtFull(r.spendYTD), sub: `${pctS(r.pctBudgetUsed)} of budget used`, accent: "#0e7490" },
    { label: "Mktg % of sales", value: pctS(r.mktgPctOfSales), accent: "#0e7490" },
  ];

  return (
    <div id="brand-report" className="space-y-4">
      {/* Print header — only shows on the PDF */}
      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-bold text-slate-900">{r.label} — Sales &amp; Marketing Report</h1>
        <p className="text-xs text-gray-500">Generated {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {headline.map(k => <Card key={k.label} {...k} />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(k => <Card key={k.label} {...k} />)}
      </div>

      {/* Pacing — are we where we should be by today? */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Pacing</h3>
        <p className="text-xs text-gray-400 mb-4">Actual vs where the plan says you should be by today ({(r.elapsed * 100).toFixed(1)}% of the FY elapsed). Sales pacing follows the seasonal monthly targets; the centre line = exactly on pace.</p>
        <div className="grid md:grid-cols-2 gap-6">
          <PaceRow label="Sales vs target pace" actual={r.actualSalesYTD} expected={r.ytdTargetSales} colour="#0891b2" />
          <PaceRow label="Marketing spend vs budget pace" actual={r.spendYTD} expected={r.ytdBudgetSpend} colour="#0e7490" />
        </div>
      </div>

      {/* Monthly sales vs spend */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Monthly sales vs marketing spend</h3>
        <p className="text-xs text-gray-400 mb-3">Sales (solid, left axis) · spend (dashed, right axis)</p>
        <div className="h-64">
          <Line
            data={{
              labels: r.months.map(m => m.label),
              datasets: [
                { label: "Sales", data: r.months.map(m => m.sales || null), borderColor: "#0891b2", backgroundColor: "#0891b2", tension: 0.4, yAxisID: "y", pointRadius: 3, pointHoverRadius: 5, spanGaps: true, borderWidth: 2 },
                { label: "Marketing spend", data: r.months.map(m => m.spend || null), borderColor: "#0e7490", backgroundColor: "#0e7490", borderDash: [5, 4], tension: 0.4, yAxisID: "y1", pointRadius: 3, pointHoverRadius: 5, spanGaps: true, borderWidth: 2 },
              ],
            }}
            options={{
              responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
              plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? 0)}` } } },
              scales: {
                x: { grid: { display: false } },
                y:  { position: "left",  beginAtZero: true, ticks: { callback: v => fmt(v as number), maxTicksLimit: 6 }, grid: { color: "#f3f4f6" } },
                y1: { position: "right", beginAtZero: true, ticks: { callback: v => fmt(v as number), maxTicksLimit: 6 }, grid: { display: false } },
              },
            }}
          />
        </div>
      </div>

      {/* Budget vs spend + Sales comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Budget vs spend</h3>
          <p className="text-xs text-gray-400 mb-3">Marketing budget utilisation</p>
          <div className="flex items-center gap-5">
            <div className="relative w-32 h-32 shrink-0">
              <Doughnut
                data={{ labels: ["Spent", "Remaining"], datasets: [{ data: [r.spendYTD, Math.max(0, remaining)], backgroundColor: ["#0e7490", "#e5e7eb"], borderWidth: 0 }] }}
                options={{ cutout: "70%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed as number)}` } } } }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-800">{usedPct.toFixed(1)}%</span>
                <span className="text-[10px] text-gray-400">of budget used</span>
              </div>
            </div>
            <div className="flex-1 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-gray-500">Spent</span><span className="font-semibold">{fmt(r.spendYTD)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining</span><span className="font-semibold">{fmt(remaining)}</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-gray-500">Total budget</span><span className="font-semibold">{fmt(r.marketingBudgetFY)}</span></div>
              <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5 mt-1">
                {elapsedPct.toFixed(1)}% of year elapsed · {Math.abs(behind).toFixed(0)} pts {behind >= 0 ? "behind" : "ahead of"} pace
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Sales: prior year vs target vs actual</h3>
          <p className="text-xs text-gray-400 mb-3">Prior yr actual · target · actual</p>
          <div className="h-40">
            <Bar
              data={{
                labels: ["Prior yr actual", "Target", "Actual"],
                datasets: [{ data: [r.priorYearActual, r.salesTargetFY, r.actualSalesYTD], backgroundColor: ["#cbd5e1", "#0e7490", "#0891b2"], borderRadius: 4, barThickness: 22 }],
              }}
              options={{
                indexAxis: "y", responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.x ?? 0)}` } } },
                scales: { x: { ticks: { callback: v => fmt(v as number) }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false } } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Channel donuts */}
      <div className="grid md:grid-cols-2 gap-4">
        <DonutCard title="Marketing budget by channel" subtitle="Planned budget across channels" slices={r.budgetByChannel} total={r.marketingBudgetFY} />
        <DonutCard title="Spend by channel" subtitle="Actual spend across channels" slices={r.spendByChannel} total={r.spendYTD} />
      </div>

      {/* Email contribution — Klaviyo-attributed revenue vs the paid channels */}
      {r.emailRevenueYTD > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Email revenue · Klaviyo attributed</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["Email revenue YTD", fmt(r.emailRevenueYTD)],
              ["% of total sales", `${(r.emailPctOfSales * 100).toFixed(1)}%`],
              ["Flows (automated)", fmt(r.emailFlowRevenueYTD)],
              ["Campaigns (sent)", fmt(r.emailCampaignRevenueYTD)]].map(([l, v]) => (
              <div key={l} className="bg-gray-50/70 rounded-xl px-4 py-3">
                <p className="text-lg font-bold text-slate-800 leading-none">{v}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-1.5">{l}</p>
              </div>
            ))}
          </div>
          {(r.emailFlowRevenueYTD + r.emailCampaignRevenueYTD) > 0 && (
            <div className="mt-3">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-emerald-400" style={{ width: `${(r.emailFlowRevenueYTD / (r.emailFlowRevenueYTD + r.emailCampaignRevenueYTD)) * 100}%` }} />
                <div className="bg-slate-700" style={{ width: `${(r.emailCampaignRevenueYTD / (r.emailFlowRevenueYTD + r.emailCampaignRevenueYTD)) * 100}%` }} />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                <span className="text-emerald-600 font-semibold">■ Flows</span> run themselves — <span className="text-slate-600 font-semibold">■ campaigns</span> take team effort. A healthy split leans on flows.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
