"use client";

import React from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { Brand, GscMetricRow, GscQueryRow, GscInsight } from "@/lib/db";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const num = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : Math.round(n).toLocaleString());

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: string }) {
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
function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="text-gray-300">—</span>;
  const pct = ((now - prev) / prev) * 100;
  const good = invert ? pct < 0 : pct > 0; // for position, lower is better
  return <span className={good ? "text-emerald-500" : "text-red-500"}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%</span>;
}

export function SeoPanel({
  scope, brands, gscMetrics, gscQueries, gscInsights, monthKeys, monthLabels,
}: {
  scope: number | "all";
  brands: Brand[];
  gscMetrics: GscMetricRow[];
  gscQueries: GscQueryRow[];
  gscInsights: GscInsight[];
  monthKeys: string[];
  monthLabels: string[];
}) {
  const has = (id: number) => gscMetrics.some(m => m.brand_id === id && (m.clicks > 0 || m.impressions > 0));
  const seoBrands = brands.filter(b => has(b.id));

  if (seoBrands.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-gray-500 font-medium">No Search Console data yet</p>
        <p className="text-sm text-gray-400 mt-1">Share each brand property with the service account, then run the sync.</p>
      </div>
    );
  }

  // ── Portfolio leaderboard ──────────────────────────────────────────────
  if (scope === "all") {
    const rows = seoBrands.map(b => {
      const ms = monthKeys.map(mk => gscMetrics.find(m => m.brand_id === b.id && m.month_key === mk));
      const withData = ms.filter(m => m && (m.clicks > 0 || m.impressions > 0)) as GscMetricRow[];
      const latest = withData[withData.length - 1];
      const prev = withData[withData.length - 2];
      return { b, latest, prev, spark: ms.map(m => m?.clicks ?? 0) };
    }).filter(r => r.latest).sort((a, b) => (b.latest!.clicks) - (a.latest!.clicks));

    const tot = rows.reduce((a, r) => ({ clicks: a.clicks + r.latest!.clicks, impr: a.impr + r.latest!.impressions }), { clicks: 0, impr: 0 });

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Organic clicks (latest mo.)" value={num(tot.clicks)} accent="#10b981" />
          <Card label="Impressions (latest mo.)" value={num(tot.impr)} accent="#3b82f6" />
          <Card label="Brands with SEO" value={String(rows.length)} accent="#8b5cf6" />
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
          <h3 className="font-semibold text-gray-800 mb-0.5">Organic search leaderboard</h3>
          <p className="text-xs text-gray-400 mb-3">Latest month · Google Search Console</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
                <th className="text-left font-medium py-1.5">Brand</th>
                <th className="font-medium">Clicks</th><th className="font-medium">Impressions</th>
                <th className="font-medium">CTR</th><th className="font-medium">Avg position</th><th className="font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.b.id} className="text-right border-b border-gray-50 text-slate-700">
                  <td className="text-left py-2"><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.b.color }} />{r.b.name}</span></td>
                  <td className="font-semibold">{r.latest!.clicks.toLocaleString()} <span className="text-[10px] font-normal"><Delta now={r.latest!.clicks} prev={r.prev?.clicks ?? 0} /></span></td>
                  <td>{r.latest!.impressions.toLocaleString()}</td>
                  <td>{r.latest!.ctr.toFixed(1)}%</td>
                  <td>{r.latest!.position.toFixed(1)}</td>
                  <td><Sparkline values={r.spark} color={r.b.color} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Per-brand drill-down ───────────────────────────────────────────────
  const brand = brands.find(b => b.id === scope)!;
  if (!has(scope)) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-gray-500 font-medium">No Search Console data for {brand?.name}</p>
        <p className="text-sm text-gray-400 mt-1">Share its property with the service account to start tracking organic search.</p>
      </div>
    );
  }

  const ms = monthKeys.map(mk => gscMetrics.find(m => m.brand_id === scope && m.month_key === mk));
  const withData = ms.map((m, i) => ({ m, i })).filter(x => x.m && (x.m.clicks > 0 || x.m.impressions > 0));
  const li = withData[withData.length - 1]?.i ?? 0;
  const pi = withData[withData.length - 2]?.i;
  const latest = ms[li]!; const prev = pi != null ? ms[pi] : undefined;
  const latestKey = monthKeys[li];

  const lq = gscQueries.filter(q => q.brand_id === scope && q.month_key === latestKey).sort((a, b) => b.clicks - a.clicks);
  const pmap = prev ? Object.fromEntries(gscQueries.filter(q => q.brand_id === scope && q.month_key === monthKeys[pi!]).map(q => [q.query, q.position])) : {};
  const movers = lq.map(q => ({ ...q, delta: pmap[q.query] != null ? pmap[q.query] - q.position : null }));
  const up = movers.filter(q => q.delta != null && q.delta >= 1).sort((a, b) => (b.delta! - a.delta!)).slice(0, 6);
  const down = movers.filter(q => q.delta != null && q.delta <= -1).sort((a, b) => (a.delta! - b.delta!)).slice(0, 6);
  const insight = gscInsights.find(i => i.brand_id === scope);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label={`Clicks (${monthLabels[li]})`} value={latest.clicks.toLocaleString()} accent="#10b981" sub={<Delta now={latest.clicks} prev={prev?.clicks ?? 0} />} />
        <Card label="Impressions" value={num(latest.impressions)} accent="#3b82f6" sub={<Delta now={latest.impressions} prev={prev?.impressions ?? 0} />} />
        <Card label="CTR" value={latest.ctr.toFixed(1) + "%"} accent="#8b5cf6" sub={<Delta now={latest.ctr} prev={prev?.ctr ?? 0} />} />
        <Card label="Avg position" value={latest.position.toFixed(1)} accent="#f59e0b" sub={<Delta now={latest.position} prev={prev?.position ?? 0} invert />} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800">Visibility trend</h3>
        <p className="text-xs text-gray-400 mb-3">Organic clicks (left) and average position (right, lower is better)</p>
        <div className="h-56">
          <Line
            data={{
              labels: monthLabels,
              datasets: [
                { label: "Clicks", data: ms.map(m => m?.clicks ?? null), borderColor: "#10b981", backgroundColor: "#10b981", yAxisID: "y", tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: "Avg position", data: ms.map(m => (m && m.position ? m.position : null)), borderColor: "#f59e0b", borderDash: [4, 3], yAxisID: "y1", tension: 0.4, pointRadius: 0, borderWidth: 2 },
              ],
            }}
            options={{
              responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
              plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
              scales: {
                x: { grid: { display: false } },
                y: { position: "left", grid: { color: "#f3f4f6" }, ticks: { callback: v => num(v as number) } },
                y1: { position: "right", reverse: true, grid: { display: false }, title: { display: true, text: "position" } },
              },
            }}
          />
        </div>
      </div>

      {insight && (
        <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
          <h3 className="font-semibold text-indigo-900 mb-1 flex items-center gap-1.5">✨ AI SEO summary</h3>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{insight.content}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-emerald-700 mb-2">Gaining position</h3>
          {up.length ? up.map(q => (
            <div key={q.query} className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
              <span className="text-slate-700 truncate pr-2">{q.query}</span>
              <span className="text-emerald-600 font-medium shrink-0">▲ {q.delta!.toFixed(1)} · pos {q.position.toFixed(1)}</span>
            </div>
          )) : <p className="text-sm text-gray-400">No notable gains this month.</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-red-600 mb-2">Losing position</h3>
          {down.length ? down.map(q => (
            <div key={q.query} className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
              <span className="text-slate-700 truncate pr-2">{q.query}</span>
              <span className="text-red-500 font-medium shrink-0">▼ {Math.abs(q.delta!).toFixed(1)} · pos {q.position.toFixed(1)}</span>
            </div>
          )) : <p className="text-sm text-gray-400">No notable drops this month.</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="font-semibold text-gray-800 mb-0.5">Top queries — {monthLabels[li]}</h3>
        <p className="text-xs text-gray-400 mb-3">Search terms driving organic traffic</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
              <th className="text-left font-medium py-1.5">Query</th>
              <th className="font-medium">Clicks</th><th className="font-medium">Impressions</th><th className="font-medium">CTR</th><th className="font-medium">Position</th>
            </tr>
          </thead>
          <tbody>
            {lq.slice(0, 20).map(q => (
              <tr key={q.query} className="text-right border-b border-gray-50 text-slate-700">
                <td className="text-left py-1.5 max-w-[320px] truncate" title={q.query}>{q.query}</td>
                <td className="font-semibold">{q.clicks.toLocaleString()}</td>
                <td>{q.impressions.toLocaleString()}</td>
                <td>{q.ctr.toFixed(1)}%</td>
                <td>{q.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 0.001);
  const W = 80, H = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * H}`).join(" ");
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block overflow-visible"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" /></svg>;
}
