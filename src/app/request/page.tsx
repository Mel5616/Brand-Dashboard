"use client";

import { useEffect, useState } from "react";
import { RequestFormPicker, TYPE_META, baloo, body, type ReqType } from "@/components/salesRequestForms";
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

  if (loading) return <div className={`min-h-screen bg-[#F5FAFC] flex items-center justify-center p-4 ${body}`}><p className="text-sm text-gray-400">Loading…</p></div>;

  if (noKey) return (
    <div className={`min-h-screen bg-[#F5FAFC] flex items-center justify-center p-4 ${body}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <p className={`text-lg font-bold text-gray-800 ${baloo}`}>This link needs its access key</p>
        <p className="text-sm text-gray-400 mt-1">You may have an old bookmark. Ask Mel for the current Sales Hub request link and open it once, after that your bookmark will work again.</p>
      </div>
    </div>
  );

  if (needsSetup) return (
    <div className={`min-h-screen bg-[#F5FAFC] flex items-center justify-center p-4 ${body}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-md text-center">
        <p className="text-gray-700 font-medium">Not set up yet</p>
        <p className="text-sm text-gray-400 mt-1">Ask the admin to finish Sales Hub setup.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className={`min-h-screen bg-[#F5FAFC] flex items-center justify-center p-4 ${body}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <div className="text-4xl mb-2">✅</div>
        <p className={`text-lg font-bold text-gray-800 ${baloo}`}>Request sent</p>
        <p className="text-sm text-gray-400 mt-1">Marketing has been notified. You&apos;ll get an email when the status changes.</p>
        <button onClick={() => setDoneId(null)} className="mt-5 text-[14.5px] font-bold text-white bg-[#FF6B4A] hover:bg-[#E85536] rounded-2xl px-6 py-3.5">Submit another request</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#F5FAFC] pb-14 ${body}`}>
      <div className="bg-gradient-to-br from-[#3EC0E4] to-[#1E9DC2] px-5 pt-8 pb-10 sm:px-8">
        <div className="max-w-3xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/coolkidz-logo.png" alt="Coolkidz" className="h-6 mb-4 brightness-0 invert" />
          <h1 className={`text-2xl sm:text-3xl font-extrabold text-white ${baloo}`}>Ask Marketing</h1>
          <p className="text-white/85 text-sm mt-1 max-w-md">Artwork, swatches, a Tune-Up Day or product, no dashboard login needed.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-0 -mt-5 space-y-4">
        <RequestFormPicker type={type} setType={setType} brands={brands} endpoint="/api/public-sales-request" uploadEndpoint="/api/sales-requests/upload" extraHeaders={headers} showIdentityFields onCreated={setDoneId} />

        <FilecampCard />

        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <summary className={`text-sm font-bold text-slate-700 cursor-pointer ${baloo}`}>Rules for {TYPE_META[type].label.toLowerCase()}</summary>
          <div className="mt-3 prose-sm max-w-none text-slate-700 text-sm">
            {GUIDELINE_SECTIONS.find(g => g.id === TYPE_META[type].guide)?.body}
          </div>
        </details>
      </div>
    </div>
  );
}
