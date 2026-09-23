"use client";

import { useEffect, useMemo, useState } from "react";
import { ReviewRewardsCard } from "./ReviewRewardsCard";

// Reviews, one place, for every brand's Klaviyo Reviews (mirrored hourly into
// Supabase by scripts/review_rewards.py, so all brands show without live keys):
//   1. what needs you now — pending moderation and low ratings this week
//   2. the funnel — request emails sent → reviews → $5 codes → revenue
//   3. per-brand cards with the latest reviews
//   4. products with too few reviews (where inserts and nudges should go)
//   5. the $5 any-brand reward log
type Brand = { id: number; name: string };
type SourceReview = { id: string; rating: number | null; title: string | null; content: string | null; author: string | null; product: string | null; productUrl: string | null; created: string | null; verified: boolean; status: string | null; reply: string | null };
type BrandReviews = { id: number; brand: string; host: string; colour: string; platform: string; enabled: boolean; total: number; last30: number; last90: number; pending: number; avgRating: number | null; dist: number[]; reviews: SourceReview[] };
type QueueItem = { id: string; brand: string; brandId: number; rating: number | null; author: string | null; email: string | null; product: string | null; productUrl: string | null; content: string | null; created: string | null; status: string | null; replied: boolean };
type Funnel = { id: number; brand: string; platform: string; flowStatus: string | null; sent: number; clicks: number; written: number; rate: number | null; issued: number; redeemed: number; revenue: number };
type ThinBrand = { id: number; brand: string; connected: boolean; total: number; thin: { handle: string; title: string; url: string; image: string | null; reviews: number }[] };

const stars = (n: number | null) => n == null ? "" : "★".repeat(n) + "☆".repeat(5 - n);
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" }) : "";
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const KLAVIYO_REVIEWS = "https://www.klaviyo.com/reviews";

