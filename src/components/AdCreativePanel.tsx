"use client";

import { useEffect, useState } from "react";

// Live ad creative (copy + images) for the Google/Meta Ads reporting tabs —
// same data the Marketing Snapshot report pulls from (google_ads_creatives/
// images, meta_ads_creatives/images), just shown here too so you don't have
// to go into a brand's Marketing Snapshot to see what's actually running.

type GoogleCreative = { id: number; campaign_name: string | null; ad_group: string | null; headlines: string[]; descriptions: string[]; clicks: number; final_url: string | null };
type GoogleImage = { id: number; campaign_name: string | null; asset_group: string | null; image_url: string; impressions?: number | null; clicks?: number | null };
type MetaCreative = { id: number; campaign_name: string | null; ad_name: string | null; title: string | null; body: string | null; clicks: number };
type MetaImage = { id: number; campaign_name: string | null; ad_name: string | null; image_url: string };

const domainOf = (u: string | null) => { if (!u) return "example.com"; try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function AdCreativePanel({ brandId, platform }: { brandId: number; platform: "google" | "meta" }) {
  const [creatives, setCreatives] = useState<(GoogleCreative | MetaCreative)[]>([]);
  const [images, setImages] = useState<(GoogleImage | MetaImage)[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = platform === "google" ? `/api/google-ads-creatives?brand_id=${brandId}` : `/api/meta-ads-creatives?brand_id=${brandId}`;
    fetch(url).then(r => r.json()).then(d => {
      setCreatives(d.creatives ?? []); setImages(d.images ?? []); setNeedsSetup(!!d.needsSetup);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [brandId, platform]);

  if (loading) return null;
  if (needsSetup) return null;
  if (creatives.length === 0 && images.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <SectionLabel platform={platform} />
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {images.map((img, i) => {
            const impressions = platform === "google" ? (img as GoogleImage).impressions : null;
            return (
              <figure key={img.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
                {platform === "google" && impressions != null && (
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-bold text-white bg-slate-800/80 rounded-full px-1.5 py-0.5">#{i + 1} · {impressions.toLocaleString()} impr.</span>
                )}
                <img src={img.image_url} alt={img.campaign_name || "Ad creative"} className="w-full aspect-square object-cover" onError={e => { (e.currentTarget.closest("figure") as HTMLElement)?.remove(); }} />
                <figcaption className="px-2 py-1.5 text-[10px] text-gray-400 truncate">{img.campaign_name || "—"}</figcaption>
              </figure>
            );
          })}
        </div>
      )}
      {creatives.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {creatives.map(c => platform === "google" ? <GoogleCard key={c.id} c={c as GoogleCreative} /> : <MetaCard key={c.id} c={c as MetaCreative} />)}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ platform }: { platform: "google" | "meta" }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{platform === "google" ? "Google" : "Meta"} — live ad creative</p>;
}

function GoogleCard({ c }: { c: GoogleCreative }) {
  const headline = c.headlines.slice(0, 3).join(" | ");
  const desc = c.descriptions.slice(0, 2).join(" ");
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
      <p className="text-xs font-semibold text-slate-700 truncate">{c.campaign_name || "—"}{c.ad_group ? <span className="text-gray-400 font-normal"> · {c.ad_group}</span> : ""}</p>
      <div className="mt-2 border border-gray-100 rounded-lg px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[12px] text-slate-800"><span className="text-[9px] font-bold text-white bg-slate-500 rounded px-1 leading-4">Ad</span>{domainOf(c.final_url)}</p>
        <p className="text-[15px] text-blue-800 leading-snug mt-0.5">{headline}</p>
        <p className="text-[12px] text-gray-500 leading-snug mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function MetaCard({ c }: { c: MetaCreative }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
      <p className="text-xs font-semibold text-slate-700 truncate">{c.campaign_name || "—"}{c.ad_name ? <span className="text-gray-400 font-normal"> · {c.ad_name}</span> : ""}</p>
      {c.title && <p className="text-[13px] font-semibold text-slate-800 mt-1.5">{c.title}</p>}
      {c.body && <p className="text-[12px] text-gray-500 leading-snug mt-0.5 line-clamp-3">{c.body}</p>}
    </div>
  );
}
