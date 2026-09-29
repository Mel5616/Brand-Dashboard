"use client";

import { useEffect, useState } from "react";
import { GiftCatalogPicker, giftItemsSummary, emptyGiftItem, type GiftItem } from "@/components/GiftCatalogPicker";

// Public, no-login form — share this link (optionally with
// ?k=<PRODUCT_REQUEST_KEY>) with anyone who needs free product/samples sent
// out. Submissions land in the dashboard's Product Requests tab as
// "proposed" — nothing is picked or shipped until Mel approves it. Same
// shared-key pattern as /website-request and /giveaway-request.
function requestKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) { localStorage.setItem("productRequestKey", fromUrl); return fromUrl; }
    return localStorage.getItem("productRequestKey") || "";
  } catch { return ""; }
}

const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const lbl = "text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1";

export default function ProductRequestPage() {
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const key = requestKey();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(key ? { "x-product-key": key } : {}) };

  const empty = { brand_id: "", reason: "", ship_to_name: "", ship_to_address: "", customer_name: "", customer_email: "", customer_phone: "", is_loan: false, requester_name: "", requester_email: "" };
  const [f, setF] = useState(empty);
  const [giftItems, setGiftItems] = useState<GiftItem[]>([{ ...emptyGiftItem }]);
  const selectedBrandName = brands.find(b => String(b.id) === f.brand_id)?.name;

  useEffect(() => {
    fetch("/api/public-product-request", { headers: key ? { "x-product-key": key } : {} }).then(r => {
      if (r.status === 403) { setNoKey(true); return { ok: false }; }
      return r.json();
    }).then((d: any) => { setNeedsSetup(!!d.needsSetup); setBrands(d.brands ?? []); }).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setErr("");
    const products = giftItemsSummary(giftItems);
    if (!f.brand_id || !f.reason.trim() || !products || !f.requester_name.trim() || !f.requester_email.trim()) {
      setErr("Brand, reason, at least one product, your name and email are required."); return;
    }
    setBusy(true);
    const res = await fetch("/api/public-product-request", { method: "POST", headers, body: JSON.stringify({ ...f, products, gift_items: giftItems }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) setDone(true); else setErr(res?.error || "Something went wrong — try again.");
  }

  if (loading) return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><p className="text-sm text-slate-400">Loading…</p></main>;

  if (noKey) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-lg font-semibold text-slate-800">This link needs its access key</p>
        <p className="text-sm text-slate-400 mt-1">You may have an old bookmark — ask Mel for the current product request link.</p>
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
            <p className="text-sm text-slate-500 mb-6">Mel has been notified — don&apos;t pick or ship anything until it&apos;s approved.</p>
            <button onClick={() => { setF(empty); setGiftItems([{ ...emptyGiftItem }]); setDone(false); }} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2.5 hover:bg-emerald-700">
              Submit another
            </button>
          </div>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-1">Free product / sample request</p>
            <p className="text-sm text-slate-500 mb-6">Need product sent out for free — a sample, a replacement, a photoshoot item? Submit it here first — it needs Mel&apos;s approval before anything is picked or shipped.</p>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Brand *</label>
                <select value={f.brand_id} onChange={e => setF({ ...f, brand_id: e.target.value })} className={inp}>
                  <option value="">Select a brand…</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Reason *</label>
                <input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="e.g. Photoshoot sample, warranty replacement, team sample" className={inp} />
              </div>
              <GiftCatalogPicker items={giftItems} onChange={setGiftItems} brandName={selectedBrandName} endpoint="/api/public-gift-catalog" />
              <div>
                <label className={lbl}>Ship to (name)</label>
                <input value={f.ship_to_name} onChange={e => setF({ ...f, ship_to_name: e.target.value })} placeholder="Leave blank if it's for the office/team" className={inp} />
              </div>
              <div>
                <label className={lbl}>Ship to (address)</label>
                <textarea value={f.ship_to_address} onChange={e => setF({ ...f, ship_to_address: e.target.value })} rows={2} className={inp} />
              </div>
              <div>
                <label className={lbl}>Customer name</label>
                <input value={f.customer_name} onChange={e => setF({ ...f, customer_name: e.target.value })} placeholder="Leave blank if this isn't for a specific customer" className={inp} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Customer email</label>
                  <input type="email" value={f.customer_email} onChange={e => setF({ ...f, customer_email: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Customer phone</label>
                  <input type="tel" value={f.customer_phone} onChange={e => setF({ ...f, customer_phone: e.target.value })} className={inp} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={f.is_loan} onChange={e => setF({ ...f, is_loan: e.target.checked })} className="rounded border-gray-300" />
                This is a loan — it should come back to stock, not be gifted
              </label>
              <div>
                <label className={lbl}>Your name *</label>
                <input value={f.requester_name} onChange={e => setF({ ...f, requester_name: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Your email *</label>
                <input type="email" value={f.requester_email} onChange={e => setF({ ...f, requester_email: e.target.value })} className={inp} />
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