export function ReviewsPanel({ canEdit = false }: { brands?: Brand[]; canEdit?: boolean }) {
  const [brands, setBrands] = useState<BrandReviews[]>([]);
  const [queue, setQueue] = useState<{ pending: QueueItem[]; low: QueueItem[] }>({ pending: [], low: [] });
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [thin, setThin] = useState<ThinBrand[] | null>(null);
  const [thinMin, setThinMin] = useState(3);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [openBrand, setOpenBrand] = useState<number | null>(null);
  const [thinBrand, setThinBrand] = useState<number | null>(null);
  const [showAllPending, setShowAllPending] = useState(false);

  useEffect(() => {
    fetch("/api/klaviyo-reviews").then(x => x.json()).then(k => {
      if (!k.ok) return;
      setBrands(k.brands || []); setQueue(k.queue || { pending: [], low: [] }); setFunnel(k.funnel || []); setMonths(k.months || []);
      setNeedsSetup(!!k.needsSetup); setLastSynced(k.lastSynced || null);
    }).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/reviews/thin-products").then(x => x.json()).then(t => { if (t.ok) { setThin(t.brands || []); setThinMin(t.min || 3); } }).catch(() => setThin([]));
  }, []);

  const totals = useMemo(() => ({
    total: brands.reduce((s, b) => s + b.total, 0), last30: brands.reduce((s, b) => s + b.last30, 0), pending: brands.reduce((s, b) => s + b.pending, 0),
    avg: (() => { const r = brands.filter(b => b.avgRating != null && b.total > 0); const w = r.reduce((s, b) => s + b.total, 0); return w ? Math.round(r.reduce((s, b) => s + (b.avgRating as number) * b.total, 0) / w * 10) / 10 : null; })(),
  }), [brands]);
  const monthLabel = (mk: string) => new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short" });

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) return <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Run <code className="font-mono text-xs">supabase/add_klaviyo_reviews.sql</code> in Supabase, then the hourly review job fills this in.</p>;

  const pendingShown = showAllPending ? queue.pending : queue.pending.slice(0, 6);
  const needsYou = queue.low.length + queue.pending.length;

  return (
    <div className="space-y-8">
      {/* ── Summary strip: what needs you (left) + headline numbers (right) ── */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className={`rounded-2xl border p-5 ${needsYou ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}>
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Needs you</h3>
            <a href={KLAVIYO_REVIEWS} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:underline">Open Klaviyo Reviews ↗</a>
          </div>
          {needsYou === 0 && <p className="text-sm text-emerald-800">Nothing waiting. No reviews pending approval and nothing under 3 stars this week.</p>}
          {queue.low.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-rose-700 mb-1.5">{queue.low.length} low rating{queue.low.length === 1 ? "" : "s"} in the last 7 days · reply before it sits on the product page</p>
              <div className="space-y-1.5">
                {queue.low.map(r => (
                  <div key={r.id} className="bg-white rounded-lg border border-rose-100 px-3 py-2 text-xs">
                    <p><span className="text-amber-500">{stars(r.rating)}</span> <span className="font-medium text-slate-800">{r.brand}</span> · {r.product || "shop review"} · {day(r.created)}{r.replied && <span className="text-emerald-700 font-medium"> · replied</span>}</p>
                    {r.content && <p className="text-slate-600 mt-0.5 line-clamp-2">{r.content}</p>}
                    <p className="text-slate-400 mt-0.5">{r.author || "Anonymous"}{r.email ? <> · <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a></> : ""}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {queue.pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-1.5">{queue.pending.length} waiting for approval in Klaviyo</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(queue.pending.reduce<Record<string, number>>((m, r) => { m[r.brand] = (m[r.brand] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([b, n]) => (
                  <a key={b} href={KLAVIYO_REVIEWS} target="_blank" rel="noreferrer" className="text-xs bg-white border border-amber-200 rounded-full px-2.5 py-1 text-slate-700 hover:border-amber-400">{b} <span className="font-semibold">{n}</span></a>
                ))}
              </div>
              <div className="mt-2 space-y-1">
                {pendingShown.map(r => (
                  <p key={r.id} className="text-xs text-slate-600"><span className="text-amber-500">{stars(r.rating)}</span> {r.brand} · {r.product || "shop review"} · {r.author || "Anonymous"} · {day(r.created)}</p>
                ))}
                {queue.pending.length > 6 && <button onClick={() => setShowAllPending(v => !v)} className="text-xs text-slate-500 hover:underline">{showAllPending ? "Show fewer" : `Show all ${queue.pending.length}`}</button>}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Approve or reject in Klaviyo (switch to the brand&apos;s account). Klaviyo&apos;s API can&apos;t change review status, so it can&apos;t be done from here.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[["Published reviews", totals.total.toLocaleString("en-AU")], ["Last 30 days", totals.last30.toLocaleString("en-AU")], ["Average rating", totals.avg != null ? `${totals.avg} ★` : "—"], ["Pending approval", totals.pending.toLocaleString("en-AU")]].map(([l, v]) => (
            <div key={l} className="bg-white rounded-2xl border border-gray-100 px-4 py-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className="text-2xl font-semibold text-slate-800 tabular-nums mt-0.5">{v}</p></div>
          ))}
          <p className="col-span-2 text-[11px] text-gray-400 px-1">All brands, Klaviyo Reviews{lastSynced ? ` · synced ${new Date(lastSynced).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""} · Nanit moves to Yotpo</p>
        </div>
      </div>

      {/* ── Funnel ── */}
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-700">Request → review → reward funnel</h3>
          <p className="text-[11px] text-gray-400">{months.map(monthLabel).join(" + ")} · request emails from each brand&apos;s Klaviyo review flow · $5 codes from the reward job</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
              <th className="text-left font-semibold py-2 pl-4 pr-3">Brand</th><th className="text-left font-semibold py-2 pr-3">Review flow</th><th className="text-right font-semibold py-2 pr-3">Requests sent</th><th className="text-right font-semibold py-2 pr-3">Clicked</th><th className="text-right font-semibold py-2 pr-3">Reviews</th><th className="text-right font-semibold py-2 pr-3">Rate</th><th className="text-right font-semibold py-2 pr-3">$5 codes</th><th className="text-right font-semibold py-2 pr-3">Redeemed</th><th className="text-right font-semibold py-2 pr-4">Revenue</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {funnel.map(f => {
                const fs = (f.flowStatus || "").toLowerCase();
                return (
                  <tr key={f.id} className={f.platform === "yotpo" ? "text-slate-400" : ""}>
                    <td className="py-2 pl-4 pr-3 font-medium text-slate-800">{f.brand}</td>
                    <td className="py-2 pr-3">{f.platform === "yotpo" ? <span className="text-xs">Yotpo · not connected</span> : fs === "live" ? <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">live</span> : f.sent > 0 ? <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-500">{f.flowStatus}</span> : <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">not sending</span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.sent ? f.sent.toLocaleString("en-AU") : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{f.clicks ? f.clicks.toLocaleString("en-AU") : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{f.written || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.rate != null ? <span className={f.rate >= 3 ? "text-emerald-700" : f.rate >= 1 ? "text-slate-700" : "text-amber-700"}>{f.rate}%</span> : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.issued || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.redeemed || "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{f.revenue ? money(f.revenue) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Rate = reviews written ÷ request emails delivered. Around 1–3% is typical for an unincentivised post-delivery email; with the $5 reward in the email, aim for 5%+. &ldquo;Not sending&rdquo; means the brand&apos;s review-request flow hasn&apos;t delivered anything in these months. Go-live links are on Email → Flows.</p>
      </div>

      {/* ── Brand cards ── */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-2">By brand</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {brands.map(b => {
            const open = openBrand === b.id;
            const maxD = Math.max(1, ...b.dist);
            return (
              <div key={b.id} className={`bg-white rounded-xl border p-4 ${open ? "border-emerald-300 sm:col-span-2 lg:col-span-3 xl:col-span-4" : "border-gray-100"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.colour }} />{b.brand}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {b.enabled
                        ? <>{b.avgRating != null && <span className="text-amber-500">{"★".repeat(Math.round(b.avgRating))} {b.avgRating}</span>}{b.avgRating != null ? " · " : ""}{b.total} published{b.pending ? <span className="text-amber-700"> · {b.pending} pending</span> : ""}</>
                        : b.platform === "yotpo" ? "Moving to Yotpo · not connected yet" : "No reviews yet"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold text-slate-800 leading-none">{b.last30}<span className="text-xs text-gray-400 font-normal"> / {b.last90}</span></p>
                    <p className="text-[10px] text-gray-400">30d / 90d</p>
                  </div>
                </div>
                {b.enabled && (
                  <div className="flex items-end gap-0.5 h-6 mt-2" title="Rating distribution 1★ → 5★">
                    {b.dist.map((n, i) => <div key={i} className="flex-1 rounded-sm bg-amber-200" style={{ height: `${Math.max(8, (n / maxD) * 100)}%`, opacity: 0.45 + i * 0.13 }} title={`${i + 1}★: ${n}`} />)}
                  </div>
                )}
                {b.id === 8 && b.total > 0 && b.total < 5 && <p className="text-[11px] text-slate-400 mt-2">Ratings stay hidden on fridaaustralia.com.au until there are a few more. Say the word to switch them on.</p>}
                {b.id === 8 && b.total >= 5 && <p className="text-[11px] text-emerald-700 mt-2">Enough reviews to show ratings on fridaaustralia.com.au. Say the word to switch them on.</p>}
                {b.enabled && (
                  <button onClick={() => setOpenBrand(open ? null : b.id)} className="text-xs text-emerald-700 font-medium mt-2 hover:underline">{open ? "Hide reviews" : "Latest reviews"}</button>
                )}
                {open && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                    {b.reviews.map(r => (
                      <div key={r.id} className="text-xs border border-gray-100 rounded-lg p-3">
                        <p className="text-amber-500">{stars(r.rating)}{r.verified && <span className="text-emerald-600 font-medium"> · verified</span>}{r.status && r.status !== "published" && r.status !== "featured" && <span className="text-amber-700 font-medium"> · {r.status}</span>}</p>
                        {r.title && <p className="font-medium text-slate-800 mt-1">{r.title}</p>}
                        {r.content && <p className="text-slate-600 mt-0.5 whitespace-pre-line">{r.content}</p>}
                        <p className="text-gray-400 mt-1.5">{r.author || "Anonymous"}{r.product ? <> · {r.productUrl ? <a href={r.productUrl} target="_blank" rel="noreferrer" className="hover:underline">{r.product}</a> : r.product}</> : ""}{r.created ? ` · ${day(r.created)}` : ""}</p>
                        {r.reply && <p className="text-slate-500 italic mt-1.5 border-l-2 border-gray-200 pl-2">Reply: {r.reply}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Thin products ── */}
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-700">Products with fewer than {thinMin} reviews</h3>
          <p className="text-[11px] text-gray-400">Active products on each store · where QR inserts and post-purchase nudges should point</p>
        </div>
        {thin === null ? <p className="text-sm text-slate-400">Checking each store&apos;s catalogue…</p> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {thin.map(t => {
              const open = thinBrand === t.id;
              const none = t.thin.filter(p => p.reviews === 0).length;
              return (
                <div key={t.id} className={`bg-white rounded-xl border p-4 ${open ? "border-emerald-300 sm:col-span-2 lg:col-span-3 xl:col-span-4" : "border-gray-100"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">{t.brand}</p>
                    {t.connected ? <p className="text-right"><span className="text-lg font-semibold text-slate-800 tabular-nums">{t.thin.length}</span><span className="text-xs text-gray-400"> / {t.total}</span></p> : <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">No store access</span>}
                  </div>
                  {t.connected && <p className="text-xs text-gray-400 mt-0.5">{none} with none · {t.total - t.thin.length} covered</p>}
                  {t.connected && t.thin.length > 0 && <button onClick={() => setThinBrand(open ? null : t.id)} className="text-xs text-emerald-700 font-medium mt-2 hover:underline">{open ? "Hide" : "Show products"}</button>}
                  {open && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mt-3">
                      {t.thin.map(p => (
                        <a key={p.handle} href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 border border-gray-100 rounded-lg p-2 hover:border-slate-300">
                          {p.image ? <img src={p.image} alt="" className="w-10 h-10 rounded object-cover bg-slate-50 shrink-0" /> : <span className="w-10 h-10 rounded bg-slate-50 shrink-0" />}
                          <span className="min-w-0"><span className="block text-xs text-slate-700 truncate">{p.title}</span><span className={`block text-[11px] ${p.reviews === 0 ? "text-rose-600" : "text-slate-400"}`}>{p.reviews === 0 ? "No reviews" : `${p.reviews} review${p.reviews === 1 ? "" : "s"}`}</span></span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── $5 reward log ── */}
      <ReviewRewardsCard />
      {!canEdit && null}
    </div>
  );
}
