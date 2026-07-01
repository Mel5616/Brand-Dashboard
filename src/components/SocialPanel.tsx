"use client";

import React from "react";
import type { Brand, InstagramOrganicRow, InstagramMediaRow } from "@/lib/db";

const num = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : Math.round(n).toLocaleString());
const eng = (m: InstagramMediaRow) => (m.like_count || 0) + (m.comments_count || 0);
const postType = (m: InstagramMediaRow) => (m.media_type === "VIDEO" ? "Reels" : m.media_type === "CAROUSEL_ALBUM" ? "Carousels" : "Photos");
const shortDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "");
const mLabel = (mk: string) => new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Data helpers ────────────────────────────────────────────────────────────
function computeStats(media: InstagramMediaRow[], organic: InstagramOrganicRow[], id: number) {
  const posts = media.filter(m => m.brand_id === id);
  const n = posts.length;
  const likes = posts.reduce((s, m) => s + (m.like_count || 0), 0);
  const comments = posts.reduce((s, m) => s + (m.comments_count || 0), 0);
  const hist = [...organic].filter(d => d.brand_id === id && (d.followers ?? 0) > 0).sort((a, b) => a.month_key.localeCompare(b.month_key));
  const followers = hist.at(-1)?.followers ?? 0;
  const prev = hist.at(-2)?.followers ?? 0;
  const growth = prev > 0 ? ((followers - prev) / prev) * 100 : null;
  const avgEng = n ? (likes + comments) / n : 0;
  const rate = followers > 0 && n ? (avgEng / followers) * 100 : 0;
  return { n, followers, growth, hist, series: hist.slice(-6).map(d => d.followers), avgLikes: n ? likes / n : 0, avgComments: n ? comments / n : 0, avgEng, rate };
}

function computeMix(posts: InstagramMediaRow[]) {
  const groups: Record<string, number[]> = { Photos: [], Reels: [], Carousels: [] };
  for (const m of posts) groups[postType(m)].push(eng(m));
  return (["Reels", "Photos", "Carousels"] as const)
    .map(t => ({ type: t, n: groups[t].length, avg: groups[t].length ? groups[t].reduce((s, v) => s + v, 0) / groups[t].length : 0 }))
    .filter(g => g.n > 0);
}

function weekdayStats(posts: InstagramMediaRow[]) {
  const b = Array.from({ length: 7 }, () => ({ n: 0, eng: 0 }));
  for (const m of posts) { if (!m.posted_at) continue; const d = new Date(m.posted_at).getDay(); b[d].n++; b[d].eng += eng(m); }
  return b.map((x, i) => ({ day: WD[i], n: x.n, avg: x.n ? x.eng / x.n : 0 }));
}

function hashtagStats(posts: InstagramMediaRow[]) {
  const map = new Map<string, { tag: string; n: number; eng: number }>();
  for (const m of posts) {
    const tags = (m.caption || "").match(/#[\p{L}\p{N}_]+/gu) || [];
    for (const t of [...new Set(tags.map(x => x.toLowerCase()))]) {
      const c = map.get(t) ?? { tag: t, n: 0, eng: 0 };
      c.n++; c.eng += eng(m); map.set(t, c);
    }
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.eng - a.eng);
}

function monthlyEng(posts: InstagramMediaRow[]) {
  const map = new Map<string, { n: number; eng: number }>();
  for (const m of posts) { if (!m.posted_at) continue; const mk = m.posted_at.slice(0, 7); const c = map.get(mk) ?? { n: 0, eng: 0 }; c.n++; c.eng += eng(m); map.set(mk, c); }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mk, v]) => ({ mk, n: v.n, avg: v.n ? v.eng / v.n : 0 }));
}

// ── Small visual building blocks ────────────────────────────────────────────
function Sparkline({ data, color = "#10b981", w = 78, h = 26 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - min) / rng) * (h - 6);
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polygon points={`${line} ${w},${h} 0,${h}`} fill={color} opacity={0.1} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2} fill={color} />
    </svg>
  );
}

