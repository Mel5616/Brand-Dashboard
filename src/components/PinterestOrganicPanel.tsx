"use client";

import React from "react";
import type { Brand } from "@/lib/db";
import { SkeletonCard } from "./Skeleton";

// Organic (non-paid) Pinterest performance: per-brand profile stats, monthly
// engagement, and the top pins of the trailing 30 days as a visual grid.

type OrganicRow = {
  brand_id: number; month_key: string;
  impressions: number; engagement: number; pin_clicks: number; outbound_clicks: number; saves: number;
  followers: number; monthly_views: number; pin_count: number;
};
type TopPin = {
  brand_id: number; pin_id: string; rank: number; title: string | null; link: string | null;
  image_url: string | null; impressions: number; engagement: number; pin_clicks: number;
  outbound_clicks: number; saves: number;
};

const n = (v: number) => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toLocaleString();

export function PinterestOrganicPanel({ brands, brandFilter }: { brands: Brand[]; brandFilter: number | "all" }) {
  const [months, setMonths] = React.useState<OrganicRow[]>([]);
  const [pins, setPins] = React.useState<TopPin[]>([]);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/pinterest-organic")
      .then(r => r.json())
      .then(d => { setMonths(d.months ?? []); setPins(d.pins ?? []); setNeedsSetup(!!d.needsSetup); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <SkeletonCard title="Organic Pinterest" lines={4} />;
  if (needsSetup) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Organic Pinterest</h2>
        <p className="text-sm text-gray-400">Run <code className="bg-gray-100 px-1 rounded">supabase/add_pinterest_organic.sql</code>, then the next sync fills this in.</p>
      </div>
    );
  }
  if (months.length === 0) return null;

  const activeIds = Array.from(new Set(months.map(m => m.brand_id)))
    .filter(id => brandFilter === "all" || id === brandFilter);
  if (activeIds.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Organic Pinterest</h2>
        <p className="text-xs text-gray-400 mt-0.5">Profile reach &amp; engagement outside paid ads · top pins are the trailing 30 days</p>
      </div>

      <div className="space-y-6">
        {activeIds.map(id => {
          const brand = brands.find(b => b.id === id);
          const rows = months.filter(m => m.brand_id === id);
          const latest = rows[rows.length - 1];
          const snap = [...rows].reverse().find(r => r.followers > 0 || r.pin_count > 0) ?? latest;
          const brandPins = pins.filter(p => p.brand_id === id && p.image_url);
          const mLabel = (() => { const [y, m] = latest.month_key.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short" }); })();
          const kpis = [
            { label: "Followers", value: n(snap.followers) },
            { label: "Monthly views", value: n(snap.monthly_views) },
            { label: "Pins", value: n(snap.pin_count) },
            { label: `${mLabel} impressions`, value: n(latest.impressions) },
            { label: `${mLabel} engagement`, value: n(latest.engagement) },
            { label: `${mLabel} outbound clicks`, value: n(latest.outbound_clicks) },
          ];
          return (
            <div key={id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ background: brand?.color ?? "#94a3b8" }} />
                <span className="text-sm font-semibold text-gray-800">{brand?.name ?? `Brand ${id}`}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
                {kpis.map(k => (
                  <div key={k.label} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-gray-400 leading-tight">{k.label}</p>
                    <p className="font-bold text-gray-900">{k.value}</p>
                  </div>
                ))}
              </div>
              {brandPins.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {brandPins.map(p => (
                    <a
                      key={p.pin_id}
                      href={p.link ?? undefined}
                      target="_blank" rel="noopener noreferrer"
                      title={`${p.title ?? "Pin"} — ${n(p.impressions)} impressions · ${n(p.pin_clicks)} clicks · ${p.saves} saves`}
                      className="group relative block aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 border border-gray-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image_url!} alt={p.title ?? "Pin"} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 opacity-0 group-hover:opacity-100 transition">
                        <p className="text-[10px] text-white font-medium leading-tight">{n(p.impressions)} views</p>
                      </div>
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold rounded px-1">#{p.rank}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
