"use client";

import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { fmt, fmtFull } from "@/lib/format";
import type { Brand, BrandMonthly, BrandWeekly, WeekLabel } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

const DEFAULT_MONTH_KEYS = ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];
const DEFAULT_MONTH_LABELS = ["Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26","Jun 26"];

type View = "monthly" | "year" | "weekly";

export function SalesChart({
  brands, monthly, weekly, weekLabels,
  monthKeys = DEFAULT_MONTH_KEYS, monthLabels = DEFAULT_MONTH_LABELS, fyLabel = "FY 2025–26",
}: {
  brands: Brand[];
  monthly: BrandMonthly[];
  weekly: BrandWeekly[];
  weekLabels: WeekLabel[];
  monthKeys?: string[];
  monthLabels?: string[];
  fyLabel?: string;
}) {
  const MONTH_KEYS = monthKeys;
  const MONTH_LABELS = monthLabels;
  const [view, setView] = useState<View>("monthly");
  const [selectedBrands, setSelectedBrands] = useState<Set<number>>(new Set(brands.map(b => b.id)));

  const liveBrands = brands.filter(b => b.live);

  function toggleBrand(id: number) {
    setSelectedBrands(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  // ── Monthly stacked bar ────────────────────────────────────────────────
  function monthlyChart() {
    const datasets = liveBrands
      .filter(b => selectedBrands.has(b.id))
      .map(brand => {
        const rows = monthly.filter(m => m.brand_id === brand.id);
        const data = MONTH_KEYS.map(mk => {
          const row = rows.find(r => r.month_key === mk);
          return row?.revenue ?? 0;
        });
        return { label: brand.name, data, backgroundColor: brand.color, stack: "s" };
      });

    return (
      <Bar
        data={{ labels: MONTH_LABELS, datasets }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}`,
              footer: items => `Total: ${fmtFull(items.reduce((s, i) => s + (i.parsed.y ?? 0), 0))}`,
            },
          }},
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: v => fmt(v as number) }, grid: { color: "#f3f4f6" } },
          },
        }}
      />
    );
  }

  // ── FY share doughnut ──────────────────────────────────────────────────
  function yearChart() {
    const totals = liveBrands
      .filter(b => selectedBrands.has(b.id))
      .map(brand => {
        const total = monthly.filter(m => m.brand_id === brand.id).reduce((s, m) => s + (m.revenue ?? 0), 0);
        return { brand, total };
      })
      .filter(x => x.total > 0);

    const grandTotal = totals.reduce((s, x) => s + x.total, 0);

    return (
      <div className="flex items-center gap-8 h-full">
        <div className="flex-1 h-full max-h-64">
          <Doughnut
            data={{
              labels: totals.map(x => x.brand.name),
              datasets: [{ data: totals.map(x => x.total), backgroundColor: totals.map(x => x.brand.color), borderWidth: 2, borderColor: "#fff" }],
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                  label: ctx => {
                    const val = ctx.parsed;
                    const pct = grandTotal ? ((val / grandTotal) * 100).toFixed(1) : "0";
                    return ` ${ctx.label}: ${fmtFull(val)} (${pct}%)`;
                  },
                }},
              },
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-xs min-w-40">
          {totals.map(({ brand, total }) => (
            <div key={brand.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: brand.color }} />
              <span className="text-gray-600 truncate">{brand.name}</span>
              <span className="ml-auto font-semibold text-gray-800">{fmt(total)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Weekly stacked bar ────────────────────────────────────────────────
  function weeklyChart() {
    const labels = weekLabels.map(w => w.label);
    const weekStarts = weekLabels.map(w => w.week_start);

    const datasets = liveBrands
      .filter(b => selectedBrands.has(b.id))
      .map(brand => {
        const rows = weekly.filter(w => w.brand_id === brand.id);
        const data = weekStarts.map(ws => {
          const row = rows.find(r => r.week_start === ws);
          return row?.revenue ?? 0;
        });
        return { label: brand.name, data, backgroundColor: brand.color, stack: "s" };
      });

    return (
      <Bar
        data={{ labels, datasets }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}`,
              footer: items => `Total: ${fmtFull(items.reduce((s, i) => s + (i.parsed.y ?? 0), 0))}`,
            },
          }},
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: v => fmt(v as number) }, grid: { color: "#f3f4f6" } },
          },
        }}
      />
    );
  }

  const viewLabels: { id: View; label: string }[] = [
    { id: "monthly", label: "Monthly" },
    { id: "year", label: "Year on Year" },
    { id: "weekly", label: "Weekly" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">
            {view === "monthly" && "Monthly Revenue"}
            {view === "year" && `${fyLabel} Sales Share by Brand`}
            {view === "weekly" && "Weekly Revenue (Rolling 13 Weeks)"}
          </h2>
          <p className="text-xs text-green-600 mt-0.5">All figures ex-GST</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {viewLabels.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${view === v.id ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Brand toggles — hidden when only one brand is shown */}
      {liveBrands.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {liveBrands.map(b => (
            <button
              key={b.id}
              onClick={() => toggleBrand(b.id)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition ${selectedBrands.has(b.id) ? "text-white border-transparent" : "bg-transparent border-gray-200 text-gray-400"}`}
              style={selectedBrands.has(b.id) ? { background: b.color, borderColor: b.color } : {}}
            >
              {b.init}
            </button>
          ))}
        </div>
      )}

      <div className="h-64">
        {view === "monthly" && monthlyChart()}
        {view === "year" && yearChart()}
        {view === "weekly" && weeklyChart()}
      </div>
    </div>
  );
}
