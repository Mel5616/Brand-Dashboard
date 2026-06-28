"use client";

import React from "react";
import { fmt, fmtFull } from "@/lib/format";
import type {
  Brand, BrandSummary, GoogleAdsRow, MetaAdsRow, KlaviyoRow,
  GscMetricRow, SemrushMetricRow, GscInsight, BrandInsightRow,
} from "@/lib/db";

const latest = <T extends { brand_id: number; month_key: string }>(rows: T[], id: number) =>
  rows.filter(r => r.brand_id === id).sort((a, b) => a.month_key.localeCompare(b.month_key)).slice(-1)[0];

// Pull the trailing "Priority: ..." line out of a Brand Health narrative.
function priorityOf(content: string): string | null {
  const i = content.toLowerCase().lastIndexOf("priority");
  if (i < 0) return null;
  return content.slice(i).replace(/priority[:\s]*\**/i, "").replace(/\*/g, "").trim() || null;
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : "text-slate-800";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2.5">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold leading-none mt-1 ${c}`}>{value}</p>
    </div>
  );
}

export function InsightsPanel({
  scope, brands, brandInsights, gscInsights, summaries, googleAds, metaAds, klaviyo, gscMetrics, semrushMetrics, onSelectBrand,
}: {
  scope: number | "all";
  brands: Brand[];
  brandInsights: BrandInsightRow[];
  gscInsights: GscInsight[];
  summaries: BrandSummary[];
  googleAds: GoogleAdsRow[];
  metaAds: MetaAdsRow[];
  klaviyo: KlaviyoRow[];
  gscMetrics: GscMetricRow[];
  semrushMetrics: SemrushMetricRow[];
  onSelectBrand: (id: number) => void;
}) {
  // ── Portfolio view ──────────────────────────────────────────────────────
  if (scope === "all") {
    const digest = brandInsights.find(x => x.brand_id === -1)?.content;
    const priorities = brands
      .map(b => ({ b, content: brandInsights.find(x => x.brand_id === b.id)?.content }))
      .filter(x => x.content)
      .map(x => ({ b: x.b, priority: priorityOf(x.content!) || x.content!.slice(0, 160) }));

    return (
      <div className="space-y-4">
        {digest && (
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl px-5 py-4">
            <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5 mb-1.5">✨ Portfolio digest <span className="text-[11px] font-normal text-emerald-400">what changed this month, ranked by attention</span></h3>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{digest}</p>
          </div>
        )}
        {priorities.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 px-1 mb-2">Brand priorities</p>
            <div className="grid gap-3 md:grid-cols-2">
              {priorities.map(({ b, priority }) => (
                <button key={b.id} onClick={() => onSelectBrand(b.id)} className="text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 hover:shadow transition motion-reduce:transition-none p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />
                    <span className="text-sm font-bold text-slate-700">{b.name}</span>
                    <span className="ml-auto text-[11px] text-emerald-500 font-medium">Open →</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-snug">{priority}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        {!digest && priorities.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
            No AI insights yet. They generate on the next sync.
          </div>
        )}
      </div>
    );
  }

  // ── Per-brand view ──────────────────────────────────────────────────────
  const brand = brands.find(b => b.id === scope)!;
  const health = brandInsights.find(x => x.brand_id === scope)?.content;
  const seo = gscInsights.find(x => x.brand_id === scope)?.content;

  const s = summaries.find(x => x.brand_id === scope);
  const g = latest(googleAds, scope), m = latest(metaAds, scope), k = latest(klaviyo, scope);
  const gs = latest(gscMetrics, scope), sr = latest(semrushMetrics, scope);
  const metaRoas = m && m.spend > 0 ? m.revenue / m.spend : 0;

  const cards: { label: string; value: string; tone?: "good" | "bad" }[] = [
    { label: "Sales MoM", value: s ? `${(s.mom_growth ?? 0) >= 0 ? "+" : ""}${(s.mom_growth ?? 0).toFixed(0)}%` : "—", tone: (s?.mom_growth ?? 0) >= 0 ? "good" : "bad" },
    { label: "Google ROAS", value: g && g.spend > 0 ? `${g.roas.toFixed(1)}×` : "—" },
    { label: "Meta ROAS", value: metaRoas ? `${metaRoas.toFixed(1)}×` : "—" },
    { label: "Email rev (mo)", value: k && k.emails_sent ? fmt(k.revenue) : "—" },
    { label: "SEO value /mo", value: sr ? fmtFull(sr.traffic_value) : (gs && gs.clicks ? `${gs.clicks.toLocaleString()} clicks` : "—") },
  ];

  if (!health && !seo && !s) {
    return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No insights for {brand?.name} yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(c => <Mini key={c.label} {...c} />)}
      </div>

      {health && (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5 mb-1">✨ Brand Health <span className="text-[11px] font-normal text-emerald-400">across sales, paid, email and search</span></h3>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{health}</p>
        </div>
      )}

      {seo && (
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1">🔍 SEO read <span className="text-[11px] font-normal text-gray-400">organic search</span></h3>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{seo}</p>
        </div>
      )}
    </div>
  );
}
