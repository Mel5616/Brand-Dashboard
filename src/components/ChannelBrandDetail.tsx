"use client";

import React from "react";
import { fmt } from "@/lib/format";

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

type GoogleCampaign = { brand_id: number; month_key: string; campaign_name: string; spend: number; impressions: number; clicks: number; conversions: number; conv_value: number };
type MetaPlatform   = { brand_id: number; month_key: string; platform: string; spend: number; impressions: number; clicks: number; purchases: number; revenue: number };

function roasBadge(roas: number) {
  if (!roas) return <span className="text-gray-300">—</span>;
  const cls = roas >= 2 ? "bg-emerald-50 text-emerald-600" : roas >= 1.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-500";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{roas.toFixed(2)}×</span>;
}

/** Google Ads — campaign-level table for a single brand, aggregated across the FY. */
export function GoogleCampaignTable({ campaigns, brandId, fyLabel }: { campaigns: GoogleCampaign[]; brandId: number; fyLabel: string }) {
  const rows = campaigns.filter(c => c.brand_id === brandId);
  const names = [...new Set(rows.map(r => r.campaign_name))];
  const agg = names.map(name => {
    const rs = rows.filter(r => r.campaign_name === name);
    const spend = sum(rs.map(r => r.spend)), impr = sum(rs.map(r => r.impressions)), clicks = sum(rs.map(r => r.clicks));
    const conv = sum(rs.map(r => r.conversions)), val = sum(rs.map(r => r.conv_value));
    return { name, spend, impr, clicks, conv, val, roas: spend > 0 ? val / spend : 0, ctr: impr > 0 ? (clicks / impr) * 100 : 0, cpc: clicks > 0 ? spend / clicks : 0 };
  }).filter(r => r.spend > 0).sort((a, b) => b.spend - a.spend);

  if (!agg.length) return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No Google Ads campaigns for this brand in {fyLabel}.</div>;

  const tot = { spend: sum(agg.map(r => r.spend)), impr: sum(agg.map(r => r.impr)), clicks: sum(agg.map(r => r.clicks)), conv: sum(agg.map(r => r.conv)), val: sum(agg.map(r => r.val)) };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto mt-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-0.5">Campaigns — {fyLabel}</h3>
      <p className="text-xs text-gray-400 mb-3">Google Ads performance by campaign</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
            <th className="text-left font-medium py-1.5">Campaign</th>
            <th className="font-medium">Spend</th><th className="font-medium">Revenue</th><th className="font-medium">ROAS</th>
            <th className="font-medium">Impr.</th><th className="font-medium">Clicks</th><th className="font-medium">CTR</th><th className="font-medium">CPC</th><th className="font-medium">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {agg.map(r => (
            <tr key={r.name} className="text-right border-b border-gray-50 text-slate-700">
              <td className="text-left py-1.5 font-medium max-w-[280px] truncate" title={r.name}>{r.name}</td>
              <td>{fmt(r.spend)}</td><td className="font-semibold">{fmt(r.val)}</td><td>{roasBadge(r.roas)}</td>
              <td>{r.impr.toLocaleString()}</td><td>{r.clicks.toLocaleString()}</td><td>{r.ctr.toFixed(1)}%</td><td>{fmt(r.cpc)}</td><td>{r.conv.toFixed(0)}</td>
            </tr>
          ))}
          <tr className="text-right font-bold text-slate-800 border-t-2 border-gray-100">
            <td className="text-left py-2">Total</td>
            <td>{fmt(tot.spend)}</td><td>{fmt(tot.val)}</td><td>{roasBadge(tot.spend > 0 ? tot.val / tot.spend : 0)}</td>
            <td>{tot.impr.toLocaleString()}</td><td>{tot.clicks.toLocaleString()}</td><td>{tot.impr > 0 ? ((tot.clicks / tot.impr) * 100).toFixed(1) : "0"}%</td><td>{fmt(tot.clicks > 0 ? tot.spend / tot.clicks : 0)}</td><td>{tot.conv.toFixed(0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Meta Ads — platform (Facebook / Instagram / …) breakdown for a single brand, FY. */
export function MetaPlatformBreakdown({ rows, brandId, fyLabel }: { rows: MetaPlatform[]; brandId: number; fyLabel: string }) {
  const brs = rows.filter(r => r.brand_id === brandId);
  const platforms = [...new Set(brs.map(r => r.platform))];
  const agg = platforms.map(p => {
    const rs = brs.filter(r => r.platform === p);
    const spend = sum(rs.map(r => r.spend)), impr = sum(rs.map(r => r.impressions)), clicks = sum(rs.map(r => r.clicks));
    const purch = sum(rs.map(r => r.purchases)), rev = sum(rs.map(r => r.revenue));
    return { p, spend, impr, clicks, purch, rev, roas: spend > 0 ? rev / spend : 0, ctr: impr > 0 ? (clicks / impr) * 100 : 0 };
  }).filter(r => r.spend > 0).sort((a, b) => b.spend - a.spend);

  if (!agg.length) return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No Meta platform data for this brand in {fyLabel}.</div>;

  const tot = { spend: sum(agg.map(r => r.spend)), impr: sum(agg.map(r => r.impr)), clicks: sum(agg.map(r => r.clicks)), purch: sum(agg.map(r => r.purch)), rev: sum(agg.map(r => r.rev)) };
  const nice = (p: string) => p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto mt-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-0.5">By placement — {fyLabel}</h3>
      <p className="text-xs text-gray-400 mb-3">Meta Ads performance by platform</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-right border-b border-gray-100">
            <th className="text-left font-medium py-1.5">Platform</th>
            <th className="font-medium">Spend</th><th className="font-medium">Revenue</th><th className="font-medium">ROAS</th>
            <th className="font-medium">Impr.</th><th className="font-medium">Clicks</th><th className="font-medium">CTR</th><th className="font-medium">Purchases</th>
          </tr>
        </thead>
        <tbody>
          {agg.map(r => (
            <tr key={r.p} className="text-right border-b border-gray-50 text-slate-700">
              <td className="text-left py-1.5 font-medium">{nice(r.p)}</td>
              <td>{fmt(r.spend)}</td><td className="font-semibold">{fmt(r.rev)}</td><td>{roasBadge(r.roas)}</td>
              <td>{r.impr.toLocaleString()}</td><td>{r.clicks.toLocaleString()}</td><td>{r.ctr.toFixed(1)}%</td><td>{r.purch.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="text-right font-bold text-slate-800 border-t-2 border-gray-100">
            <td className="text-left py-2">Total</td>
            <td>{fmt(tot.spend)}</td><td>{fmt(tot.rev)}</td><td>{roasBadge(tot.spend > 0 ? tot.rev / tot.spend : 0)}</td>
            <td>{tot.impr.toLocaleString()}</td><td>{tot.clicks.toLocaleString()}</td><td>{tot.impr > 0 ? ((tot.clicks / tot.impr) * 100).toFixed(1) : "0"}%</td><td>{tot.purch.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
