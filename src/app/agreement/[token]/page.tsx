import type { Metadata } from "next";
import { renderAgreementHtml } from "@/lib/agreementTemplate";
import { BRAND_LOGOS_WHITE } from "@/lib/brandLogos";
import { AgreementSignForm } from "./AgreementSignForm";

// PUBLIC influencer signing page — tokenised, no login. Invalid/signed/void
// tokens get a polite dead end. The token stops guessing, not forwarding or
// scraping — this page carries a private residential address pre-signing,
// so it's kept out of search results as defence in depth.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AGREEMENT_CSS = `
.agreement { font-size: 13.5px; }
.agreement .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #1E9DC2; margin: 0 0 6px; }
.agreement h1 { font-size: 21px; font-weight: 800; color: #0f172a; margin: 0 0 14px; letter-spacing: -0.01em; }
.agreement h3 { font-size: 13.5px; font-weight: 700; color: #0f172a; margin: 24px 0 8px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
.agreement h3:first-of-type { padding-top: 0; border-top: 0; margin-top: 18px; }
.agreement p { font-size: 13.5px; line-height: 1.7; color: #334155; margin: 0 0 8px; }
.agreement ul { font-size: 13.5px; line-height: 1.7; color: #334155; margin: 0 0 8px; padding-left: 1.3em; list-style: none; }
.agreement li { margin-bottom: 4px; position: relative; }
.agreement li::before { content: "•"; color: #1E9DC2; position: absolute; left: -1.1em; font-weight: 700; }
.agreement strong { color: #0f172a; font-weight: 700; }
.agreement .callout { background: #EAF4F8; border-left: 3px solid #1E9DC2; border-radius: 6px; padding: 9px 14px; margin: 4px 0 12px; font-size: 13.5px; color: #152A3B; }
.agreement table.sign-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
.agreement table.sign-table th { text-align: left; padding: 8px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; }
.agreement table.sign-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155; }
.agreement .doc-footer { margin-top: 22px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 10.5px; line-height: 1.7; color: #94a3b8; }
`;

function DeadEnd({ msg }: { msg: string }) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-2xl mb-2">🤝</p>
        <h1 className="text-lg font-bold text-slate-800">{msg}</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">If you were expecting to sign a collaboration agreement, contact <a className="text-emerald-600 font-semibold" href="mailto:partnerships@coolkidz.com.au">partnerships@coolkidz.com.au</a> and we&apos;ll send a fresh link.</p>
      </div>
    </main>
  );
}

export default async function AgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return <DeadEnd msg="This link isn't valid" />;
  const res = await fetch(`${sbUrl}/rest/v1/influencer_agreements?token=eq.${token}&select=*,brands(name),influencers:agreement_influencers(*),influencer_agreement_products(*),influencer_agreement_deliverables(*)&limit=1`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const a = (await res.json().catch(() => []))[0];
  if (!a) return <DeadEnd msg="This link isn't valid" />;
  if (a.status === "signed") return <DeadEnd msg="This agreement has already been signed" />;
  if (a.status === "terminated") return <DeadEnd msg="This agreement is no longer active" />;
  const preview = a.status === "draft"; // admin previewing before the link is sent
  if (!preview && a.status !== "sent") return <DeadEnd msg="This link isn't active" />;

  const i = a.influencers;
  let html = a.rendered_html;
  if (!html) {
    // Draft preview, rendered live rather than snapshotted — needs the
    // brand's Instagram handle for the "tag @handle" line, which only
    // lives in the config table, not on the agreement row.
    const cfgRes = await fetch(`${sbUrl}/rest/v1/influencer_agreement_brand_config?brand_id=eq.${a.brand_id}&limit=1`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
    });
    const cfg = (await cfgRes.json().catch(() => []))[0];
    html = renderAgreementHtml({
      reference: a.reference,
      agreement_type: a.agreement_type, agreement_date: a.agreement_date,
      influencer_name: i.full_name, influencer_abn: i.abn, influencer_handle: i.instagram_handle,
      influencer_address: [i.address_line1, i.address_line2, i.suburb, i.state, i.postcode].filter(Boolean).join(", ") || "—",
      brand_display_name: a.brands.name, brand_instagram_handle: cfg?.instagram_handle ?? null,
      content_due_days: a.content_due_days, minimum_live_period_months: a.minimum_live_period_months,
      exclusivity_applies: a.exclusivity_applies, exclusivity_category: a.exclusivity_category, exclusivity_months: a.exclusivity_months,
      usage_term_months: a.usage_term_months, usage_paid_media: a.usage_paid_media, usage_retail_partners: a.usage_retail_partners, usage_print: a.usage_print,
      discount_code: a.discount_code, discount_start: a.discount_start, discount_end: a.discount_end,
      representative_name: a.representative_name, representative_position: a.representative_position,
      products: a.influencer_agreement_products ?? [], deliverables: a.influencer_agreement_deliverables ?? [],
    });
  }
  // Coolkidz's own logo isn't in the white set (it's handled with a filter
  // wherever it appears on a dark background); every brand logo is a real
  // white-on-transparent asset, so it sits directly on the navy header.
  const isCoolkidz = a.brand_id === 9;
  const brandLogo = isCoolkidz ? "/logos/coolkidz-logo.png" : (BRAND_LOGOS_WHITE[a.brand_id] || "/logos/coolkidz-logo.png");

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <style dangerouslySetInnerHTML={{ __html: AGREEMENT_CSS }} />
      <div className="max-w-2xl mx-auto">
        {preview && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[13px] text-amber-800 font-semibold">
            👁 Preview — this is exactly what {i.full_name.split(" ")[0]} will see. The link hasn&apos;t been emailed yet; use &quot;Send&quot; on the dashboard when you&apos;re happy.
          </div>
        )}
        <div className="bg-[#132741] rounded-t-2xl px-7 py-6 flex items-center justify-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brandLogo} alt={a.brands.name} className={`h-14 w-auto max-w-[220px] object-contain shrink-0 ${isCoolkidz ? "brightness-0 invert" : ""}`} />
        </div>
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-100 shadow-sm p-7">
          {/* eslint-disable-next-line react/no-danger */}
          <div className="agreement" dangerouslySetInnerHTML={{ __html: html }} />
          <AgreementSignForm token={token} influencerName={i.full_name} preview={preview} />
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside, Victoria 3195 · partnerships@coolkidz.com.au</p>
      </div>
    </main>
  );
}
