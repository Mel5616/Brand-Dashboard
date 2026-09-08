"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Public review-incentive landing page — reached via a QR code or shared
// link (e.g. a packaging insert). Where the brand has Judge.me set up, the
// review itself (rating + text) is written right here and posted for real
// before a reward code is issued. Otherwise, falls back to the older
// email-then-redirect flow.
type Incentive = { brand: string; label: string; review_url: string | null; discount_type: string; discount_value: number; min_spend: number | null; collectsReview: boolean };

export default function ReviewIncentive() {
  const { slug } = useParams<{ slug: string }>();
  const [incentive, setIncentive] = useState<Incentive | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewBody, setReviewBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ code: string; review_url: string | null } | null>(null);

  useEffect(() => {
    fetch(`/api/review-incentives/public?slug=${encodeURIComponent(slug)}`).then(r => r.json()).then(d => {
      if (d.ok) setIncentive(d.item); else setErr(d.error || "This link isn't active.");
      setLoading(false);
    }).catch(() => { setErr("Couldn't load this page."); setLoading(false); });
  }, [slug]);

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("Enter a valid email."); return; }
    if (incentive?.collectsReview) {
      if (!rating) { setErr("Choose a star rating."); return; }
      if (reviewBody.trim().length < 10) { setErr("Write a few words about your experience."); return; }
    }
    setBusy(true); setErr("");
    const res = await fetch("/api/review-request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, email, name, rating: rating || undefined, review_body: reviewBody || undefined }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) setResult(res); else setErr(res?.error || "Something went wrong — try again.");
  }

  const amount = incentive ? (incentive.discount_type === "percentage" ? `${incentive.discount_value}%` : `$${incentive.discount_value}`) : "";

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !incentive ? (
          <p className="text-sm text-rose-500">{err || "This link isn't active."}</p>
        ) : result ? (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-2">Thanks for reviewing {incentive.brand}!</p>
            <p className="text-sm text-slate-500 mb-4">Here&apos;s your code for {amount} off your next order — it&apos;s also on its way to your inbox.</p>
            <p className="text-2xl font-bold tracking-wide bg-slate-50 rounded-lg py-3 mb-5">{result.code}</p>
            {result.review_url && (
              <a href={result.review_url} target="_blank" rel="noreferrer" className="inline-block w-full text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-3 hover:bg-emerald-700">
                See it on the site
              </a>
            )}
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-2">{incentive.brand}</p>
            <p className="text-sm text-slate-500 mb-6">
              {incentive.collectsReview ? "Tell us what you thought and get " : "Leave us a review and get "}
              <strong>{amount} off</strong> your next order{incentive.min_spend ? ` (min. spend $${incentive.min_spend})` : ""}.
            </p>

            {incentive.collectsReview && (
              <>
                <div className="flex justify-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(n)} className={`text-3xl leading-none ${n <= rating ? "text-amber-400" : "text-gray-200"}`} aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>
                  ))}
                </div>
                <textarea
                  value={reviewBody} onChange={e => setReviewBody(e.target.value)} rows={4} placeholder="What did you think?"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y"
                />
                <input
                  value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </>
            )}
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {err && <p className="text-sm text-rose-500 mb-3">{err}</p>}
            <button onClick={submit} disabled={busy} className="w-full text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-3 hover:bg-emerald-700 disabled:opacity-60">
              {busy ? "Submitting…" : incentive.collectsReview ? "Submit my review" : "Get my code"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
