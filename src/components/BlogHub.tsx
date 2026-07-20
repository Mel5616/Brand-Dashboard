"use client";

import { useEffect, useMemo, useState } from "react";

// Blog performance hub — the full published library (synced from public
// sitemaps/Shopify) joined to GA4 pageviews, landing-page REVENUE attribution,
// traffic-source split, and Search Console rankings + per-post queries.
// Includes decay detection, publishing cadence and an AI monthly summary.
type Article = { brand_id: number; title: string; path: string; url: string; blog_handle: string; author: string | null; tags: string | null; published_at: string | null };
type Ga4Row = { brand_id: number; month_key: string; path: string; pageviews: number; sessions: number };
type GscRow = { brand_id: number; month_key: string; page: string; clicks: number; impressions: number; ctr: number; position: number };
type LandingRow = { brand_id: number; month_key: string; path: string; sessions: number; revenue: number; transactions: number };
type QueryRow = { brand_id: number; month_key: string; page: string; query: string; clicks: number; impressions: number; position: number };
type SourceRow = { brand_id: number; month_key: string; path: string; channel: string; sessions: number };
type BrandRef = { id: number; name: string; color: string };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const mShort = (mk: string) => new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
const aud = (n: number) => `$${Math.round(n).toLocaleString()}`;
const expectedCtr = (pos: number) => pos <= 1 ? 30 : pos <= 2 ? 15 : pos <= 3 ? 10 : pos <= 5 ? 6 : pos <= 10 ? 3 : 1;
const CHANNEL_COLOR: Record<string, string> = {
  "Organic Search": "#10b981", "Email": "#8b5cf6", "Organic Social": "#f472b6", "Paid Social": "#fb7185",
  "Direct": "#94a3b8", "Referral": "#38bdf8", "Paid Search": "#f59e0b", "Cross-network": "#fbbf24",
};
function mdLite(text: string) {
  const bold = (s: string, k: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={`${k}-${i}`} className="font-bold text-slate-800">{part}</strong> : part));
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return null;
    if (/^#{1,4}\s/.test(t)) return <p key={i} className="text-[13px] font-bold text-slate-800 mt-2.5 first:mt-0">{bold(t.replace(/^#{1,4}\s/, ""), String(i))}</p>;
    if (/^[-*•]\s/.test(t)) return <p key={i} className="text-[13px] text-slate-600 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-cyan-500">{bold(t.replace(/^[-*•]\s/, ""), String(i))}</p>;
    return <p key={i} className="text-[13px] text-slate-600 leading-relaxed mt-1.5">{bold(t, String(i))}</p>;
  });
}