// Generic month-series area line (followers or engagement).
function LineCard({ title, rows, color, fmt, growthLabel }: { title: string; rows: { mk: string; value: number }[]; color: string; fmt: (n: number) => string; growthLabel?: string }) {
  if (rows.length < 2) return null;
  const data = rows.map(r => r.value);
  const w = 320, h = 96, padB = 16;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => (h - padB) - ((v - min) / rng) * (h - padB - 8) + 4;
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = data[0], last = data[data.length - 1];
  const growth = first > 0 ? ((last - first) / first) * 100 : null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{title}</p>
        {growth != null && <p className={`text-[11px] font-bold ${growth >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{growth >= 0 ? "▲" : "▼"} {Math.abs(growth).toFixed(1)}% <span className="font-normal text-gray-400">{growthLabel ?? `over ${rows.length} mo.`}</span></p>}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 96 }} preserveAspectRatio="none">
        <polygon points={`0,${h - padB} ${line} ${w},${h - padB}`} fill={color} opacity={0.12} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(data.length - 1)} cy={y(last)} r={3} fill={color} />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{mLabel(rows[0].mk)} · {fmt(first)}</span>
        <span className="font-semibold text-slate-600">{mLabel(rows[rows.length - 1].mk)} · {fmt(last)}</span>
      </div>
    </div>
  );
}

function PostingActivity({ posts, color }: { posts: InstagramMediaRow[]; color: string }) {
  const rows = monthlyEng(posts).slice(-6);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.n), 1);
  const total = rows.reduce((s, r) => s + r.n, 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Posting activity</p>
        <p className="text-[11px] text-gray-400">{total} posts · last {rows.length} mo.</p>
      </div>
      <div className="flex items-end gap-3 h-24">
        {rows.map(r => (
          <div key={r.mk} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] font-bold text-slate-600">{r.n}</span>
            <div className="w-full rounded-t" style={{ height: `${Math.max((r.n / max) * 100, 6)}%`, background: color }} />
            <span className="text-[9px] text-gray-400">{mLabel(r.mk).split(" ")[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekdayCard({ posts, color }: { posts: InstagramMediaRow[]; color: string }) {
  const s = weekdayStats(posts);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map(i => s[i]).filter(r => r.n > 0);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.map(r => r.avg), 1);
  const best = rows.reduce((a, b) => (b.avg > a.avg ? b : a));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Best day to post</p>
        <p className="text-[11px] text-gray-500"><span className="font-bold text-emerald-600">{best.day}</span> leads</p>
      </div>
      <div className="flex items-end gap-2 h-20">
        {rows.map(r => (
          <div key={r.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${r.n} posts · avg ${num(r.avg)} eng.`}>
            <div className="w-full rounded-t" style={{ height: `${Math.max((r.avg / max) * 100, 6)}%`, background: r.day === best.day ? color : "#e5e7eb" }} />
            <span className={`text-[9px] ${r.day === best.day ? "font-bold text-slate-600" : "text-gray-400"}`}>{r.day}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">Average engagement per post by weekday.</p>
    </div>
  );
}

