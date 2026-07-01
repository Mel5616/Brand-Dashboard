"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, KlaviyoRow } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

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

export function EmailBrandDetail({
  brand, klaviyo, monthly, monthKeys, monthLabels,
}: {
  brand: Brand;
  klaviyo: KlaviyoRow[];
  monthly: { brand_id: number; month_key: string; revenue: number }[];
  monthKeys: string[];
  monthLabels: string[];
}) {
  const hist = monthKeys.map(mk => klaviyo.find(d => d.brand_id === brand.id && d.month_key === mk));
  const storeRev = sum(monthly.filter(m => m.brand_id === brand.id).map(m => m.revenue));

  // FY-to-date aggregates
  const delivered = sum(hist.map(r => r?.emails_sent ?? 0));
  const revenue   = sum(hist.map(r => r?.revenue ?? 0));
  const orders    = sum(hist.map(r => r?.orders ?? 0));
  const unsubs    = sum(hist.map(r => r?.unsubscribes ?? 0));
  const bounces   = sum(hist.map(r => r?.bounces ?? 0));
  const flowRev   = sum(hist.map(r => r?.flow_revenue ?? 0));
  const campRev   = sum(hist.map(r => r?.campaign_revenue ?? 0));
  const subscribers = [...hist].reverse().find(r => (r?.list_size ?? 0) > 0)?.list_size ?? 0;

  const openRate  = delivered > 0 ? sum(hist.map(r => (r?.open_rate ?? 0) * (r?.emails_sent ?? 0))) / delivered : 0;
  const clickRate = delivered > 0 ? sum(hist.map(r => (r?.click_rate ?? 0) * (r?.emails_sent ?? 0))) / delivered : 0;
  const unsubRate = delivered > 0 ? (unsubs / delivered) * 100 : 0;
  const aov       = orders > 0 ? revenue / orders : 0;
  const flowShare = (flowRev + campRev) > 0 ? (flowRev / (flowRev + campRev)) * 100 : 0;
  const pctOfRev  = storeRev > 0 ? (revenue / storeRev) * 100 : 0;

  if (delivered === 0 && revenue === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">✉️</div>
        <p className="text-gray-500 font-medium">No Klaviyo email activity for {brand.name} this year</p>
      </div>
    );
  }

  const kpisTop = [
    { label: "Email Revenue (FY)", value: fmtFull(revenue), accent: "#14b8a6" },
    { label: "Subscribers", value: subscribers > 0 ? subscribers.toLocaleString() : "—", accent: "#0ea5e9" },
    { label: "Email Orders (FY)", value: orders.toLocaleString(), accent: "#0e7490" },
    { label: "% of Total Revenue", value: storeRev > 0 ? pctOfRev.toFixed(1) + "%" : "—", accent: "#14b8a6" },
  ];
  const kpisBot = [
    { label: "Delivered (FY)", value: delivered.toLocaleString() },
    { label: "Open Rate", value: openRate.toFixed(1) + "%" },
    { label: "Click Rate", value: clickRate.toFixed(1) + "%" },
    { label: "Avg Order Value", value: orders > 0 ? fmt(aov) : "—" },
    { label: "Unsub Rate", value: unsubRate.toFixed(2) + "%" },
    { label: "Flow Share", value: (flowRev + campRev) > 0 ? flowShare.toFixed(0) + "%" : "—" },
  ];

  return (
    <div id="brand-report" className="space-y-4">
      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-bold text-slate-900">{brand.name} — Email Marketing Report</h1>
        <p className="text-xs text-gray-500">Generated {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpisTop.map(k => <Card key={k.label} {...k} />)}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpisBot.map(k => <Card key={k.label} {...k} />)}
      </div>

      {/* Email revenue — flow vs campaign */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Email revenue — flow vs campaign</h3>
        <p className="text-xs text-gray-400 mb-3">Automated flows vs one-off campaigns, attributed</p>
        <div className="h-56">
          <Bar
            data={{
              labels: monthLabels,
              datasets: [
                { label: "Flow", data: hist.map(r => r?.flow_revenue ?? 0), backgroundColor: "#10b981", stack: "r" },
                { label: "Campaign", data: hist.map(r => r?.campaign_revenue ?? 0), backgroundColor: "#1e3a5f", stack: "r" },
              ],
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? 0)}` } } },
              scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => fmt(v as number) }, grid: { color: "#f3f4f6" } } },
            }}
          />
        </div>
      </div>

      {/* Engagement */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Engagement &amp; list health</h3>
        <p className="text-xs text-gray-400 mb-3">Open % and click % (left) · unsubscribe % (right)</p>
        <div className="h-56">
          <Line
            data={{
              labels: monthLabels,
              datasets: [
                { label: "Open %", data: hist.map(r => r?.open_rate ?? 0), borderColor: "#10b981", yAxisID: "y", tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: "Click %", data: hist.map(r => r?.click_rate ?? 0), borderColor: "#3b82f6", yAxisID: "y", tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: "Unsub %", data: hist.map(r => (r?.emails_sent ?? 0) > 0 ? ((r?.unsubscribes ?? 0) / r!.emails_sent) * 100 : 0), borderColor: "#ef4444", yAxisID: "y1", tension: 0.4, pointRadius: 0, borderWidth: 2, borderDash: [4, 3] },
              ],
            }}
            options={{
              responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
              plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${(c.parsed.y ?? 0).toFixed(2)}%` } } },
              scales: {
                x: { grid: { display: false } },
                y:  { position: "left",  ticks: { callback: v => `${v}%` }, grid: { color: "#f3f4f6" } },
                y1: { position: "right", ticks: { callback: v => `${v}%` }, grid: { display: false } },
              },
            }}
          />
        </div>
      </div>

      {/* Monthly detail table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Monthly detail</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
              <th className="text-left font-medium py-1.5">Month</th>
              <th className="font-medium">Delivered</th><th className="font-medium">Open %</th><th className="font-medium">Click %</th>
              <th className="font-medium">Orders</th><th className="font-medium">Email Rev</th>
              <th className="font-medium">Flow</th><th className="font-medium">Campaign</th>
              <th className="font-medium">Unsub</th><th className="font-medium">Bounce</th>
            </tr>
          </thead>
          <tbody>
            {monthKeys.map((mk, i) => {
              const r = hist[i];
              if (!r || (r.emails_sent === 0 && r.revenue === 0)) return null;
              return (
                <tr key={mk} className="text-right border-b border-gray-50 text-slate-700">
                  <td className="text-left py-1.5 font-medium">{monthLabels[i]}</td>
                  <td>{(r.emails_sent ?? 0).toLocaleString()}</td>
                  <td>{(r.open_rate ?? 0).toFixed(1)}%</td>
                  <td>{(r.click_rate ?? 0).toFixed(1)}%</td>
                  <td>{(r.orders ?? 0).toLocaleString()}</td>
                  <td className="font-semibold">{fmt(r.revenue ?? 0)}</td>
                  <td>{fmt(r.flow_revenue ?? 0)}</td>
                  <td>{fmt(r.campaign_revenue ?? 0)}</td>
                  <td>{(r.unsubscribes ?? 0).toLocaleString()}</td>
                  <td>{(r.bounces ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
