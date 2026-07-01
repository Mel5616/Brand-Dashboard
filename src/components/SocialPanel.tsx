"use client";

import React from "react";
import type { Brand, InstagramOrganicRow, InstagramMediaRow } from "@/lib/db";

const num = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : Math.round(n).toLocaleString());
const eng = (m: InstagramMediaRow) => (m.like_count || 0) + (m.comments_count || 0);

// Little labelled stat used in the brand header (avg likes / comments / eng. rate).
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center px-3 first:pl-0">
      <p className="text-sm font-bold text-slate-800 leading-none tabular-nums">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
        {accent && <span className="w-2 h-2 rounded-full inline-block" style={{ background: accent }} />}{label}
      </p>
      <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{value}</p>
    </div>
  );
}

function PostTile({ m }: { m: InstagramMediaRow }) {
  const date = m.posted_at ? new Date(m.posted_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
  return (
    <a href={m.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="group block rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition motion-reduce:transition-none">
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {m.image_url
          ? <img src={m.image_url} alt={m.caption?.slice(0, 60) ?? "Instagram post"} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 motion-reduce:transition-none" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">▦</div>}
        {m.media_type === "VIDEO" && <span className="absolute top-2 right-2 text-white text-xs bg-black/40 rounded px-1.5">▶</span>}
        {m.media_type === "CAROUSEL_ALBUM" && <span className="absolute top-2 right-2 text-white text-xs bg-black/40 rounded px-1.5">▦</span>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-2 flex items-center gap-3 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition motion-reduce:transition-none">
          <span>♥ {num(m.like_count || 0)}</span><span>💬 {num(m.comments_count || 0)}</span>
        </div>
      </div>
      <div className="p-2.5">
        <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 min-h-[2.2em]">{m.caption || "—"}</p>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
          <span>♥ {num(m.like_count || 0)} · 💬 {num(m.comments_count || 0)}</span>
          <span>{date}</span>
        </div>
      </div>
    </a>
  );
}

export function SocialPanel({
  scope, brands, instagramOrganic, instagramMedia, monthKeys, onSelectBrand,
}: {
  scope: number | "all";
  brands: Brand[];
  instagramOrganic: InstagramOrganicRow[];
  instagramMedia: InstagramMediaRow[];
  monthKeys: string[];
  onSelectBrand: (id: number) => void;
}) {
  const [sort, setSort] = React.useState<"recent" | "top">("recent");
  const latestFollowers = (id: number) =>
    [...instagramOrganic].filter(d => d.brand_id === id && (d.followers ?? 0) > 0)
      .sort((a, b) => b.month_key.localeCompare(a.month_key))[0]?.followers ?? 0;

  // Engagement summary from a brand's synced posts: averages + engagement rate.
  const brandStats = (id: number) => {
    const posts = instagramMedia.filter(m => m.brand_id === id);
    const n = posts.length;
    const likes = posts.reduce((s, m) => s + (m.like_count || 0), 0);
    const comments = posts.reduce((s, m) => s + (m.comments_count || 0), 0);
    const followers = latestFollowers(id);
    const avgEng = n ? (likes + comments) / n : 0;
    const rate = followers > 0 && n ? (avgEng / followers) * 100 : 0;
    return { n, followers, avgLikes: n ? likes / n : 0, avgComments: n ? comments / n : 0, rate };
  };

  // ── Portfolio view ──────────────────────────────────────────────────────
  if (scope === "all") {
    const withPosts = brands.filter(b => instagramMedia.some(m => m.brand_id === b.id));
    if (!withPosts.length) {
      return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No Instagram posts synced yet.</div>;
    }
    return (
      <div className="space-y-4">
        {withPosts.map(b => {
          const posts = instagramMedia
            .filter(m => m.brand_id === b.id)
            .sort((x, y) => new Date(y.posted_at ?? 0).getTime() - new Date(x.posted_at ?? 0).getTime())
            .slice(0, 15);
          const s = brandStats(b.id);
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              {/* Brand header: prominent followers + engagement stats */}
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <button onClick={() => onSelectBrand(b.id)} className="flex items-center gap-2.5 group min-w-0">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: b.color }}>{b.name[0]}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 truncate">{b.name}</span>
                      <span className="text-[11px] text-emerald-500 font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap">Open →</span>
                    </span>
                    <span className="flex items-baseline gap-1">
                      <span className="text-lg font-extrabold text-slate-900 leading-none tabular-nums">{num(s.followers)}</span>
                      <span className="text-[11px] text-gray-400 font-medium">followers</span>
                    </span>
                  </span>
                </button>
                <div className="flex items-stretch divide-x divide-gray-100">
                  <Stat label="⌀ Likes" value={num(s.avgLikes)} />
                  <Stat label="⌀ Comments" value={num(s.avgComments)} />
                  <Stat label="Eng. rate" value={s.rate > 0 ? s.rate.toFixed(1) + "%" : "—"} />
                  <Stat label="Posts" value={String(s.n)} />
                </div>
              </div>
              {/* Instagram-style horizontal feed — swipe/scroll through posts */}
              <div className="flex gap-3 overflow-x-auto pb-1 snap-x [scrollbar-width:thin] [scrollbar-color:#e5e7eb_transparent]">
                {posts.map(m => (
                  <div key={m.media_id} className="snap-start shrink-0 w-40 sm:w-44">
                    <PostTile m={m} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Per-brand view ──────────────────────────────────────────────────────
  const brand = brands.find(b => b.id === scope)!;
  const ig = instagramOrganic.filter(d => d.brand_id === scope);
  const latest = [...ig].sort((a, b) => b.month_key.localeCompare(a.month_key))[0];
  const posts = instagramMedia.filter(m => m.brand_id === scope);
  const sorted = sort === "top"
    ? [...posts].sort((a, b) => eng(b) - eng(a))
    : [...posts].sort((a, b) => new Date(b.posted_at ?? 0).getTime() - new Date(a.posted_at ?? 0).getTime());

  return (
    <div className="space-y-4">
      {(() => {
        const s = brandStats(scope);
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card label="Followers" value={num(s.followers)} accent="#E1306C" />
            <Card label="Eng. rate" value={s.rate > 0 ? s.rate.toFixed(1) + "%" : "—"} accent="#f59e0b" />
            <Card label="Avg likes / post" value={s.n ? num(s.avgLikes) : "—"} accent="#ef4444" />
            <Card label="Avg comments / post" value={s.n ? num(s.avgComments) : "—"} accent="#0ea5e9" />
            <Card label="Reach (latest mo.)" value={latest?.reach ? num(latest.reach) : "—"} accent="#3b82f6" />
            <Card label="Accounts engaged" value={latest?.accounts_engaged ? num(latest.accounts_engaged) : "—"} accent="#10b981" />
          </div>
        );
      })()}

      {posts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
          No posts synced for {brand?.name} yet.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Recent posts</p>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["recent", "top"] as const).map(s => (
                <button key={s} onClick={() => setSort(s)} className={`px-3 py-1 rounded-md text-xs font-medium transition motion-reduce:transition-none ${sort === s ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {s === "recent" ? "Recent" : "Top performing"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {sorted.map(m => <PostTile key={m.media_id} m={m} />)}
          </div>
        </>
      )}
    </div>
  );
}
