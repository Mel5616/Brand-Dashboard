"use client";

import { useEffect, useMemo, useState } from "react";

// Blog performance hub — the full published library (synced from Shopify) with
// GA4 pageviews and Search Console clicks/rankings per post, plus the
// opportunity views: page-2 keywords worth pushing and posts under-clicking
// for their rank. Sits on the Blogs tab above the Asana pipeline.
type Article = { brand_id: number; title: string; path: string; url: string; blog_handle: string; author: string | null; tags: string | null; published_at: string | null };
type Ga4Row = { brand_id: number; month_key: string; path: string; pageviews: number; sessions: number };
type GscRow = { brand_id: number; month_key: string; page: string; clicks: number; impressions: number; ctr: number; position: number };
type BrandRef = { id: number; name: string; color: string };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const mShort = (mk: string) => new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
// Rough expected CTR by Google position — for the "under-clicking" panel.
const expectedCtr = (pos: number) => pos <= 1 ? 30 : pos <= 2 ? 15 : pos <= 3 ? 10 : pos <= 5 ? 6 : pos <= 10 ? 3 : 1;

export function BlogHub({ brands = [] }: { brands?: BrandRef[] }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [ga4, setGa4] = useState<Ga4Row[]>([]);
  const [gsc, setGsc] = useState<GscRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandSel, setBrandSel] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/blogs/hub").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) { setArticles(d.articles ?? []); setGa4(d.ga4 ?? []); setGsc(d.gsc ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const brandName = (id: number) => brands.find(b => b.id === id)?.name ?? `Brand ${id}`;
  const brandColor = (id: number) => brands.find(b => b.id === id)?.color ?? "#94a3b8";

  const data = useMemo(() => {
    const inScope = <T extends { brand_id: number }>(rows: T[]) => brandSel === "all" ? rows : rows.filter(r => r.brand_id === brandSel);
    const arts = inScope(articles);
    const g4 = inScope(ga4), gc = inScope(gsc);
    const latestG4 = [...new Set(g4.map(r => r.month_key))].sort().pop() ?? null;
    const latestGsc = [...new Set(gc.map(r => r.month_key))].sort().pop() ?? null;
    const g4Latest = g4.filter(r => r.month_key === latestG4);
    const gscLatest = gc.filter(r => r.month_key === latestGsc);
    const pvByPath = new Map(g4Latest.map(r => [`${r.brand_id}|${r.path}`, r]));
    const gscByPath = new Map<string, GscRow>();
    for (const r of gscLatest) {
      const m = r.page.match(/\/blogs\/.+$/);
      if (m) gscByPath.set(`${r.brand_id}|${m[0]}`, r);
    }
    const joined = arts.map(a => {
      const k = `${a.brand_id}|${a.path}`;
      const pv = pvByPath.get(k); const gs = gscByPath.get(k);
      return { ...a, pageviews: pv?.pageviews ?? 0, sessions: pv?.sessions ?? 0,
        clicks: gs?.clicks ?? 0, impressions: gs?.impressions ?? 0, ctr: gs?.ctr ?? null, position: gs?.position ?? null };
    });
    const d30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const trendMonths = [...new Set(g4.map(r => r.month_key))].sort().slice(-12);
    const trend = trendMonths.map(mk => ({ mk, pv: g4.filter(r => r.month_key === mk).reduce((s, r) => s + r.pageviews, 0) }));
    // Opportunities from GSC latest month
    const page2 = gscLatest.filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 50).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
    const lowCtr = gscLatest.filter(r => r.position <= 10 && r.impressions >= 100 && r.ctr < expectedCtr(r.position)).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
    const clicksTotal = gscLatest.reduce((s, r) => s + r.clicks, 0);
    const imprTotal = gscLatest.reduce((s, r) => s + r.impressions, 0);
    const wAvgPos = imprTotal > 0 ? gscLatest.reduce((s, r) => s + r.position * r.impressions, 0) / imprTotal : null;
    return {
      joined, latestG4, latestGsc, trend, page2, lowCtr,
      kpis: {
        total: arts.length,
        last30: arts.filter(a => (a.published_at ?? "") >= d30).length,
        pageviews: g4Latest.reduce((s, r) => s + r.pageviews, 0),
        clicks: clicksTotal, impressions: imprTotal,
        avgPos: wAvgPos,
      },
    };
  }, [articles, ga4, gsc, brandSel, brands]);

  const titleFor = (r: GscRow) => {
    const m = r.page.match(/\/blogs\/.+$/);
    const a = m ? articles.find(x => x.brand_id === r.brand_id && x.path === m[0]) : null;
    return a?.title ?? (r.page.split("/").pop() || r.page);
  };

  if (loading) return <div className="p-6 text-center text-sm text-gray-400">Loading blog performance…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_blog_hub.sql</code>, then run a sync to import the blog library.</div>;

  const lib = data.joined
    .filter(a => !q || (a.title || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.pageviews - a.pageviews || (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const top = lib.filter(a => a.pageviews > 0).slice(0, 10);
  const maxPv = Math.max(1, ...top.map(a => a.pageviews));
  const maxTrend = Math.max(1, ...data.trend.map(t => t.pv));

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 rounded-xl bg-cyan-50/60 border border-cyan-100 divide-x divide-cyan-100 text-center overflow-hidden">
        {[["Published blogs", data.kpis.total], ["New · 30 days", data.kpis.last30],
          [`Pageviews${data.latestG4 ? ` · ${mShort(data.latestG4)}` : ""}`, data.kpis.pageviews.toLocaleString()],
          [`Google clicks${data.latestGsc ? ` · ${mShort(data.latestGsc)}` : ""}`, data.kpis.clicks.toLocaleString()],
          ["Impressions", data.kpis.impressions.toLocaleString()],
          ["Avg position", data.kpis.avgPos != null ? data.kpis.avgPos.toFixed(1) : "—"]].map(([l, v]) => (
          <div key={String(l)} className="py-2.5 px-1">
            <p className="text-lg font-bold text-slate-800">{v as any}</p>
            <p className="text-[9.5px] uppercase tracking-wider text-cyan-700/60">{l}</p>
          </div>
        ))}
      </div>

      {/* Blogs by brand — output + traffic share across the portfolio */}
      {(() => {
        const perBrand = brands
          .map(b => {
            const arts = articles.filter(a => a.brand_id === b.id);
            const latest = [...new Set(ga4.map(r => r.month_key))].sort().pop();
            const pv = ga4.filter(r => r.brand_id === b.id && r.month_key === latest).reduce((s, r) => s + r.pageviews, 0);
            const d90 = new Date(Date.now() - 90 * 86400_000).toISOString();
            return { id: b.id, name: b.name, color: b.color, count: arts.length, recent: arts.filter(a => (a.published_at ?? "") >= d90).length, pv };
          })
          .filter(b => b.count > 0 || b.pv > 0)
          .sort((a, b) => b.count - a.count);
        if (perBrand.length === 0) return null;
        const maxCount = Math.max(1, ...perBrand.map(b => b.count));
        const maxPv = Math.max(1, ...perBrand.map(b => b.pv));
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Blogs by brand</p>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 hidden md:block">Published posts <span className="normal-case font-normal">(● = last 90 days)</span></p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 hidden md:block">Blog pageviews · latest month</p>
              {perBrand.map(b => (
                <div key={`c${b.id}`} className="contents">
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-600 w-28 truncate">{b.name}</span>
                    <div className="flex-1 h-3.5 rounded-full bg-gray-100 relative">
                      <div className="h-3.5 rounded-full" style={{ width: `${(b.count / maxCount) * 100}%`, background: b.color }} />
                    </div>
                    <span className="text-[11.5px] font-semibold text-slate-700 w-12 text-right">{b.count}{b.recent > 0 && <span className="text-emerald-500"> ●{b.recent}</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-600 w-28 truncate md:hidden">{b.name}</span>
                    <div className="flex-1 h-3.5 rounded-full bg-gray-100">
                      <div className="h-3.5 rounded-full opacity-70" style={{ width: `${(b.pv / maxPv) * 100}%`, background: b.color }} />
                    </div>
                    <span className="text-[11.5px] font-semibold text-slate-700 w-14 text-right">{b.pv.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2">
        <select value={String(brandSel)} onChange={e => setBrandSel(e.target.value === "all" ? "all" : Number(e.target.value))} className={inp}>
          <option value="all">All brands</option>
          {brands.filter(b => articles.some(a => a.brand_id === b.id)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search blog titles…" className={`${inp} flex-1 min-w-[220px]`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top posts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">What posts bring in traffic?{data.latestG4 ? ` · ${mShort(data.latestG4)}` : ""}</p>
          {top.length === 0 ? <p className="text-sm text-gray-400">No pageview data yet — it lands with the next sync.</p> : (
            <div className="space-y-2">
              {top.map(a => (
                <div key={`${a.brand_id}${a.path}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(a.brand_id) }} />
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-[12.5px] text-slate-600 hover:text-emerald-700 hover:underline truncate w-[44%]" title={a.title}>{a.title}</a>
                  <div className="flex-1 h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full" style={{ width: `${(a.pageviews / maxPv) * 100}%`, background: brandColor(a.brand_id) }} /></div>
                  <span className="text-[11.5px] font-semibold text-slate-600 w-14 text-right">{a.pageviews.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          {data.trend.length > 1 && (
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Blog pageviews · monthly</p>
              <div className="flex items-end gap-1.5 h-20">
                {data.trend.map(t => (
                  <div key={t.mk} className="flex-1 flex flex-col items-center gap-1" title={`${mShort(t.mk)}: ${t.pv.toLocaleString()}`}>
                    <div className="w-full rounded-t bg-cyan-300" style={{ height: `${Math.max(3, (t.pv / maxTrend) * 56)}px` }} />
                    <span className="text-[9px] text-gray-400">{mShort(t.mk).split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Opportunities */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600 mb-1">🎯 Page 2 — nearly there</p>
            <p className="text-[11.5px] text-gray-400 mb-3">Ranking 11–20 with real impressions — a content refresh or internal links could push these onto page 1.</p>
            {data.page2.length === 0 ? <p className="text-sm text-gray-400">Nothing in range{data.latestGsc ? "" : " — needs Search Console data"}.</p> : data.page2.map(r => (
              <div key={r.page} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(r.brand_id) }} />
                <a href={r.page} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline truncate flex-1" title={r.page}>{titleFor(r)}</a>
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">#{r.position.toFixed(0)}</span>
                <span className="text-[11px] text-gray-400 w-20 text-right shrink-0">{r.impressions.toLocaleString()} impr.</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500 mb-1">🖱 Under-clicking for their rank</p>
            <p className="text-[11.5px] text-gray-400 mb-3">Ranking well but CTR is below what that position should earn — sharpen the meta title and description.</p>
            {data.lowCtr.length === 0 ? <p className="text-sm text-gray-400">None flagged.</p> : data.lowCtr.map(r => (
              <div key={r.page} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(r.brand_id) }} />
                <a href={r.page} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline truncate flex-1" title={r.page}>{titleFor(r)}</a>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">#{r.position.toFixed(0)}</span>
                <span className="text-[11px] font-bold text-rose-500 w-16 text-right shrink-0">{r.ctr.toFixed(1)}% CTR</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Library */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 flex items-baseline gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Blog library</p>
          <span className="text-[12px] text-gray-400">{lib.length} posts · every published blog, all brands, one place</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-2">Post</th>
                <th className="text-left px-3 py-2">Brand</th>
                <th className="text-right px-3 py-2">Published</th>
                <th className="text-right px-3 py-2">Pageviews</th>
                <th className="text-right px-3 py-2">Clicks</th>
                <th className="text-right px-3 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? lib : lib.slice(0, 25)).map((a, i) => (
                <tr key={`${a.brand_id}${a.path}`} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                  <td className="px-5 py-2"><a href={a.url} target="_blank" rel="noreferrer" className="text-slate-700 font-medium hover:text-emerald-700 hover:underline">{a.title}</a></td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: brandColor(a.brand_id) }} />{brandName(a.brand_id)}</span></td>
                  <td className="px-3 py-2 text-right text-[12px] text-gray-400">{a.published_at ? new Date(a.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{a.pageviews ? a.pageviews.toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{a.clicks ? a.clicks.toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{a.position != null ? a.position.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lib.length > 25 && (
          <button onClick={() => setShowAll(v => !v)} className="w-full py-2.5 text-[12.5px] font-semibold text-emerald-600 hover:bg-emerald-50/50 border-t border-gray-50">
            {showAll ? "Show top 25" : `Show all ${lib.length} posts`}
          </button>
        )}
      </div>
    </div>
  );
}
