"use client";

import { useEffect, useRef, useState } from "react";
import { GiftCatalogPicker, giftItemsSummary, emptyGiftItem, type GiftItem } from "@/components/GiftCatalogPicker";

// Public, no-login form — share this link (optionally with
// ?k=<GIVEAWAY_REQUEST_KEY>) with anyone committing free product to a
// giveaway or competition. Submissions land in the dashboard's Giveaways
// tab as "proposed" — nothing is live/approved until Mel signs off. Same
// shared-key pattern as /website-request (src/lib/websiteRequestKey.ts).
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "EDM", "Website", "In-store", "Other"];

function requestKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) { localStorage.setItem("giveawayRequestKey", fromUrl); return fromUrl; }
    return localStorage.getItem("giveawayRequestKey") || "";
  } catch { return ""; }
}

const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const lbl = "text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1";

export default function GiveawayRequestPage() {
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const key = requestKey();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(key ? { "x-giveaway-key": key } : {}) };

  const empty = { brand_id: "", title: "", mechanic: "", retail_value: "", platform: "Instagram", entry_link: "", start_date: "", end_date: "", submitter_name: "", submitter_email: "" };
  const [f, setF] = useState(empty);
  const [giftItems, setGiftItems] = useState<GiftItem[]>([{ ...emptyGiftItem }]);
  const selectedBrandName = brands.find(b => String(b.id) === f.brand_id)?.name;

  useEffect(() => {
    fetch("/api/public-giveaway-request", { headers: key ? { "x-giveaway-key": key } : {} }).then(r => {
      if (r.status === 403) { setNoKey(true); return { ok: false }; }
      return r.json();
    }).then((d: any) => { setNeedsSetup(!!d.needsSetup); setBrands(d.brands ?? []); }).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setErr("");
    const items = giftItemsSummary(giftItems);
    if (!f.brand_id || !f.title.trim() || !items || !f.submitter_name.trim() || !f.submitter_email.trim()) {
      setErr("Brand, campaign name, at least one product, your name and email are required."); return;
    }
    setBusy(true);
    const res = await fetch("/api/public-giveaway-request", { method: "POST", headers, body: JSON.stringify({ ...f, items, gift_items: giftItems }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) setDone(true); else setErr(res?.error || "Something went wrong — try again.");
  }

  if (loading) return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><p className="text-sm text-slate-400">Loading…</p></main>;

  if (noKey) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-lg font-semibold text-slate-800">This link needs its access key</p>
        <p className="text-sm text-slate-400 mt-1">You may have an old bookmark — ask Mel for the current giveaway request link.</p>
      </div>
    </main>
  );

  if (needsSetup) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-md text-center">
        <p className="text-slate-700 font-medium">Not set up yet</p>
        <p className="text-sm text-slate-400 mt-1">Ask the admin to finish setting this up.</p>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        {done ? (
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800 mb-2">Submitted for approval</p>
            <p className="text-sm text-slate-500 mb-6">Mel has been notified — don&apos;t commit any product or post it live until it&apos;s approved.</p>
            <button onClick={() => { setF(empty); setGiftItems([{ ...emptyGiftItem }]); setDone(false); }} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2.5 hover:bg-emerald-700">
              Submit another
            </button>
          </div>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-1">Giveaway / competition commitment</p>
            <p className="text-sm text-slate-500 mb-6">Committing free product to a giveaway or competition? Submit it here first — it needs Mel&apos;s approval before it goes live.</p>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Brand *</label>
                <select value={f.brand_id} onChange={e => setF({ ...f, brand_id: e.target.value })} className={inp}>
                  <option value="">Select a brand…</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Campaign name *</label>
                <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. BabyLove Giveaway" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Start date</label>
                  <input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>End date</label>
                  <input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} className={inp} />
                </div>
              </div>
              <div>
                <label className={lbl}>Platform</label>
                <select value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })} className={inp}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Mechanic — how does someone enter?</label>
                <textarea value={f.mechanic} onChange={e => setF({ ...f, mechanic: e.target.value })} rows={2} placeholder="e.g. Follow + tag a friend, purchase required, comment to enter" className={inp} />
              </div>
              <GiftCatalogPicker items={giftItems} onChange={setGiftItems} brandName={selectedBrandName} endpoint="/api/public-gift-catalog" />
              <div>
                <label className={lbl}>Retail value ($)</label>
                <input type="number" inputMode="decimal" step="0.01" value={f.retail_value} onChange={e => setF({ ...f, retail_value: e.target.value })} placeholder="0.00" className={inp} />
              </div>
              <div>
                <label className={lbl}>Entry link (if already live)</label>
                <input value={f.entry_link} onChange={e => setF({ ...f, entry_link: e.target.value })} placeholder="https://…" className={inp} />
              </div>
              <div>
                <label className={lbl}>Your name *</label>
                <input value={f.submitter_name} onChange={e => setF({ ...f, submitter_name: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Your email *</label>
                <input type="email" value={f.submitter_email} onChange={e => setF({ ...f, submitter_email: e.target.value })} className={inp} />
              </div>
              {err && <p className="text-sm text-rose-500">{err}</p>}
              <button onClick={submit} disabled={busy} className="w-full text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-3 hover:bg-emerald-700 disabled:opacity-60">
                {busy ? "Sending…" : "Submit for approval"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
