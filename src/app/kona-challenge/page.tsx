"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// Public Kona Challenge entry form. Each store's stand-alone sign has its
// own QR code pointing here with ?store=<slug> baked in, so the store is
// read straight off the URL rather than asked in the form — a rep can't
// miscount entries and an entrant can't accidentally pick the wrong store.
const STORES: Record<string, string> = {
  "baby-village": "Baby Village",
  "baby-kingdom": "Baby Kingdom",
  "babyroad": "BabyRoad",
  "whole-bubs": "Whole Bubs",
  "coolkidz-hq": "Coolkidz Head Office",
  "tradeshow": "Tradeshow",
};

const inp = "w-full text-base border border-gray-200 rounded-xl px-4 py-3.5 min-h-[52px] focus:outline-none focus:ring-2 focus:ring-[#9D8DF1] focus:border-[#9D8DF1]";
const lbl = "text-[13px] font-bold text-slate-600 block mb-1.5";

function KonaChallengeForm() {
  const params = useSearchParams();
  const storeSlug = params.get("store") || "";
  const storeName = STORES[storeSlug];

  const [store, setStore] = useState(storeSlug && storeName ? storeSlug : "");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [foldTime, setFoldTime] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  async function submit() {
    setErr("");
    if (!store) { setErr("Please select which store you're entering from."); return; }
    if (!name.trim()) { setErr("Your name is required."); return; }
    if (!emailRe.test(email.trim())) { setErr("A valid email is required — that's how we'll contact you if you win."); return; }
    if (!ack) { setErr("Please confirm you've posted your fold video and tagged @uppababy_australia with #KonaChallenge."); return; }
    setBusy(true);
    const res = await fetch("/api/public-kona-challenge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store, name: name.trim(), email: email.trim(), mobile: mobile.trim() || undefined,
        instagram_handle: handle.trim() || undefined, fold_time_seconds: foldTime || undefined,
      }),
    }).then(r => r.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!res.ok) { setErr(res.needsSetup ? "This competition isn't quite ready yet — please try again shortly, or ask a staff member." : "Couldn't submit — please try again."); return; }
    setDone(true);
  }

  if (done) return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F0FB] to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <div className="text-4xl mb-2">🎉</div>
        <p className="text-lg font-extrabold text-slate-800">You&apos;re entered!</p>
        <p className="text-sm text-gray-500 mt-2">Make sure your fold video is posted on Instagram tagging @uppababy_australia with #KonaChallenge — that&apos;s how we judge the fastest fold. Good luck!</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F0FB] to-white p-4">
      <div className="max-w-md mx-auto pt-8 pb-14">
        <div className="text-center mb-6">
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#9D8DF1] uppercase">UPPAbaby Kona</div>
          <h1 className="text-3xl font-extrabold text-slate-800 mt-1">The Kona Challenge</h1>
          <p className="text-sm text-gray-500 mt-2">Fold it fastest, post it, and you could win your money back.</p>
          {storeName && <div className="inline-block mt-3 text-[13px] font-bold text-[#6B54D6] bg-[#F3F0FB] rounded-full px-4 py-1.5">Entering from {storeName}</div>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          {!storeName && (
            <div>
              <span className={lbl}>Store *</span>
              <select className={inp} value={store} onChange={e => setStore(e.target.value)}>
                <option value="">Select…</option>
                {Object.entries(STORES).map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </div>
          )}
          <div>
            <span className={lbl}>Your name *</span>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <span className={lbl}>Email *</span>
            <input type="email" className={inp} placeholder="So we can contact you if you win" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <span className={lbl}>Instagram handle (where you posted your fold)</span>
            <input className={inp} placeholder="@yourhandle" value={handle} onChange={e => setHandle(e.target.value)} />
          </div>
          <div>
            <span className={lbl}>Mobile number (optional)</span>
            <input type="tel" className={inp} value={mobile} onChange={e => setMobile(e.target.value)} />
          </div>
          <div>
            <span className={lbl}>Your fold time, if you timed it (seconds)</span>
            <input type="number" inputMode="decimal" className={inp} value={foldTime} onChange={e => setFoldTime(e.target.value)} />
          </div>
          <label className="flex items-start gap-2.5 text-[13px] text-slate-600 pt-1 cursor-pointer">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 w-[18px] h-[18px] accent-[#6B54D6] shrink-0" />
            <span>I&apos;ve posted my fold video on Instagram, tagging <strong>@uppababy_australia</strong> with <strong>#KonaChallenge</strong>. One entry per person.</span>
          </label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button disabled={busy} onClick={submit} className="w-full text-[15px] font-bold text-white bg-[#6B54D6] hover:bg-[#5A45C2] disabled:opacity-40 rounded-2xl px-6 py-4 mt-2 shadow-[0_8px_20px_-6px_rgba(107,84,214,0.5)]">{busy ? "Entering…" : "Enter the challenge"}</button>
        </div>
      </div>
    </div>
  );
}

export default function KonaChallengePage() {
  return <Suspense fallback={null}><KonaChallengeForm /></Suspense>;
}
