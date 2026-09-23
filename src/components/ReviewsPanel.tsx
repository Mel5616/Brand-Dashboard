"use client";

import { useEffect, useState } from "react";

// Reviews, one place: every brand's Klaviyo Reviews (mirrored hourly into
// Supabase by scripts/review_rewards.py, so all 13 brands show without live
// keys) alongside the incentive links/QR codes used to drive new ones, and
// who's claimed a reward so far.
type Brand = { id: number; name: string };
type Incentive = {
  id: string; slug: string; brand: string; brand_id: number; label: string; review_url: string | null; judgeme_product_id: string | null;
  discount_type: string; discount_value: number; min_spend: number | null; expiry_days: number; active: boolean;
};
type ReviewRequest = { id: string; brand: string; email: string; discount_code: string | null; status: string; created_at: string; rating: number | null };
type SourceReview = { id: string; rating: number | null; title: string | null; content: string | null; author: string | null; product: string | null; productUrl: string | null; created: string | null; verified: boolean; status: string | null; reply: string | null };
type BrandReviews = { id: number; brand: string; platform: string; enabled: boolean; total: number; last30: number; last90: number; pending: number; avgRating: number | null; reviews: SourceReview[] };

const inp = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white";
const stars = (n: number | null) => n == null ? "" : "★".repeat(n) + "☆".repeat(5 - n);