export function BlogHub({ brands = [], admin = false }: { brands?: BrandRef[]; admin?: boolean }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [ga4, setGa4] = useState<Ga4Row[]>([]);
  const [gsc, setGsc] = useState<GscRow[]>([]);
  const [landing, setLanding] = useState<LandingRow[]>([]);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandSel, setBrandSel] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [sumBusy, setSumBusy] = useState(false);
  const [sumErr, setSumErr] = useState("");

  useEffect(() => {
    fetch("/api/blogs/hub").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) {
        setArticles(d.articles ?? []); setGa4(d.ga4 ?? []); setGsc(d.gsc ?? []);
        setLanding(d.landing ?? []); setQueries(d.queries ?? []); setSources(d.sources ?? []);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const brandName = (id: number) => brands.find(b => b.id === id)?.name ?? `Brand ${id}`;
  const brandColor = (id: number) => brands.find(b => b.id === id)?.color ?? "#94a3b8";

  async function runSummary() {
    setSumBusy(true); setSumErr("");
    const d = await fetch("/api/blogs/summary", { method: "POST" }).then(r => r.json()).catch(() => null);
    setSumBusy(false);
    if (d?.ok) setSummary(d.summary);
    else setSumErr(d?.error || "Couldn't generate the summary.");
  }

  const data = useMemo(() => {
    const inScope = <T extends { brand_id: number }>(rows: T[]) => brandSel === "all" ? rows : rows.filter(r => r.brand_id === brandSel);
    const arts = inScope(articles);
    const g4 = inScope(ga4), gc = inScope(gsc), ld = inScope(landing);
    const months = [...new Set(g4.map(r => r.month_key))].sort();
    const latestG4 = months[months.length - 1] ?? null;
    const latestGsc = [...new Set(gc.map(r => r.month_key))].sort().pop() ?? null;
    const latestLd = [...new Set(ld.map(r => r.month_key))].sort().pop() ?? null;
    const g4Latest = g4.filter(r => r.month_key === latestG4);
    const gscLatest = gc.filter(r => r.month_key === latestGsc);
    const ldLatest = ld.filter(r => r.month_key === latestLd);
    const pvByPath = new Map(g4Latest.map(r => [`${r.brand_id}|${r.path}`, r]));
    const ldByPath = new Map(ldLatest.map(r => [`${r.brand_id}|${r.path}`, r]));
    const gscByPath = new Map<string, GscRow>();
    for (const r of gscLatest) {
      const m = r.page.match(/\/blogs\/.+$/);
      if (m) gscByPath.set(`${r.brand_id}|${m[0]}`, r);
    }
    const joined = arts.map(a => {
      const k = `${a.brand_id}|${a.path}`;
      const pv = pvByPath.get(k); const gs = gscByPath.get(k); const rv = ldByPath.get(k);
      return { ...a, pageviews: pv?.pageviews ?? 0, sessions: pv?.sessions ?? 0,
        revenue: rv?.revenue ?? 0, transactions: rv?.transactions ?? 0,
        clicks: gs?.clicks ?? 0, impressions: gs?.impressions ?? 0, ctr: gs?.ctr ?? null, position: gs?.position ?? null };
    });
    const d30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const trend = months.slice(-12).map(mk => ({ mk, pv: g4.filter(r => r.month_key === mk).reduce((s, r) => s + r.pageviews, 0) }));
    const page2 = gscLatest.filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 50).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
    const lowCtr = gscLatest.filter(r => r.position <= 10 && r.impressions >= 100 && r.ctr < expectedCtr(r.position)).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
    // Decay: latest pageviews vs the post's own prior-3-month average.
    const prior3 = months.slice(-4, -1);
    const decay = latestG4 ? [...new Set(g4.filter(r => prior3.includes(r.month_key)).map(r => `${r.brand_id}|${r.path}`))]
      .map(k => {
        const [bid, path] = [Number(k.split("|")[0]), k.slice(k.indexOf("|") + 1)];
        const avg = prior3.length ? g4.filter(r => r.brand_id === bid && r.path === path && prior3.includes(r.month_key)).reduce((s, r) => s + r.pageviews, 0) / prior3.length : 0;
        const cur = pvByPath.get(k)?.pageviews ?? 0;
        return { bid, path, avg, cur, dropPct: avg > 0 ? (1 - cur / avg) * 100 : 0 };
      })
      .filter(x => x.avg >= 50 && x.dropPct >= 40)
      .sort((a, b) => b.avg - a.avg).slice(0, 8) : [];
    // Publishing cadence: posts per month per brand, last 12 months.
    const now = new Date();
    const cadMonths = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
    const cadence = cadMonths.map(mk => ({
      mk,
      byBrand: brands.map(b => ({ id: b.id, color: b.color, n: arts.filter(a => a.brand_id === b.id && (a.published_at ?? "").slice(0, 7) === mk).length })).filter(x => x.n > 0),
    }));
    const clicksTotal = gscLatest.reduce((s, r) => s + r.clicks, 0);
    const imprTotal = gscLatest.reduce((s, r) => s + r.impressions, 0);
    const wAvgPos = imprTotal > 0 ? gscLatest.reduce((s, r) => s + r.position * r.impressions, 0) / imprTotal : null;
    return {
      joined, latestG4, latestGsc, latestLd, trend, page2, lowCtr, decay, cadence,
      kpis: {
        total: arts.length,
        last30: arts.filter(a => (a.published_at ?? "") >= d30).length,
        pageviews: g4Latest.reduce((s, r) => s + r.pageviews, 0),
        revenue: ldLatest.reduce((s, r) => s + r.revenue, 0),
        clicks: clicksTotal, impressions: imprTotal, avgPos: wAvgPos,
      },
    };
  }, [articles, ga4, gsc, landing, brandSel, brands]);

  const titleFor = (bid: number, pageOrPath: string) => {
    const m = pageOrPath.match(/\/blogs\/.+$/);
    const a = m ? articles.find(x => x.brand_id === bid && x.path === m[0]) : null;
    return a?.title ?? (pageOrPath.split("/").pop() || pageOrPath);
  };

  if (loading) return <div className="p-6 text-center text-sm text-gray-400">Loading blog performance…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_blog_hub.sql</code> + <code className="bg-gray-100 px-1 rounded">add_blog_hub2.sql</code>, then run a sync.</div>;

  const lib = data.joined
    .filter(a => !q || (a.title || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.pageviews - a.pageviews || (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const top = lib.filter(a => a.pageviews > 0).slice(0, 10);
  const topRev = [...data.joined].filter(a => a.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const maxPv = Math.max(1, ...top.map(a => a.pageviews));
  const maxRev = Math.max(1, ...topRev.map(a => a.revenue));
  const maxTrend = Math.max(1, ...data.trend.map(t => t.pv));
  const maxCad = Math.max(1, ...data.cadence.map(c => c.byBrand.reduce((s, x) => s + x.n, 0)));

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-7 rounded-xl bg-cyan-50/60 border border-cyan-100 divide-x divide-cyan-100 text-center overflow-hidden">
        {[["Published blogs", data.kpis.total], ["New · 30 days", data.kpis.last30],
          [`Pageviews${data.latestG4 ? ` · ${mShort(data.latestG4)}` : ""}`, data.kpis.pageviews.toLocaleString()],
          [`Blog revenue${data.latestLd ? ` · ${mShort(data.latestLd)}` : ""}`, aud(data.kpis.revenue)],
          ["Google clicks", data.kpis.clicks.toLocaleString()],
          ["Impressions", data.kpis.impressions.toLocaleString()],
          ["Avg position", data.kpis.avgPos != null ? data.kpis.avgPos.toFixed(1) : "—"]].map(([l, v]) => (
          <div key={String(l)} className="py-2.5 px-1">
            <p className="text-lg font-bold text-slate-800">{v as any}</p>
            <p className="text-[9.5px] uppercase tracking-wider text-cyan-700/60">{l}</p>
          </div>
        ))}
      </div>

      {/* AI monthly summary */}
      {admin && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">✨ Monthly blog summary</p>
            <button onClick={runSummary} disabled={sumBusy} className="text-[12.5px] font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg px-3 py-1.5 disabled:opacity-60">{sumBusy ? "Thinking…" : summary ? "↻ Regenerate" : "Generate"}</button>
          </div>
          {sumErr && <p className="text-sm text-rose-500 mt-1.5">{sumErr}</p>}
          {summary && <div className="mt-2 space-y-0.5">{mdLite(summary)}</div>}
        </div>
      )}

      {/* Blogs by brand + cadence */}
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
        const maxBpv = Math.max(1, ...perBrand.map(b => b.pv));
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
                    <div className="flex-1 h-3.5 rounded-full bg-gray-100"><div className="h-3.5 rounded-full" style={{ width: `${(b.count / maxCount) * 100}%`, background: b.color }} /></div>
                    <span className="text-[11.5px] font-semibold text-slate-700 w-12 text-right">{b.count}{b.recent > 0 && <span className="text-emerald-500"> ●{b.recent}</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-600 w-28 truncate md:hidden">{b.name}</span>
                    <div className="flex-1 h-3.5 rounded-full bg-gray-100"><div className="h-3.5 rounded-full opacity-70" style={{ width: `${(b.pv / maxBpv) * 100}%`, background: b.color }} /></div>
                    <span className="text-[11.5px] font-semibold text-slate-700 w-14 text-right">{b.pv.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Publishing cadence — stacked by brand */}
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Publishing cadence · posts per month</p>
              <div className="flex items-end gap-1.5 h-20">
                {data.cadence.map(c => {
                  const tot = c.byBrand.reduce((s, x) => s + x.n, 0);
                  return (
                    <div key={c.mk} className="flex-1 flex flex-col items-center gap-1" title={`${mShort(c.mk)}: ${tot} post${tot === 1 ? "" : "s"}`}>
                      <span className="text-[9px] font-semibold text-slate-500">{tot || ""}</span>
                      <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${Math.max(2, (tot / maxCad) * 52)}px` }}>
                        {c.byBrand.map(x => <div key={x.id} style={{ height: `${(x.n / Math.max(1, tot)) * 100}%`, background: x.color }} />)}
                      </div>
                      <span className="text-[9px] text-gray-400">{mShort(c.mk).split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
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
        {/* Traffic + revenue */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">What posts bring in traffic?{data.latestG4 ? ` · ${mShort(data.latestG4)}` : ""}</p>
            {top.length === 0 ? <p className="text-sm text-gray-400">No pageview data yet.</p> : (
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

          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-1">💰 Which posts make money?{data.latestLd ? ` · ${mShort(data.latestLd)}` : ""}</p>
            <p className="text-[11.5px] text-gray-400 mb-3">Purchase revenue from sessions that landed on the post first.</p>
            {topRev.length === 0 ? <p className="text-sm text-gray-400">No attributed revenue yet — lands with the next sync.</p> : (
              <div className="space-y-2">
                {topRev.map(a => (
                  <div key={`r${a.brand_id}${a.path}`} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(a.brand_id) }} />
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-[12.5px] text-slate-600 hover:text-emerald-700 hover:underline truncate w-[44%]" title={a.title}>{a.title}</a>
                    <div className="flex-1 h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full bg-emerald-400" style={{ width: `${(a.revenue / maxRev) * 100}%` }} /></div>
                    <span className="text-[11.5px] font-bold text-emerald-700 w-16 text-right">{aud(a.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Opportunities + decay */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600 mb-1">🎯 Page 2 — nearly there</p>
            <p className="text-[11.5px] text-gray-400 mb-3">Ranking 11–20 with real impressions — a refresh or internal links could push these onto page 1.</p>
            {data.page2.length === 0 ? <p className="text-sm text-gray-400">Nothing in range{data.latestGsc ? "" : " — needs Search Console"}.</p> : data.page2.map(r => (
              <div key={r.page} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(r.brand_id) }} />
                <a href={r.page} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline truncate flex-1">{titleFor(r.brand_id, r.page)}</a>
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
                <a href={r.page} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline truncate flex-1">{titleFor(r.brand_id, r.page)}</a>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">#{r.position.toFixed(0)}</span>
                <span className="text-[11px] font-bold text-rose-500 w-16 text-right shrink-0">{r.ctr.toFixed(1)}% CTR</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500 mb-1">📉 Needs a refresh</p>
            <p className="text-[11.5px] text-gray-400 mb-3">Traffic down 40%+ vs the post&apos;s own 3-month average — a content refresh is cheaper than a new post.</p>
            {data.decay.length === 0 ? <p className="text-sm text-gray-400">No decaying posts flagged.</p> : data.decay.map(x => (
              <div key={`${x.bid}${x.path}`} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(x.bid) }} />
                <span className="text-slate-600 truncate flex-1">{titleFor(x.bid, x.path)}</span>
                <span className="text-[11px] text-gray-400 shrink-0">{Math.round(x.avg)} → {x.cur}/mo</span>
                <span className="text-[11px] font-bold text-orange-500 w-12 text-right shrink-0">▼{Math.round(x.dropPct)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Library — click a row for queries, sources and revenue */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 flex items-baseline gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Blog library</p>
          <span className="text-[12px] text-gray-400">{lib.length} posts · click a row for its search queries, traffic sources and revenue</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-2">Post</th>
                <th className="text-left px-3 py-2">Brand</th>
                <th className="text-right px-3 py-2">Published</th>
                <th className="text-right px-3 py-2">Pageviews</th>
                <th className="text-right px-3 py-2">Revenue</th>
                <th className="text-right px-3 py-2">Clicks</th>
                <th className="text-right px-3 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? lib : lib.slice(0, 25)).map((a, i) => {
                const key = `${a.brand_id}|${a.path}`;
                const isOpen = expanded === key;
                const postQueries = queries.filter(r => r.brand_id === a.brand_id && r.page.endsWith(a.path))
                  .reduce((acc: Record<string, QueryRow>, r) => { const cur = acc[r.query]; if (!cur || r.month_key > cur.month_key) acc[r.query] = r; return acc; }, {});
                const qList = Object.values(postQueries).sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions).slice(0, 8);
                const srcMonth = [...new Set(sources.filter(r => r.brand_id === a.brand_id && r.path === a.path).map(r => r.month_key))].sort().pop();
                const srcList = sources.filter(r => r.brand_id === a.brand_id && r.path === a.path && r.month_key === srcMonth).sort((x, y) => y.sessions - x.sessions);
                const srcTotal = srcList.reduce((s, r) => s + r.sessions, 0);
                return (
                  <>
                    <tr key={key} onClick={() => setExpanded(isOpen ? null : key)}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-cyan-50/30 ${i % 2 === 1 ? "bg-gray-50/50" : ""} ${isOpen ? "bg-cyan-50/50" : ""}`}>
                      <td className="px-5 py-2"><span className="text-slate-700 font-medium">{isOpen ? "▾ " : "▸ "}{a.title}</span></td>
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: brandColor(a.brand_id) }} />{brandName(a.brand_id)}</span></td>
                      <td className="px-3 py-2 text-right text-[12px] text-gray-400">{a.published_at ? new Date(a.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">{a.pageviews ? a.pageviews.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{a.revenue ? aud(a.revenue) : "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{a.clicks ? a.clicks.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{a.position != null ? a.position.toFixed(1) : "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr key={`${key}x`} className="bg-cyan-50/30 border-b border-gray-50">
                        <td colSpan={7} className="px-5 py-3">
                          <div className="grid md:grid-cols-3 gap-5">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Ranks for</p>
                              {qList.length === 0 ? <p className="text-[12px] text-gray-400">No query data{data.latestGsc ? "" : " (needs Search Console)"}.</p> : qList.map(r => (
                                <p key={r.query} className="text-[12px] text-slate-600 flex justify-between gap-2 py-0.5">
                                  <span className="truncate">{r.query}</span>
                                  <span className="shrink-0 text-gray-400">#{r.position.toFixed(0)} · {r.clicks} clicks</span>
                                </p>
                              ))}
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Where traffic comes from{srcMonth ? ` · ${mShort(srcMonth)}` : ""}</p>
                              {srcList.length === 0 ? <p className="text-[12px] text-gray-400">No source data yet.</p> : (
                                <>
                                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-1.5">
                                    {srcList.map(r => <div key={r.channel} title={`${r.channel}: ${r.sessions}`} style={{ width: `${(r.sessions / Math.max(1, srcTotal)) * 100}%`, background: CHANNEL_COLOR[r.channel] ?? "#cbd5e1" }} />)}
                                  </div>
                                  {srcList.slice(0, 5).map(r => (
                                    <p key={r.channel} className="text-[12px] text-slate-600 flex justify-between py-0.5">
                                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: CHANNEL_COLOR[r.channel] ?? "#cbd5e1" }} />{r.channel}</span>
                                      <span className="text-gray-400">{Math.round((r.sessions / Math.max(1, srcTotal)) * 100)}%</span>
                                    </p>
                                  ))}
                                </>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Money</p>
                              <p className="text-[13px] text-slate-700">Attributed revenue: <strong className="text-emerald-700">{a.revenue ? aud(a.revenue) : "$0"}</strong>{a.transactions ? ` · ${a.transactions} orders` : ""}</p>
                              <p className="text-[12px] text-gray-400 mt-1">Sessions landing on this post first, latest month.</p>
                              <a href={a.url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[12px] font-semibold text-emerald-600 hover:underline">Open post ↗</a>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
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
