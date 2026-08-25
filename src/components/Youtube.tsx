"use client";

import { useEffect, useMemo, useState } from "react";

// Owned & Earned > YouTube: subscriber/view growth + a top-videos gallery,
// synced from the public YouTube Data API v3 (scripts/sync_youtube.py) — no
// OAuth, so any brand with a channel ID configured just works.

type Brand = { id: number; name: string; color?: string };
type Organic = { brand_id: number; month_key: string; subscribers: number; total_views: number; video_count: number; channel_title: string | null };
type Video = { id: number; brand_id: number; video_id: string; title: string | null; thumbnail_url: string | null; published_at: string | null; view_count: number; like_count: number; comment_count: number };

const num = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "";

export function Youtube({ scope, brands }: { scope: number | "all"; brands: Brand[] }) {
  const [organic, setOrganic] = useState<Organic[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = scope === "all" ? "/api/youtube" : `/api/youtube?brand_id=${scope}`;
    fetch(url).then(r => r.json()).then(d => {
      if (d.needsSetup) { setNeedsSetup(true); return; }
      setOrganic(d.organic ?? []); setVideos(d.videos ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [scope]);

  const brandOf = (id: number) => brands.find(b => b.id === id);

  // Latest + previous snapshot per brand, for a MoM subscriber delta.
  const latestByBrand = useMemo(() => {
    const m = new Map<number, { latest: Organic; prev: Organic | null }>();
    for (const b of brands) {
      const rows = organic.filter(o => o.brand_id === b.id).sort((a, c) => a.month_key.localeCompare(c.month_key));
      if (rows.length) m.set(b.id, { latest: rows[rows.length - 1], prev: rows.length > 1 ? rows[rows.length - 2] : null });
    }
    return m;
  }, [organic, brands]);

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_youtube.sql</code> to enable YouTube, then add a <code className="bg-gray-100 px-1 rounded">youtubeApiKey</code> and per-brand <code className="bg-gray-100 px-1 rounded">youtubeChannelId</code> to stores.config.json and run the sync.</div>;
  if (latestByBrand.size === 0) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No YouTube data synced yet{scope === "all" ? " for any brand" : " for this brand"}.</div>;

  if (scope === "all") {
    const rows = [...latestByBrand.entries()].sort((a, b) => b[1].latest.subscribers - a[1].latest.subscribers);
    return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Tile label="Total subscribers" value={num(rows.reduce((s, [, r]) => s + r.latest.subscribers, 0))} />
          <Tile label="Total views" value={num(rows.reduce((s, [, r]) => s + r.latest.total_views, 0))} />
          <Tile label="Channels synced" value={String(rows.length)} />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Brand</th><th className="px-4 py-3 text-right">Subscribers</th><th className="px-4 py-3 text-right">MoM</th><th className="px-4 py-3 text-right">Total views</th><th className="px-4 py-3 text-right">Videos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([bid, r]) => {
                const brand = brandOf(bid);
                const mom = r.prev ? r.latest.subscribers - r.prev.subscribers : null;
                return (
                  <tr key={bid} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: brand?.color || "#94a3b8" }} />{brand?.name ?? bid}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.latest.subscribers.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${mom == null ? "text-gray-300" : mom >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{mom == null ? "—" : `${mom >= 0 ? "+" : ""}${mom.toLocaleString()}`}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.latest.total_views.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{r.latest.video_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const entry = latestByBrand.get(scope);
  if (!entry) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No YouTube data synced yet for this brand.</div>;
  const mom = entry.prev ? entry.latest.subscribers - entry.prev.subscribers : null;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <Tile label="Subscribers" value={entry.latest.subscribers.toLocaleString()} sub={mom == null ? undefined : `${mom >= 0 ? "+" : ""}${mom.toLocaleString()} this month`} subColor={mom == null ? undefined : mom >= 0 ? "text-emerald-600" : "text-rose-500"} />
        <Tile label="Total views" value={num(entry.latest.total_views)} />
        <Tile label="Videos" value={String(entry.latest.video_count)} />
        <Tile label="Channel" value={entry.latest.channel_title || "—"} small />
      </div>

      {videos.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Top videos by views</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map(v => (
              <a key={v.id} href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">
                {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.title || ""} className="w-full aspect-video object-cover" />}
                <div className="p-3">
                  <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{v.title}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                    <span className="font-semibold text-slate-600">{num(v.view_count)} views</span>
                    <span>♥ {num(v.like_count)}</span>
                    <span>💬 {num(v.comment_count)}</span>
                    <span className="ml-auto">{fmtD(v.published_at)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, subColor, small }: { label: string; value: string; sub?: string; subColor?: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <p className={`font-extrabold text-slate-800 leading-none ${small ? "text-base truncate" : "text-2xl tabular-nums"}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1.5">{label}</p>
      {sub && <p className={`text-xs font-semibold mt-1 ${subColor ?? "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}
