"use client";

import { useEffect, useState } from "react";
import { RequestFormPicker, TYPE_META, type ReqType } from "@/components/salesRequestForms";
import { GUIDELINE_SECTIONS, FilecampCard } from "@/components/salesHubGuidelines";

// Public, no-login Sales Hub intake for the sales team, share this link
// directly (optionally with ?k=<SALES_REQUEST_KEY> if one is configured).
// Same table, same SLA/notification logic as the dashboard's Sales Hub tab;
// see src/lib/salesRequests.ts and src/app/api/public-sales-request/route.ts.

// The link carries the access key (?k=...), remembered per browser so a
// bookmark made after the first visit keeps working, same pattern as
// /log-gift (src/lib/giftKey.ts).
function requestKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) { localStorage.setItem("salesRequestKey", fromUrl); return fromUrl; }
    return localStorage.getItem("salesRequestKey") || "";
  } catch { return ""; }
}

export default function RequestPage() {
  const [brands, setBrands] = useState<{ name: string }[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ReqType>("artwork");
  const [done, setDoneId] = useState<string | null>(null);
  const key = requestKey();
  const headers: Record<string, string> = key ? { "x-sales-key": key } : {};

  useEffect(() => {
    fetch("/api/public-sales-request", { headers }).then(r => {
      if (r.status === 403) { setNoKey(true); return { ok: false }; }
      return r.json();
    }).then((d: any) => { setNeedsSetup(!!d.needsSetup); setBrands(d.brands ?? []); }).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><p className="text-sm text-gray-400">Loading…</p></div>;

  if (noKey) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <p className="text-lg font-semibold text-gray-800">This link needs its access key</p>
        <p className="text-sm text-gray-400 mt-1">You may have an old bookmark. Ask Mel for the current Sales Hub request link and open it once, after that your bookmark will work again.</p>
      </div>
    </div>
  );

  if (needsSetup) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-md text-center">
        <p className="text-gray-700 font-medium">Not set up yet</p>
        <p className="text-sm text-gray-400 mt-1">Ask the admin to finish Sales Hub setup.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <p className="text-lg font-semibold text-gray-800">Request sent</p>
        <p className="text-sm text-gray-400 mt-1">Marketing has been notified. You'll get an email when the status changes.</p>
        <button onClick={() => setDoneId(null)} className="mt-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-5 py-2.5">Submit another request</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Ask Marketing</h1>
          <p className="text-sm text-gray-400 mt-0.5">Request artwork, swatches, a Tune-Up Day or product, no dashboard login needed.</p>
        </div>

        <FilecampCard />

        <RequestFormPicker type={type} setType={setType} brands={brands} endpoint="/api/public-sales-request" uploadEndpoint="/api/sales-requests/upload" extraHeaders={headers} showIdentityFields onCreated={setDoneId} />

        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <summary className="text-sm font-bold text-slate-700 cursor-pointer">Rules for {TYPE_META[type].label.toLowerCase()}</summary>
          <div className="mt-3 prose-sm max-w-none text-slate-700 text-sm">
            {GUIDELINE_SECTIONS.find(g => g.id === TYPE_META[type].guide)?.body}
          </div>
        </details>
      </div>
    </div>
  );
}
