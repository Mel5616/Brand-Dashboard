"use client";

import React from "react";
import type { Brand, InstagramOrganicRow, InstagramMediaRow } from "@/lib/db";
import { computeStats, computeMix, weekdayStats, hashtagStats, postType, num, eng } from "./SocialPanel";
import { SOCIAL_TEAM, ownerOf, ownerColor } from "@/lib/socialOwners";

const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SocialReport({
  brands, instagramOrganic, instagramMedia,
}: {
  brands: Brand[];
  instagramOrganic: InstagramOrganicRow[];
  instagramMedia: InstagramMediaRow[];
}) {
  const withPosts = brands.filter(b => instagramMedia.some(m => m.brand_id === b.id));
  const stats = withPosts.map(b => ({ b, s: computeStats(instagramMedia, instagramOrganic, b.id) }));
  const allPosts = instagramMedia.filter(m => withPosts.some(b => b.id === m.brand_id));

  const totalFollowers = stats.reduce((x, r) => x + r.s.followers, 0);
  const totalReach = withPosts.reduce((sum, b) => {
    const l = [...instagramOrganic].filter(d => d.brand_id === b.id).sort((a, c) => c.month_key.localeCompare(a.month_key))[0];
    return sum + (l?.reach ?? 0);
  }, 0);
  const totalPosts = allPosts.length;
  const wRate = totalFollowers > 0 ? stats.reduce((x, r) => x + r.s.rate * r.s.followers, 0) / totalFollowers : 0;
  const avgEngAll = totalPosts ? allPosts.reduce((x, m) => x + eng(m), 0) / totalPosts : 0;

  const byMonthF = new Map<string, number>();
  for (const d of instagramOrganic) if ((d.followers ?? 0) > 0) byMonthF.set(d.month_key, (byMonthF.get(d.month_key) ?? 0) + d.followers);
  const fMonths = [...byMonthF.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const portGrowth = fMonths.length >= 2 && fMonths.at(-2)![1] > 0 ? ((fMonths.at(-1)![1] - fMonths.at(-2)![1]) / fMonths.at(-2)![1]) * 100 : null;

  const byOwner = SOCIAL_TEAM.map(o => {
    const list = stats.filter(r => ownerOf(r.b.id) === o.name);
    const followers = list.reduce((x, r) => x + r.s.followers, 0);
    const posts = list.reduce((x, r) => x + r.s.n, 0);
    const totalEng = list.reduce((x, r) => x + r.s.avgEng * r.s.n, 0);
    const rate = followers ? list.reduce((x, r) => x + r.s.rate * r.s.followers, 0) / followers : 0;
    return { ...o, list, followers, posts, avgEng: posts ? totalEng / posts : 0, rate };
  }).filter(o => o.list.length > 0);

  const ranked = [...stats].sort((a, b) => b.s.rate - a.s.rate || b.s.followers - a.s.followers);
  const portMix = computeMix(allPosts);
  const bestFormat = [...portMix].sort((a, b) => b.avg - a.avg)[0];
  const wd = weekdayStats(allPosts);
  const wdRows = WD_ORDER.map(i => wd[i]).filter(r => r.n > 0);
  const bestDay = wdRows.length ? [...wdRows].sort((a, b) => b.avg - a.avg)[0] : null;
  const tags = hashtagStats(allPosts).slice(0, 6);
  const topPosts = [...allPosts].filter(m => eng(m) > 0).sort((a, b) => eng(b) - eng(a)).slice(0, 6);
  const brandById = new Map(brands.map(b => [b.id, b]));
  const hasReach = allPosts.some(m => (m.reach || 0) > 0);

  const generated = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  if (!withPosts.length) {
    return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No Instagram data synced yet — the report will populate after the next sync.</div>;
  }

  const kpis = [
    { label: "Total followers", value: num(totalFollowers), sub: `${withPosts.length} brands`, color: "#E1306C" },
    { label: "Reach (latest mo.)", value: num(totalReach), sub: "all brands", color: "#3b82f6" },
    { label: "Avg eng. rate", value: wRate > 0 ? wRate.toFixed(2) + "%" : "—", sub: "follower-weighted", color: "#f59e0b" },
    { label: "Avg eng. / post", value: num(avgEngAll), sub: "likes + comments", color: "#ef4444" },
    { label: "Posts synced", value: String(totalPosts), sub: "across portfolio", color: "#8b5cf6" },
    { label: "Follower growth", value: portGrowth != null ? (portGrowth >= 0 ? "+" : "") + portGrowth.toFixed(1) + "%" : "—", sub: portGrowth != null ? "month on month" : "needs 2+ months", color: "#10b981" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar (not printed) */}
      <div className="no-print flex items-center justify-between">
        <p className="text-xs text-gray-400">A one-page overview of Instagram performance across the portfolio.</p>
        <button onClick={() => window.print()} className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2">🖨 Print / Save PDF</button>
      </div>

      <div id="social-report" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6 text-slate-800">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 pb-4">
          <div className="flex items-center gap-3">
            <img src="/logos/Coolkidz Logo.png" alt="Coolkidz" className="h-9 w-auto" />
            <div className="pl-3 border-l border-gray-200">
              <h1 className="text-xl font-extrabold text-slate-900 leading-tight">Social Media Report</h1>
              <p className="text-xs text-gray-400">Instagram · Coolkidz Australia portfolio</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Generated</p>
            <p className="text-sm font-bold text-slate-700">{generated}</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="relative rounded-xl border border-gray-100 px-3 py-2.5 overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight">{k.label}</p>
              <p className="text-lg font-extrabold text-slate-900 mt-1 leading-none tabular-nums">{k.value}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Team performance */}
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Team performance</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {byOwner.map(o => (
              <div key={o.name} className="rounded-xl border border-gray-100 p-4" style={{ borderTop: `3px solid ${o.color}` }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: o.color }}>{o.name[0]}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{o.name}</p>
                    <p className="text-[11px] text-gray-400">{o.list.length} brands · {o.posts} posts</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                  <div><p className="text-base font-extrabold tabular-nums">{num(o.followers)}</p><p className="text-[9px] uppercase tracking-wide text-gray-400">Followers</p></div>
                  <div><p className="text-base font-extrabold tabular-nums">{o.rate > 0 ? o.rate.toFixed(2) + "%" : "—"}</p><p className="text-[9px] uppercase tracking-wide text-gray-400">Eng. rate</p></div>
                  <div><p className="text-base font-extrabold tabular-nums">{num(o.avgEng)}</p><p className="text-[9px] uppercase tracking-wide text-gray-400">⌀ Eng / post</p></div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[...o.list].sort((a, b) => b.s.followers - a.s.followers).map(r => (
                    <span key={r.b.id} className="flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-gray-50 rounded-full pl-1.5 pr-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.b.color }} />{r.b.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Brand league table */}
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Brand performance</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-gray-200">
                <th className="text-left font-semibold uppercase tracking-wide text-[9px] py-1.5 pl-1">Brand</th>
                <th className="text-left font-semibold uppercase tracking-wide text-[9px] py-1.5">Owner</th>
                <th className="text-right font-semibold uppercase tracking-wide text-[9px] py-1.5">Followers</th>
                <th className="text-right font-semibold uppercase tracking-wide text-[9px] py-1.5">Growth</th>
                <th className="text-right font-semibold uppercase tracking-wide text-[9px] py-1.5">Posts</th>
                <th className="text-right font-semibold uppercase tracking-wide text-[9px] py-1.5">⌀ Eng</th>
                {hasReach && <th className="text-right font-semibold uppercase tracking-wide text-[9px] py-1.5">⌀ Reach</th>}
                <th className="text-right font-semibold uppercase tracking-wide text-[9px] py-1.5 pr-1">Eng. rate</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ b, s }) => (
                <tr key={b.id} className="border-b border-gray-50">
                  <td className="py-1.5 pl-1"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: b.color }} /><span className="font-semibold text-slate-700">{b.name}</span></span></td>
                  <td className="py-1.5">{ownerOf(b.id) ? <span className="text-[10px] font-semibold text-white rounded-full px-1.5 py-0.5" style={{ background: ownerColor(ownerOf(b.id)!) }}>{ownerOf(b.id)}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">{num(s.followers)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${s.growth == null ? "text-gray-300" : s.growth >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{s.growth == null ? "—" : (s.growth >= 0 ? "+" : "") + s.growth.toFixed(1) + "%"}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">{s.n}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">{num(s.avgEng)}</td>
                  {hasReach && <td className="py-1.5 text-right tabular-nums text-slate-600">{s.hasReach ? num(s.avgReach) : "—"}</td>}
                  <td className="py-1.5 pr-1 text-right tabular-nums font-bold text-slate-800">{s.rate > 0 ? s.rate.toFixed(2) + "%" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* What works */}
        <section className="grid md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Best format</p>
            {bestFormat ? <p className="text-2xl font-extrabold text-slate-900">{bestFormat.type}</p> : <p className="text-gray-300">—</p>}
            <div className="mt-2 space-y-1">
              {portMix.map(g => <p key={g.type} className="text-[11px] text-gray-500 flex justify-between"><span>{g.type} ({g.n})</span><span className="font-semibold text-slate-700">{num(g.avg)} eng.</span></p>)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Best day to post</p>
            {bestDay ? <p className="text-2xl font-extrabold text-slate-900">{bestDay.day}</p> : <p className="text-gray-300">Not enough data</p>}
            {bestDay && <p className="text-[11px] text-gray-500 mt-1">Averages {num(bestDay.avg)} engagements per post.</p>}
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Top hashtags</p>
            {tags.length ? (
              <div className="flex flex-wrap gap-1">
                {tags.map(t => <span key={t.tag} className="text-[11px] font-medium text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">{t.tag} <span className="text-violet-400">{t.n}×</span></span>)}
              </div>
            ) : <p className="text-gray-300">None found</p>}
          </div>
        </section>

        {/* Top posts */}
        {topPosts.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Top posts this period</h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {topPosts.map(m => {
                const b = brandById.get(m.brand_id);
                return (
                  <div key={m.media_id} className="rounded-lg overflow-hidden border border-gray-100">
                    <div className="relative aspect-square bg-gray-100">
                      {m.image_url ? <img src={m.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300">▦</div>}
                      {b && <span className="absolute top-1 left-1 text-[8px] font-bold text-white bg-black/45 rounded-full px-1.5 py-0.5">{b.name}</span>}
                    </div>
                    <p className="text-[9px] font-bold text-slate-700 px-1.5 py-1">♥ {num(m.like_count || 0)} · 💬 {num(m.comments_count || 0)}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 pt-3 text-center">
          <p className="text-[10px] text-gray-400">Coolkidz Australia · Social Media Report · {generated}{portGrowth == null ? " · follower-growth trends populate once a second month of data is synced" : ""}</p>
        </div>
      </div>
    </div>
  );
}
