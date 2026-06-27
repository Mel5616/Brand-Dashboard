"use client";

import type { EdmCampaign } from "@/lib/db";

// Visual gallery of the email creatives (EDMs) that went out, synced from Klaviyo.
export function EdmGallery({ campaigns, brandFilter, monthKeys }: {
  campaigns: EdmCampaign[];
  brandFilter: number | "all";
  monthKeys: string[];
}) {
  const inFy = (c: EdmCampaign) => !c.month_key || monthKeys.includes(c.month_key);
  const rows = campaigns
    .filter(c => (brandFilter === "all" || c.brand_id === brandFilter) && inFy(c))
    .slice(0, 24);

  if (!rows.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-500 font-medium">No email creatives yet</p>
        <p className="text-xs text-gray-400 mt-1">Campaign visuals appear here once the Klaviyo campaigns sync has run. Run <code className="bg-gray-50 px-1 rounded">supabase/add_edm_campaigns.sql</code> first, then the sync.</p>
      </div>
    );
  }

  const dateOf = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Email creative · sent campaigns</h3>
      <p className="text-xs text-gray-400 mb-4">The EDMs that went out, newest first</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {rows.map(c => {
          const card = (
            <>
              <div className="aspect-[3/4] bg-slate-100 overflow-hidden">
                {c.image_url
                  ? <img src={c.image_url} alt={c.subject ?? c.name ?? "EDM"} className="w-full h-full object-cover object-top" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">no image</div>}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-slate-700 leading-snug line-clamp-2" title={c.subject ?? ""}>{c.subject || c.name || "Campaign"}</p>
                <p className="text-[10px] text-gray-400 mt-1">{dateOf(c.sent_at)}</p>
              </div>
            </>
          );
          return c.web_url
            ? <a key={c.campaign_id} href={c.web_url} target="_blank" rel="noopener noreferrer" className="block border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow">{card}</a>
            : <div key={c.campaign_id} className="border border-gray-100 rounded-xl overflow-hidden">{card}</div>;
        })}
      </div>
    </div>
  );
}
