import { renderAgreementHtml } from "@/lib/agreementTemplate";
import { AgreementSignForm } from "./AgreementSignForm";

// PUBLIC influencer signing page — tokenised, no login. Invalid/signed/void
// tokens get a polite dead end.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AGREEMENT_CSS = `
.agreement h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 2px; }
.agreement h2 { font-size: 15px; font-weight: 700; color: #475569; margin: 0 0 16px; }
.agreement h3 { font-size: 13.5px; font-weight: 700; color: #0f172a; margin: 20px 0 6px; }
.agreement p { font-size: 13.5px; line-height: 1.7; color: #334155; margin: 0 0 8px; }
.agreement ul { font-size: 13.5px; line-height: 1.7; color: #334155; margin: 0 0 8px; padding-left: 20px; }
.agreement li { margin-bottom: 2px; }
.agreement strong { color: #0f172a; }
.agreement table.sign-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.agreement table.sign-table th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase; }
.agreement table.sign-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; color: #334155; }
`;

function DeadEnd({ msg }: { msg: string }) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-2xl mb-2">🤝</p>
        <h1 className="text-lg font-bold text-slate-800">{msg}</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">If you were expecting to sign a collaboration agreement, contact <a className="text-emerald-600 font-semibold" href="mailto:influencers@coolkidz.com.au">influencers@coolkidz.com.au</a> and we&apos;ll send a fresh link.</p>
      </div>
    </main>
  );
}

export default async function AgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return <DeadEnd msg="This link isn't valid" />;
  const res = await fetch(`${sbUrl}/rest/v1/influencer_agreements?token=eq.${token}&select=*,brands(name),influencers(*),influencer_agreement_products(*),influencer_agreement_deliverables(*)&limit=1`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const a = (await res.json().catch(() => []))[0];
  if (!a) return <DeadEnd msg="This link isn't valid" />;
  if (a.status === "signed") return <DeadEnd msg="This agreement has already been signed" />;
  if (a.status === "terminated") return <DeadEnd msg="This agreement is no longer active" />;
  const preview = a.status === "draft"; // admin previewing before the link is sent
  if (!preview && a.status !== "sent") return <DeadEnd msg="This link isn't active" />;

  const i = a.influencers;
  const html = a.rendered_html || renderAgreementHtml({
    agreement_type: a.agreement_type, agreement_date: a.agreement_date,
    influencer_name: i.full_name, influencer_abn: i.abn, influencer_handle: i.instagram_handle,
    influencer_address: [i.address_line1, i.address_line2, i.suburb, i.state, i.postcode].filter(Boolean).join(", ") || "—",
    brand_display_name: a.brands.name, brand_instagram_handle: null,
    content_due_days: a.content_due_days, minimum_live_period_months: a.minimum_live_period_months,
    exclusivity_applies: a.exclusivity_applies, exclusivity_category: a.exclusivity_category, exclusivity_months: a.exclusivity_months,
    usage_term_months: a.usage_term_months, usage_paid_media: a.usage_paid_media, usage_retail_partners: a.usage_retail_partners, usage_print: a.usage_print,
    discount_code: a.discount_code, discount_start: a.discount_start, discount_end: a.discount_end,
    representative_name: a.representative_name, representative_position: a.representative_position,
    products: a.influencer_agreement_products ?? [], deliverables: a.influencer_agreement_deliverables ?? [],
  });

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <style dangerouslySetInnerHTML={{ __html: AGREEMENT_CSS }} />
      <div className="max-w-2xl mx-auto">
        {preview && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[13px] text-amber-800 font-semibold">
            👁 Preview — this is exactly what {i.full_name} will see. The link hasn&apos;t been emailed yet; use &quot;Send&quot; on the dashboard when you&apos;re happy.
          </div>
        )}
        <div className="bg-[#132741] rounded-t-2xl px-7 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/coolkidz-logo.png" alt="Coolkidz Australia" className="h-8 w-auto brightness-0 invert" />
          <h1 className="text-white text-xl font-bold mt-2.5">Collaboration agreement</h1>
          <p className="text-white/70 text-sm mt-0.5">{a.reference}</p>
        </div>
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-100 shadow-sm p-7">
          {/* eslint-disable-next-line react/no-danger */}
          <div className="agreement" dangerouslySetInnerHTML={{ __html: html }} />
          <AgreementSignForm token={token} influencerName={i.full_name} preview={preview} />
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside, Victoria 3195 · influencers@coolkidz.com.au</p>
      </div>
    </main>
  );
}