export function ReviewsPanel({ brands = [], canEdit = false }: { brands?: Brand[]; canEdit?: boolean }) {
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [klaviyoReviews, setKlaviyoReviews] = useState<BrandReviews[]>([]);
  const [reviewsSetup, setReviewsSetup] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [openBrand, setOpenBrand] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const empty = { brand: "", label: "", review_url: "", judgeme_product_id: "", discount_type: "percentage", discount_value: "10", min_spend: "", expiry_days: "30" };
  const [f, setF] = useState(empty);

  async function load() {
    const [i, r, k] = await Promise.all([
      fetch("/api/review-incentives").then(x => x.json()).catch(() => ({ ok: false })),
      fetch("/api/review-requests").then(x => x.json()).catch(() => ({ ok: false })),
      fetch("/api/klaviyo-reviews").then(x => x.json()).catch(() => ({ ok: false })),
    ]);
    if (i.ok) { setIncentives(i.items || []); setNeedsSetup(!!i.needsSetup); }
    setRequests(r.items || []);
    setKlaviyoReviews(k.brands || []);
    setReviewsSetup(!k.needsSetup);
    setLastSynced(k.lastSynced || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addIncentive() {
    const brandId = brands.find(b => b.name === f.brand)?.id;
    if (!f.brand || !f.label.trim() || brandId == null) { setMsg("Brand and label required"); return; }
    setMsg("");
    const res = await fetch("/api/review-incentives", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, brand_id: brandId }),
    }).then(x => x.json());
    if (!res.ok) { setMsg(res.error || "Couldn't save"); return; }
    setF(empty); setShowForm(false); load();
  }

  async function toggleIncentive(inc: Incentive) {
    setIncentives(prev => prev.map(x => x.id === inc.id ? { ...x, active: !x.active } : x));
    await fetch("/api/review-incentives", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: inc.id, active: !inc.active }) });
  }

  async function removeIncentive(inc: Incentive) {
    if (!confirm(`Delete "${inc.label}"? Any QR codes already printed will stop working.`)) return;
    await fetch(`/api/review-incentives?id=${inc.id}`, { method: "DELETE" });
    setIncentives(prev => prev.filter(x => x.id !== inc.id));
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/review/${slug}`;
    navigator.clipboard?.writeText(url).then(() => { setCopiedSlug(slug); setTimeout(() => setCopiedSlug(null), 1500); });
  }

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Reviews isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_review_incentives.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reviews across your sites */}
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-700">Reviews across your sites</h3>
          <p className="text-[11px] text-gray-400">
            Klaviyo Reviews, every brand · published only · counts are last 30 / 90 days
            {lastSynced ? ` · synced ${new Date(lastSynced).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
        </div>
        {!reviewsSetup && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            Run <code className="font-mono text-xs">supabase/add_klaviyo_reviews.sql</code> in Supabase, then the hourly review job fills this in.
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {klaviyoReviews.map(b => {
            const open = openBrand === b.id;
            return (
              <div key={b.id} className={`bg-white rounded-xl border p-4 ${open ? "border-emerald-300 sm:col-span-2 lg:col-span-3 xl:col-span-4" : "border-gray-100"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">{b.brand}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {b.enabled
                        ? <>{b.avgRating != null && <span className="text-amber-500">{"★".repeat(Math.round(b.avgRating))} {b.avgRating}</span>}{b.avgRating != null ? " · " : ""}{b.total} published{b.pending ? ` · ${b.pending} pending` : ""}</>
                        : b.platform === "yotpo" ? "Moving to Yotpo · not connected yet" : "No reviews yet"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold text-slate-800 leading-none">{b.last30}<span className="text-xs text-gray-400 font-normal"> / {b.last90}</span></p>
                    <p className="text-[10px] text-gray-400">30d / 90d</p>
                  </div>
                </div>
                {b.enabled && (
                  <button onClick={() => setOpenBrand(open ? null : b.id)} className="text-xs text-emerald-700 font-medium mt-2 hover:underline">
                    {open ? "Hide reviews" : `Latest ${Math.min(b.reviews.length, open ? 12 : 12)} reviews`}
                  </button>
                )}
                {open && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                    {b.reviews.map(r => (
                      <div key={r.id} className="text-xs border border-gray-100 rounded-lg p-3">
                        <p className="text-amber-500">{stars(r.rating)}{r.verified && <span className="text-emerald-600 font-medium"> · verified</span>}{r.status && r.status !== "published" && <span className="text-amber-700 font-medium"> · {r.status}</span>}</p>
                        {r.title && <p className="font-medium text-slate-800 mt-1">{r.title}</p>}
                        {r.content && <p className="text-slate-600 mt-0.5 whitespace-pre-line">{r.content}</p>}
                        <p className="text-gray-400 mt-1.5">
                          {r.author || "Anonymous"}
                          {r.product ? <> · {r.productUrl ? <a href={r.productUrl} target="_blank" rel="noreferrer" className="hover:underline">{r.product}</a> : r.product}</> : ""}
                          {r.created ? ` · ${new Date(r.created).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                        </p>
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

      {/* Incentive links / QR codes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-700">Incentive links & QR codes</h3>
          {canEdit && (
            <button onClick={() => setShowForm(s => !s)} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700">
              {showForm ? "Cancel" : "+ Add link"}
            </button>
          )}
        </div>

        {showForm && canEdit && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2 mb-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <select value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} className={inp}>
                <option value="">Brand *</option>
                {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Label — e.g. Packaging insert *" className={inp} />
              <input value={f.judgeme_product_id} onChange={e => setF({ ...f, judgeme_product_id: e.target.value })} placeholder="Judge.me product ID (optional)" className={inp} />
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              <input value={f.review_url} onChange={e => setF({ ...f, review_url: e.target.value })} placeholder="Product page link (optional, shown after)" className={inp} />
              <select value={f.discount_type} onChange={e => setF({ ...f, discount_type: e.target.value })} className={inp}>
                <option value="percentage">% off</option>
                <option value="fixed_amount">$ off</option>
              </select>
              <input type="number" value={f.discount_value} onChange={e => setF({ ...f, discount_value: e.target.value })} placeholder="Discount value" className={inp} />
              <input type="number" value={f.min_spend} onChange={e => setF({ ...f, min_spend: e.target.value })} placeholder="Min spend (optional)" className={inp} />
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              <input type="number" value={f.expiry_days} onChange={e => setF({ ...f, expiry_days: e.target.value })} placeholder="Expires after (days)" className={inp} />
            </div>
            <p className="text-xs text-gray-400">If the brand has Judge.me set up, the reviewer writes their review right on the page and it posts for real — leave the product ID blank for a shop-level review, or set it to attach to one product. Brands without Judge.me yet fall back to a simple email-for-a-code flow.</p>
            {msg && <p className="text-sm text-amber-600">{msg}</p>}
            <button onClick={addIncentive} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-1.5 hover:bg-emerald-700">Save</button>
          </div>
        )}

        {incentives.length === 0 ? (
          <p className="text-sm text-slate-400">No incentive links yet — add one to generate a QR code and shareable link.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {incentives.map(inc => (
              <div key={inc.id} className={`bg-white rounded-xl border border-gray-100 p-4 space-y-2 ${!inc.active ? "opacity-60" : ""}`}>
                <img src={`/api/review-incentives/qr?slug=${inc.slug}`} alt="" className="w-32 h-32 mx-auto" />
                <p className="font-medium text-slate-800 text-center">{inc.brand} · {inc.label}</p>
                <p className="text-xs text-gray-400 text-center">{inc.discount_type === "percentage" ? `${inc.discount_value}%` : `$${inc.discount_value}`} off{inc.min_spend ? `, min $${inc.min_spend}` : ""} · {inc.expiry_days}-day code</p>
                <div className="flex justify-center gap-2 pt-1">
                  <button onClick={() => copyLink(inc.slug)} className="text-xs font-medium border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                    {copiedSlug === inc.slug ? "Copied" : "Copy link"}
                  </button>
                  {canEdit && (
                    <>
                      <button onClick={() => toggleIncentive(inc)} className="text-xs border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                        {inc.active ? "Turn off" : "Turn on"}
                      </button>
                      <button onClick={() => removeIncentive(inc)} className="text-xs border border-rose-200 text-rose-500 rounded-lg px-3 py-1.5 hover:bg-rose-50">Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Codes issued */}
      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2">Codes issued</h3>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2 pl-4 pr-3 font-medium">Brand</th>
                  <th className="py-2 px-3 font-medium">Email</th>
                  <th className="py-2 px-3 font-medium">Code</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Issued</th>
                </tr>
              </thead>
              <tbody>
                {requests.slice(0, 100).map(r => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pl-4 pr-3 text-slate-700">{r.brand}</td>
                    <td className="py-2 px-3 text-slate-600">{r.email}</td>
                    <td className="py-2 px-3 font-medium text-slate-700">{r.discount_code}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${r.status === "redeemed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{new Date(r.created_at).toLocaleDateString("en-AU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
