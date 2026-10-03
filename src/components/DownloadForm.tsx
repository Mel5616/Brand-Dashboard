"use client";

import { useState } from "react";
import { GRAPHIC_BRANDS } from "@/lib/socialGraphic";

// Public signup form for a digital download. Themed from the brand's graphic
// palette and logo so it feels like the brand, not the dashboard.
export function DownloadForm({ slug, title, description, brand, src, embed }: { slug: string; title: string; description: string | null; brand: string; src: string; embed: boolean }) {
  const style = GRAPHIC_BRANDS[brand];
  const bg = style?.bold.bg ?? "#4AC1E0";
  const accent = style?.bold.ctaFg ?? "#2FA8C8";
  const logo = style?.bold.logo;
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ file_url: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/public-download", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, email, first_name: firstName, consent, src, company }),
    }).then(x => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok && r.file_url) setDone({ file_url: r.file_url });
    else if (r?.ok) setDone({ file_url: "" });
    else setError(r?.error || "Something went wrong. Please try again.");
  }

  const inp = "w-full text-[16px] border border-gray-300 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2";
  return (
    <div className={embed ? "p-0" : "min-h-screen flex items-center justify-center p-4"} style={{ background: embed ? "transparent" : bg }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && !embed && <img src={style.list.logo.src} alt={brand} style={{ height: 46, width: "auto", marginBottom: 18 }} />}
        <h1 className="text-[26px] leading-tight font-extrabold text-slate-800">{title}</h1>
        {description && <p className="text-[15px] text-slate-500 mt-2 leading-relaxed">{description}</p>}
        {done ? (
          <div className="mt-6 space-y-3">
            <p className="text-[16px] font-semibold text-slate-700">Thank you! Your download is ready.</p>
            {done.file_url && <a href={done.file_url} target="_blank" rel="noreferrer" className="block text-center text-white font-bold rounded-xl px-5 py-3.5" style={{ background: accent }}>Download now</a>}
            <p className="text-[13px] text-slate-400">We have also emailed you a copy. Check your junk folder if it doesn&apos;t arrive.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" className={inp} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="Email address" autoComplete="email" className={inp} />
            <input value={company} onChange={e => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
            <label className="flex items-start gap-2.5 text-[13px] text-slate-500 leading-snug">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4" />
              <span>Yes, send me helpful tips and offers from {brand || "us"}. You can unsubscribe at any time.</span>
            </label>
            {error && <p className="text-[13px] text-rose-600">{error}</p>}
            <button type="submit" disabled={busy} className="w-full text-white font-bold rounded-xl px-5 py-3.5 disabled:opacity-60" style={{ background: accent }}>{busy ? "Sending…" : "Get my free download"}</button>
            <p className="text-[11px] text-slate-400 text-center">We only use your email to send your download and, if you tick the box, our emails.</p>
          </form>
        )}
      </div>
    </div>
  );
}