function HashtagCard({ posts }: { posts: InstagramMediaRow[] }) {
  const tags = hashtagStats(posts).slice(0, 8);
  if (!tags.length) return null;
  const max = Math.max(...tags.map(t => t.n), 1);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Top hashtags</p>
      <div className="space-y-2">
        {tags.map(t => (
          <div key={t.tag} className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 w-32 truncate" title={t.tag}>{t.tag}</span>
            <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500" style={{ width: `${(t.n / max) * 100}%` }} /></span>
            <span className="text-[11px] text-gray-500 w-10 text-right">{t.n}×</span>
            <span className="text-[11px] font-bold text-slate-700 w-16 text-right tabular-nums">{num(t.n ? t.eng / t.n : 0)} eng.</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-2.5">Uses × and average engagement per post carrying the tag.</p>
    </div>
  );
}

function FormatBars({ mix, color }: { mix: { type: string; n: number; avg: number }[]; color: string }) {
  if (!mix.length) return null;
  const best = [...mix].sort((a, b) => b.avg - a.avg)[0];
  const max = Math.max(...mix.map(g => g.avg), 1);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Content mix</p>
        {best.avg > 0 && <p className="text-[11px] text-gray-500"><span className="font-bold text-emerald-600">{best.type}</span> perform best</p>}
      </div>
      <div className="space-y-2.5">
        {mix.map(g => (
          <div key={g.type} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600 w-20">{g.type}</span>
            <span className="text-[10px] text-gray-400 w-14">{g.n} post{g.n === 1 ? "" : "s"}</span>
            <span className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(g.avg / max) * 100}%`, background: color }} /></span>
            <span className="text-xs font-bold text-slate-700 tabular-nums w-16 text-right">{num(g.avg)} eng.</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-2.5">Average engagement (likes + comments) per post, by format.</p>
    </div>
  );
}

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

function HeroKpi({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent: string }) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900 mt-1 leading-none tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function PostTile({ m, top }: { m: InstagramMediaRow; top?: boolean }) {
  return (
    <a href={m.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="group block rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition motion-reduce:transition-none">
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {m.image_url
          ? <img src={m.image_url} alt={m.caption?.slice(0, 60) ?? "Instagram post"} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 motion-reduce:transition-none" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">▦</div>}
        {top && <span className="absolute top-2 left-2 text-[10px] font-bold text-white bg-gradient-to-r from-amber-500 to-rose-500 rounded-full px-2 py-0.5 shadow-sm">★ Top</span>}
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
          <span>{shortDate(m.posted_at)}</span>
        </div>
      </div>
    </a>
  );
}

// Top post across the whole portfolio, with a brand chip.
function HallTile({ m, brand }: { m: InstagramMediaRow; brand?: Brand }) {
  return (
    <a href={m.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="group block rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {m.image_url ? <img src={m.image_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">▦</div>}
        {brand && <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold text-white bg-black/45 backdrop-blur rounded-full pl-1 pr-2 py-0.5"><span className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px]" style={{ background: brand.color }}>{brand.name[0]}</span>{brand.name}</span>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white text-xs font-semibold">♥ {num(m.like_count || 0)} · 💬 {num(m.comments_count || 0)}</div>
      </div>
    </a>
  );
}

function PhonePost({ m, brand, color }: { m: InstagramMediaRow; brand: string; color: string }) {
  return (
    <div className="border-b border-gray-100">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: color }}>{brand[0]}</span>
        <span className="text-[12px] font-semibold text-slate-800">{brand}</span>
        <span className="ml-auto text-[10px] text-gray-400">{shortDate(m.posted_at)}</span>
      </div>
      <a href={m.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="block relative aspect-square bg-gray-100">
        {m.image_url ? <img src={m.image_url} alt={m.caption?.slice(0, 60) ?? "post"} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">▦</div>}
        {m.media_type === "VIDEO" && <span className="absolute top-2 right-2 text-white text-xs bg-black/40 rounded px-1.5">▶</span>}
      </a>
      <div className="px-3 py-2">
        <div className="flex items-center gap-4 text-[13px] text-slate-700">
          <span>♥ <span className="font-semibold">{num(m.like_count || 0)}</span></span>
          <span>💬 <span className="font-semibold">{num(m.comments_count || 0)}</span></span>
        </div>
        {m.caption && <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 mt-1"><span className="font-semibold text-slate-800">{brand}</span> {m.caption}</p>}
      </div>
    </div>
  );
}

function HighlightPost({ title, tone, m }: { title: string; tone: "up" | "down"; m: InstagramMediaRow }) {
  return (
    <a href={m.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">
      <div className="flex">
        <div className="w-24 h-24 shrink-0 bg-gray-100">
          {m.image_url ? <img src={m.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">▦</div>}
        </div>
        <div className="p-3 min-w-0 flex flex-col justify-center">
          <p className={`text-[10px] font-bold uppercase tracking-wider ${tone === "up" ? "text-emerald-600" : "text-amber-600"}`}>{tone === "up" ? "★ " : ""}{title}</p>
          <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 mt-0.5">{m.caption || "—"}</p>
          <p className="text-xs font-bold text-slate-800 mt-1">♥ {num(m.like_count || 0)} · 💬 {num(m.comments_count || 0)} <span className="font-normal text-gray-400">· {postType(m).replace(/s$/, "")} · {shortDate(m.posted_at)}</span></p>
        </div>
      </div>
    </a>
  );
}

// Brand engagement map: followers (x) vs engagement rate (y), bubble = post volume.
function EngagementMap({ items }: { items: { brand: Brand; followers: number; rate: number; n: number }[] }) {
  const pts = items.filter(i => i.followers > 0 && i.rate > 0);
  if (pts.length < 2) return null;
  const w = 460, h = 240, pad = 34;
  const maxF = Math.max(...pts.map(p => p.followers)) * 1.1;
  const maxR = Math.max(...pts.map(p => p.rate)) * 1.15;
  const maxN = Math.max(...pts.map(p => p.n), 1);
  const x = (v: number) => pad + (v / maxF) * (w - pad - 12);
  const y = (v: number) => h - pad - (v / maxR) * (h - pad - 12);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Reach vs engagement</p>
      <p className="text-[10px] text-gray-400 mb-2">Bubble size = posts. Up-and-left = punching above their audience size.</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 260 }}>
        <line x1={pad} y1={h - pad} x2={w - 6} y2={h - pad} stroke="#e5e7eb" />
        <line x1={pad} y1={8} x2={pad} y2={h - pad} stroke="#e5e7eb" />
        {pts.map(p => (
          <g key={p.brand.id}>
            <circle cx={x(p.followers)} cy={y(p.rate)} r={6 + (p.n / maxN) * 12} fill={p.brand.color} opacity={0.75} />
            <text x={x(p.followers)} y={y(p.rate) + 3} textAnchor="middle" className="fill-white" style={{ fontSize: 9, fontWeight: 700 }}>{p.brand.name[0]}</text>
          </g>
        ))}
        <text x={w - 6} y={h - pad + 20} textAnchor="end" className="fill-gray-400" style={{ fontSize: 9 }}>Followers →</text>
        <text x={pad - 6} y={14} textAnchor="start" className="fill-gray-400" style={{ fontSize: 9 }}>Eng. rate ↑</text>
      </svg>
    </div>
  );
}

// ── Per-brand detail ─────────────────────────────────────────────────────────
export function SocialBrandDetail({
  brand, instagramOrganic, instagramMedia, kpis = "full",
}: {
  brand: Brand;
  instagramOrganic: InstagramOrganicRow[];
  instagramMedia: InstagramMediaRow[];
  kpis?: "full" | "engagement" | "none";
}) {
  const [sort, setSort] = React.useState<"recent" | "top">("recent");
  const ig = instagramOrganic.filter(d => d.brand_id === brand.id);
  const latest = [...ig].sort((a, b) => b.month_key.localeCompare(a.month_key))[0];
  const posts = instagramMedia.filter(m => m.brand_id === brand.id);
  const sorted = sort === "top"
    ? [...posts].sort((a, b) => eng(b) - eng(a))
    : [...posts].sort((a, b) => new Date(b.posted_at ?? 0).getTime() - new Date(a.posted_at ?? 0).getTime());
  const feed = sorted.slice(0, 12);
  const s = computeStats(instagramMedia, instagramOrganic, brand.id);
  const withEng = [...posts].filter(m => eng(m) > 0);
  const best = withEng.length ? withEng.reduce((a, b) => (eng(a) >= eng(b) ? a : b)) : null;
  const worst = withEng.length ? withEng.reduce((a, b) => (eng(a) <= eng(b) ? a : b)) : null;
  const mix = computeMix(posts);
  const histRows = [...ig].filter(d => (d.followers ?? 0) > 0).sort((a, b) => a.month_key.localeCompare(b.month_key)).map(d => ({ mk: d.month_key, value: d.followers }));
  const engRows = monthlyEng(posts).map(r => ({ mk: r.mk, value: r.avg }));

  return (
    <div className="space-y-4">
      {kpis === "full" && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Card label="Followers" value={num(s.followers)} accent="#E1306C" />
          <Card label="Eng. rate" value={s.rate > 0 ? s.rate.toFixed(1) + "%" : "—"} accent="#f59e0b" />
          <Card label="Avg likes / post" value={s.n ? num(s.avgLikes) : "—"} accent="#ef4444" />
          <Card label="Avg comments / post" value={s.n ? num(s.avgComments) : "—"} accent="#0ea5e9" />
          <Card label="Reach (latest mo.)" value={latest?.reach ? num(latest.reach) : "—"} accent="#3b82f6" />
          <Card label="Accounts engaged" value={latest?.accounts_engaged ? num(latest.accounts_engaged) : "—"} accent="#10b981" />
        </div>
      )}
      {kpis === "engagement" && posts.length > 0 && (
        <div className="flex items-stretch divide-x divide-gray-100 bg-white rounded-2xl border border-gray-100 shadow-sm py-3 px-2 w-fit">
          <Stat label="Eng. rate" value={s.rate > 0 ? s.rate.toFixed(1) + "%" : "—"} />
          <Stat label="⌀ Likes" value={num(s.avgLikes)} />
          <Stat label="⌀ Comments" value={num(s.avgComments)} />
          <Stat label="Posts" value={String(s.n)} />
        </div>
      )}

      {posts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
          No posts synced for {brand.name} yet.
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-[auto_1fr] gap-5 items-start">
            {/* Phone mockup with a live-feeling Instagram feed */}
            <div className="mx-auto lg:mx-0">
              <div className="flex items-center justify-between mb-2 w-[300px] mx-auto">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Feed</p>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {(["recent", "top"] as const).map(k => (
                    <button key={k} onClick={() => setSort(k)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition motion-reduce:transition-none ${sort === k ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{k === "recent" ? "Recent" : "Top"}</button>
                  ))}
                </div>
              </div>
              <div className="w-[300px] rounded-[2.5rem] bg-slate-900 p-2.5 shadow-xl">
                <div className="relative rounded-[2rem] bg-white overflow-hidden h-[520px]">
                  <div className="absolute top-0 inset-x-0 z-10 flex justify-center pointer-events-none"><div className="w-28 h-5 bg-slate-900 rounded-b-2xl" /></div>
                  <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur border-b border-gray-100 px-3 pt-5 pb-2 flex items-center gap-2.5">
                      <span className="p-[2px] rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-white" style={{ background: brand.color }}>{brand.name[0]}</span>
                      </span>
                      <div><p className="text-[13px] font-bold text-slate-800 leading-tight">{brand.name}</p><p className="text-[10px] text-gray-400 leading-tight">{num(s.followers)} followers · {s.n} posts</p></div>
                    </div>
                    {feed.map(m => <PhonePost key={m.media_id} m={m} brand={brand.name} color={brand.color} />)}
                  </div>
                </div>
              </div>
            </div>

            {/* Insights column */}
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {best && <HighlightPost title="Best post" tone="up" m={best} />}
                {worst && best && worst.media_id !== best.media_id && <HighlightPost title="Needs a boost" tone="down" m={worst} />}
              </div>
              <LineCard title="Follower growth" rows={histRows} color={brand.color} fmt={num} />
              <PostingActivity posts={posts} color={brand.color} />
              <FormatBars mix={mix} color={brand.color} />
            </div>
          </div>

          {/* Deeper analytics row */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <LineCard title="Engagement over time" rows={engRows} color="#f59e0b" fmt={n => num(n) + " eng."} growthLabel="per-post trend" />
            <WeekdayCard posts={posts} color={brand.color} />
            <HashtagCard posts={posts} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Panel: portfolio command centre + per-brand detail ───────────────────────
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
  const [board, setBoard] = React.useState<"rate" | "growth">("rate");

  if (scope !== "all") {
    const brand = brands.find(b => b.id === scope);
    if (!brand) return null;
    return <SocialBrandDetail brand={brand} instagramOrganic={instagramOrganic} instagramMedia={instagramMedia} kpis="full" />;
  }

  const withPosts = brands.filter(b => instagramMedia.some(m => m.brand_id === b.id));
  if (!withPosts.length) {
    return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No Instagram posts synced yet.</div>;
  }

  const stats = withPosts.map(b => ({ b, s: computeStats(instagramMedia, instagramOrganic, b.id) }));
  const allPosts = instagramMedia.filter(m => withPosts.some(b => b.id === m.brand_id));

  // Portfolio hero KPIs
  const totalFollowers = stats.reduce((s, r) => s + r.s.followers, 0);
  const totalReach = withPosts.reduce((sum, b) => {
    const l = [...instagramOrganic].filter(d => d.brand_id === b.id).sort((a, c) => c.month_key.localeCompare(a.month_key))[0];
    return sum + (l?.reach ?? 0);
  }, 0);
  const totalPosts = allPosts.length;
  const wRate = totalFollowers > 0 ? stats.reduce((s, r) => s + r.s.rate * r.s.followers, 0) / totalFollowers : 0;
  const avgEngAll = totalPosts ? allPosts.reduce((s, m) => s + eng(m), 0) / totalPosts : 0;
  // portfolio follower growth (sum by month, last two)
  const byMonthF = new Map<string, number>();
  for (const d of instagramOrganic) if ((d.followers ?? 0) > 0) byMonthF.set(d.month_key, (byMonthF.get(d.month_key) ?? 0) + d.followers);
  const fMonths = [...byMonthF.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const portGrowth = fMonths.length >= 2 && fMonths.at(-2)![1] > 0 ? ((fMonths.at(-1)![1] - fMonths.at(-2)![1]) / fMonths.at(-2)![1]) * 100 : null;

  // Leaderboard
  const ranked = [...stats]
    .filter(r => (board === "rate" ? r.s.rate > 0 : r.s.growth != null))
    .sort((a, b) => (board === "rate" ? b.s.rate - a.s.rate : (b.s.growth ?? 0) - (a.s.growth ?? 0)));
  const boardMax = Math.max(...ranked.map(r => Math.abs(board === "rate" ? r.s.rate : (r.s.growth ?? 0))), 0.01);

  const brandById = new Map(brands.map(b => [b.id, b]));
  const hallOfFame = [...allPosts].filter(m => eng(m) > 0).sort((a, b) => eng(b) - eng(a)).slice(0, 8);
  const portMix = computeMix(allPosts);
  const mapItems = stats.map(r => ({ brand: r.b, followers: r.s.followers, rate: r.s.rate, n: r.s.n }));

  return (
    <div className="space-y-4">
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <HeroKpi label="Total followers" value={num(totalFollowers)} sub={`${withPosts.length} brands`} accent="#E1306C" />
        <HeroKpi label="Reach (latest mo.)" value={num(totalReach)} sub="all brands" accent="#3b82f6" />
        <HeroKpi label="Avg eng. rate" value={wRate > 0 ? wRate.toFixed(2) + "%" : "—"} sub="follower-weighted" accent="#f59e0b" />
        <HeroKpi label="Avg eng. / post" value={num(avgEngAll)} sub="likes + comments" accent="#ef4444" />
        <HeroKpi label="Posts synced" value={String(totalPosts)} sub="across portfolio" accent="#8b5cf6" />
        <HeroKpi label="Follower growth" value={portGrowth != null ? (portGrowth >= 0 ? "+" : "") + portGrowth.toFixed(1) + "%" : "—"} sub={portGrowth != null ? "month on month" : "needs 2+ months"} accent="#10b981" />
      </div>

      {/* Leaderboard + engagement map */}
      <div className="grid lg:grid-cols-2 gap-4">
        {ranked.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Leaderboard</p>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {([["rate", "Engagement rate"], ["growth", "Follower growth"]] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setBoard(k)} className={`px-3 py-1 rounded-md text-xs font-medium transition ${board === k ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {ranked.map((r, i) => {
                const val = board === "rate" ? r.s.rate : (r.s.growth ?? 0);
                const label = board === "rate" ? val.toFixed(1) + "%" : (val >= 0 ? "+" : "") + val.toFixed(1) + "%";
                return (
                  <button key={r.b.id} onClick={() => onSelectBrand(r.b.id)} className="w-full flex items-center gap-3 group">
                    <span className="text-[11px] font-bold text-gray-300 w-4 text-right">{i + 1}</span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.b.color }} />
                    <span className="text-xs font-semibold text-slate-700 w-24 text-left truncate group-hover:text-emerald-600">{r.b.name}</span>
                    <span className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(Math.abs(val) / boardMax) * 100}%`, background: val < 0 ? "#f43f5e" : r.b.color }} /></span>
                    <span className={`text-xs font-bold tabular-nums w-14 text-right ${board === "growth" && val < 0 ? "text-rose-500" : "text-slate-700"}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <EngagementMap items={mapItems} />
      </div>

      {/* Top posts hall of fame */}
      {hallOfFame.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Top posts across the portfolio</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {hallOfFame.map(m => <HallTile key={m.media_id} m={m} brand={brandById.get(m.brand_id)} />)}
          </div>
        </div>
      )}

      {/* What works: format + best day + hashtags */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <FormatBars mix={portMix} color="#7c3aed" />
        <WeekdayCard posts={allPosts} color="#0ea5e9" />
        <HashtagCard posts={allPosts} />
      </div>

      {/* Per-brand feed strips */}
      {withPosts.map(b => {
        const posts = instagramMedia.filter(m => m.brand_id === b.id).sort((x, y) => new Date(y.posted_at ?? 0).getTime() - new Date(x.posted_at ?? 0).getTime()).slice(0, 15);
        const s = computeStats(instagramMedia, instagramOrganic, b.id);
        const topId = posts.reduce((best: string | null, m) => (best && eng(posts.find(p => p.media_id === best)!) >= eng(m) ? best : m.media_id), null as string | null);
        return (
          <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <button onClick={() => onSelectBrand(b.id)} className="flex items-center gap-2.5 group min-w-0">
                <span className="p-[2px] rounded-full shrink-0 bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-white" style={{ background: b.color }}>{b.name[0]}</span>
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 truncate">{b.name}</span>
                    <span className="text-[11px] text-emerald-500 font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap">Open →</span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold text-slate-900 leading-none tabular-nums">{num(s.followers)}</span>
                    <span className="text-[11px] text-gray-400 font-medium">followers</span>
                    {s.growth != null && Math.abs(s.growth) >= 0.05 && <span className={`text-[10px] font-bold tabular-nums ${s.growth >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{s.growth >= 0 ? "▲" : "▼"} {Math.abs(s.growth).toFixed(1)}%</span>}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-4">
                {s.series.length >= 2 && <span className="hidden md:block" title="Follower trend"><Sparkline data={s.series} color={b.color} /></span>}
                <div className="flex items-stretch divide-x divide-gray-100">
                  <Stat label="⌀ Likes" value={num(s.avgLikes)} />
                  <Stat label="⌀ Comments" value={num(s.avgComments)} />
                  <Stat label="Eng. rate" value={s.rate > 0 ? s.rate.toFixed(1) + "%" : "—"} />
                  <Stat label="Posts" value={String(s.n)} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 snap-x [scrollbar-width:thin] [scrollbar-color:#e5e7eb_transparent]">
              {posts.map(m => <div key={m.media_id} className="snap-start shrink-0 w-40 sm:w-44"><PostTile m={m} top={m.media_id === topId && eng(m) > 0} /></div>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
