import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { renderAgreementHtml, validateForSend, ENTITY, TEMPLATE_VERSION, AGREEMENT_TYPES } from "@/lib/agreementTemplate";
import { sendMail, shell } from "@/lib/agreementMail";

// Influencer Agreements — admin CRUD + send. Influencers sign via the public
// /agreement/[token] page. Coolkidz Australia Pty Ltd is the contracting
// party on every agreement, never the brand (see agreementTemplate.ts).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const BASE = "https://marketing.coolkidz.com.au";
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
const canUse = (acc: { role: string | null; allowedTabs: string[] }) => acc.role === "admin" || (!!acc.role && acc.allowedTabs.includes("influencer-agreements"));

function signingEmail(a: { reference: string; brand_name: string; influencer_name: string; token: string }) {
  return shell(`
    <p style="font-size:15px">Hi ${a.influencer_name.split(" ")[0]},</p>
    <p style="font-size:14px;line-height:1.7">Thanks for collaborating with us on <strong>${a.brand_name}</strong>! Attached is your collaboration agreement (reference <strong>${a.reference}</strong>) — it covers the products, what we're asking you to post, and the usual terms. It takes about two minutes to read and sign.</p>
    <p style="text-align:center;margin:26px 0">
      <a href="${BASE}/agreement/${a.token}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 34px;border-radius:10px">Review &amp; sign the agreement</a>
    </p>
    <p style="font-size:14px;line-height:1.7">Once you've signed, a copy will be emailed to you straight away, and we'll get your products moving. If anything looks off before you sign, just reply to this email.</p>
    <p style="font-size:14px;line-height:1.7;margin-bottom:4px">Thanks,<br><strong>The Coolkidz Australia Team</strong></p>
    <p style="font-size:12.5px;color:#64748b;margin-top:18px">This link is unique to you — please don't forward it.</p>`);
}

async function nextReference(brandCode: string): Promise<string> {
  const year = new Date().getFullYear();
  const res = await fetch(`${sbUrl}/rest/v1/influencer_agreements?reference=like.${brandCode}-${year}-*&select=reference&order=reference.desc&limit=1`, { headers: h(), cache: "no-store" });
  const rows = await res.json().catch(() => []);
  const last = rows[0]?.reference as string | undefined;
  const n = last ? Number(last.split("-").pop()) + 1 : 1;
  return `${brandCode}-${year}-${String(n).padStart(4, "0")}`;
}

export async function GET() {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const select = "select=*,brands(id,name),influencers:agreement_influencers(*),influencer_agreement_products(*),influencer_agreement_deliverables(*)";
  const [agrRes, infRes, overdueRes, exclRes, roiRes, cfgRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/influencer_agreements?${select}&order=created_at.desc&limit=1000`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/agreement_influencers?select=*&order=full_name.asc&limit=2000`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/v_overdue_deliverables?select=*`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/v_active_exclusivity?select=*`, { headers: h(), cache: "no-store" }),
    acc.role === "admin" ? fetch(`${sbUrl}/rest/v1/v_gifting_roi?select=*`, { headers: h(), cache: "no-store" }) : Promise.resolve(null),
    fetch(`${sbUrl}/rest/v1/influencer_agreement_brand_config?select=*`, { headers: h(), cache: "no-store" }),
  ]);
  const agrText = await agrRes.text();
  if (!agrRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(agrRes.status, agrText), agreements: [], influencers: [], overdue: [], exclusivity: [], roi: [], brandConfig: [] });
  return NextResponse.json({
    ok: true,
    agreements: JSON.parse(agrText || "[]"),
    influencers: await infRes.json().catch(() => []),
    overdue: await overdueRes.json().catch(() => []),
    exclusivity: await exclRes.json().catch(() => []),
    roi: roiRes ? await roiRes.json().catch(() => []) : [],
    brandConfig: await cfgRes.json().catch(() => []),
    entity: ENTITY, agreementTypes: AGREEMENT_TYPES,
  });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const brandId = Number(b.brand_id);
  if (!brandId) return NextResponse.json({ ok: false, error: "Brand required" }, { status: 400 });
  const infl = b.influencer || {};
  if (!String(infl.full_name || "").trim() || !String(infl.email || "").trim())
    return NextResponse.json({ ok: false, error: "Influencer name and email required" }, { status: 400 });

  // Brand config + name (for the reference number, template render and email).
  const [cfgRes, brandRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/influencer_agreement_brand_config?brand_id=eq.${brandId}&limit=1`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?id=eq.${brandId}&select=id,name&limit=1`, { headers: h(), cache: "no-store" }),
  ]);
  const cfg = (await cfgRes.json().catch(() => []))[0];
  const brand = (await brandRes.json().catch(() => []))[0];
  if (!brand) return NextResponse.json({ ok: false, error: "Unknown brand" }, { status: 400 });
  if (!cfg) return NextResponse.json({ ok: false, needsSetup: true, error: "Run supabase/add_influencer_agreements.sql first" }, { status: 500 });

  // Reuse the influencer by email if they already exist (case-insensitive);
  // otherwise create them. This is the whole point of the register.
  const findInfl = await fetch(`${sbUrl}/rest/v1/agreement_influencers?email=ilike.${encodeURIComponent(String(infl.email).trim())}&limit=1`, { headers: h(), cache: "no-store" });
  let influencerId = (await findInfl.json().catch(() => []))[0]?.id as string | undefined;
  const inflRow = {
    full_name: String(infl.full_name).trim().slice(0, 160),
    email: String(infl.email).trim().slice(0, 200),
    phone: infl.phone ? String(infl.phone).slice(0, 40) : null,
    instagram_handle: infl.instagram_handle ? String(infl.instagram_handle).replace(/^@/, "").slice(0, 60) : null,
    tiktok_handle: infl.tiktok_handle ? String(infl.tiktok_handle).replace(/^@/, "").slice(0, 60) : null,
    address_line1: infl.address_line1 ? String(infl.address_line1).slice(0, 200) : null,
    address_line2: infl.address_line2 ? String(infl.address_line2).slice(0, 200) : null,
    suburb: infl.suburb ? String(infl.suburb).slice(0, 100) : null,
    state: infl.state ? String(infl.state).slice(0, 10) : null,
    postcode: infl.postcode ? String(infl.postcode).slice(0, 10) : null,
    is_po_box: !!infl.is_po_box,
    abn: infl.abn ? String(infl.abn).slice(0, 30) : null,
  };
  if (influencerId) {
    await fetch(`${sbUrl}/rest/v1/agreement_influencers?id=eq.${influencerId}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(inflRow) });
  } else {
    const ins = await fetch(`${sbUrl}/rest/v1/agreement_influencers`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(inflRow) });
    const created = (await ins.json().catch(() => []))[0];
    if (!ins.ok || !created) return NextResponse.json({ ok: false, error: "Couldn't save the influencer" }, { status: 500 });
    influencerId = created.id;
  }

  // Also keep the Influencer Tracker roster in sync — one shared directory of
  // known influencers rather than two disconnected lists. Roster is keyed by
  // @handle, so this only fires when an Instagram handle is on file; other
  // fields are only sent if present so this never wipes tracker-only data
  // (e.g. followers, notes) the tracker itself has recorded.
  if (inflRow.instagram_handle) {
    const handle = "@" + inflRow.instagram_handle.replace(/^@+/, "");
    await fetch(`${sbUrl}/rest/v1/influencers?on_conflict=handle`, {
      method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ handle, name: inflRow.full_name, platform: "Instagram", contact: inflRow.email, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  const draft = !!b.draft;
  const agreementType = AGREEMENT_TYPES[b.agreement_type] ? b.agreement_type : "gifted_social";
  const agreementDate = b.agreement_date || new Date().toISOString().slice(0, 10);
  const exclusivityApplies = AGREEMENT_TYPES[agreementType].requiresExclusivity && b.exclusivity_applies !== false;
  const exclusivityMonths = Number(b.exclusivity_months) || 6;
  const exclusivityEnd = exclusivityApplies ? new Date(new Date(agreementDate).setMonth(new Date(agreementDate).getMonth() + exclusivityMonths)).toISOString().slice(0, 10) : null;
  const contentDueDays = Number(b.content_due_days) || 21;
  const contentDueDate = new Date(new Date(agreementDate).setDate(new Date(agreementDate).getDate() + contentDueDays)).toISOString().slice(0, 10);
  const exclusivityCategory = b.exclusivity_category ? String(b.exclusivity_category).slice(0, 200) : cfg.exclusivity_category;

  if (!draft) {
    const err = validateForSend({ agreement_type: agreementType, exclusivity_applies: exclusivityApplies, exclusivity_category: exclusivityCategory });
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const products = (Array.isArray(b.products) ? b.products : []).filter((p: any) => p?.product_name).map((p: any) => ({
    product_name: String(p.product_name).slice(0, 160), variant: p.variant ? String(p.variant).slice(0, 100) : null,
    quantity: Number(p.quantity) || 1, rrp: p.rrp != null && p.rrp !== "" ? Number(p.rrp) : null,
    cost_price: p.cost_price != null && p.cost_price !== "" ? Number(p.cost_price) : null,
  }));
  const deliverables = (Array.isArray(b.deliverables) ? b.deliverables : []).filter((d: any) => d?.deliverable_type).map((d: any) => ({
    deliverable_type: String(d.deliverable_type).slice(0, 80), platform: String(d.platform || "Instagram").slice(0, 40),
    quantity: Number(d.quantity) || 1, due_date: d.due_date || contentDueDate,
  }));

  const reference = await nextReference(cfg.code);
  const agreementRow = {
    reference, influencer_id: influencerId, brand_id: brandId, agreement_type: agreementType,
    template_version: TEMPLATE_VERSION, campaign_name: b.campaign_name ? String(b.campaign_name).slice(0, 160) : null,
    status: draft ? "draft" : "sent", agreement_date: agreementDate,
    content_due_days: contentDueDays, content_due_date: contentDueDate, minimum_live_period_months: Number(b.minimum_live_period_months) || 6,
    exclusivity_applies: exclusivityApplies, exclusivity_category: exclusivityCategory,
    exclusivity_months: exclusivityMonths, exclusivity_end_date: exclusivityEnd,
    usage_term_months: Number(b.usage_term_months) || 12, usage_paid_media: !!b.usage_paid_media,
    usage_retail_partners: b.usage_retail_partners !== false, usage_print: !!b.usage_print,
    discount_code: b.discount_code ? String(b.discount_code).slice(0, 40) : null,
    discount_start: b.discount_start || null, discount_end: b.discount_end || null,
    representative_name: b.representative_name ? String(b.representative_name).slice(0, 120) : null,
    representative_position: b.representative_position ? String(b.representative_position).slice(0, 120) : null,
    created_by: (acc.user as any)?.email ?? null,
    sent_at: draft ? null : new Date().toISOString(),
  };

  const insAgr = await fetch(`${sbUrl}/rest/v1/influencer_agreements`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(agreementRow) });
  const agrText = await insAgr.text();
  if (!insAgr.ok) return NextResponse.json({ ok: false, needsSetup: missing(insAgr.status, agrText), error: agrText.slice(0, 300) }, { status: 500 });
  const agreement = JSON.parse(agrText)[0];

  if (products.length) await fetch(`${sbUrl}/rest/v1/influencer_agreement_products`, { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(products.map((p: any) => ({ ...p, agreement_id: agreement.id }))) });
  if (deliverables.length) await fetch(`${sbUrl}/rest/v1/influencer_agreement_deliverables`, { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(deliverables.map((d: any) => ({ ...d, agreement_id: agreement.id }))) });

  if (draft) return NextResponse.json({ ok: true, agreement, emailed: false });

  // Snapshot the exact contract text the influencer will see and sign —
  // never regenerated from a possibly-later-edited template.
  const html = renderAgreementHtml({
    reference,
    agreement_type: agreementType, agreement_date: agreementDate,
    influencer_name: inflRow.full_name, influencer_abn: inflRow.abn, influencer_handle: inflRow.instagram_handle,
    influencer_address: [inflRow.address_line1, inflRow.address_line2, inflRow.suburb, inflRow.state, inflRow.postcode].filter(Boolean).join(", ") || "—",
    brand_display_name: brand.name, brand_instagram_handle: cfg.instagram_handle,
    content_due_days: contentDueDays, minimum_live_period_months: agreementRow.minimum_live_period_months,
    exclusivity_applies: exclusivityApplies, exclusivity_category: agreementRow.exclusivity_category, exclusivity_months: exclusivityMonths,
    usage_term_months: agreementRow.usage_term_months, usage_paid_media: agreementRow.usage_paid_media,
    usage_retail_partners: agreementRow.usage_retail_partners, usage_print: agreementRow.usage_print,
    discount_code: agreementRow.discount_code, discount_start: agreementRow.discount_start, discount_end: agreementRow.discount_end,
    representative_name: agreementRow.representative_name, representative_position: agreementRow.representative_position,
    products, deliverables,
  });
  await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${agreement.id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ rendered_html: html }) });

  const mail = await sendMail({ to: [inflRow.email], subject: `Your ${brand.name} collaboration agreement — ${reference}`, html: signingEmail({ reference, brand_name: brand.name, influencer_name: inflRow.full_name, token: agreement.token }) });
  return NextResponse.json({ ok: true, agreement: { ...agreement, rendered_html: html }, emailed: mail.ok, emailError: mail.ok ? undefined : mail.error });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const get = await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${id}&select=*,brands(name),influencers:agreement_influencers(*)&limit=1`, { headers: h(), cache: "no-store" });
  const a = (await get.json().catch(() => []))[0];
  if (!a) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (b.action === "update") {
    if (a.status !== "draft") return NextResponse.json({ ok: false, error: "Only a draft can be edited — void it and start again if it's already sent" }, { status: 400 });
    const brandId = Number(b.brand_id) || a.brand_id;
    const infl = b.influencer || {};
    if (!String(infl.full_name || "").trim() || !String(infl.email || "").trim())
      return NextResponse.json({ ok: false, error: "Influencer name and email required" }, { status: 400 });

    // Reuse-by-email, same as create — editing may have switched to a
    // different (or newly-typed) influencer entirely.
    const findInfl = await fetch(`${sbUrl}/rest/v1/agreement_influencers?email=ilike.${encodeURIComponent(String(infl.email).trim())}&limit=1`, { headers: h(), cache: "no-store" });
    let influencerId = (await findInfl.json().catch(() => []))[0]?.id as string | undefined;
    const inflRow = {
      full_name: String(infl.full_name).trim().slice(0, 160), email: String(infl.email).trim().slice(0, 200),
      phone: infl.phone ? String(infl.phone).slice(0, 40) : null,
      instagram_handle: infl.instagram_handle ? String(infl.instagram_handle).replace(/^@/, "").slice(0, 60) : null,
      tiktok_handle: infl.tiktok_handle ? String(infl.tiktok_handle).replace(/^@/, "").slice(0, 60) : null,
      address_line1: infl.address_line1 ? String(infl.address_line1).slice(0, 200) : null,
      address_line2: infl.address_line2 ? String(infl.address_line2).slice(0, 200) : null,
      suburb: infl.suburb ? String(infl.suburb).slice(0, 100) : null,
      state: infl.state ? String(infl.state).slice(0, 10) : null,
      postcode: infl.postcode ? String(infl.postcode).slice(0, 10) : null,
      is_po_box: !!infl.is_po_box, abn: infl.abn ? String(infl.abn).slice(0, 30) : null,
    };
    if (influencerId) {
      await fetch(`${sbUrl}/rest/v1/agreement_influencers?id=eq.${influencerId}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(inflRow) });
    } else {
      const ins = await fetch(`${sbUrl}/rest/v1/agreement_influencers`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(inflRow) });
      const created = (await ins.json().catch(() => []))[0];
      if (!ins.ok || !created) return NextResponse.json({ ok: false, error: "Couldn't save the influencer" }, { status: 500 });
      influencerId = created.id;
    }

    const agreementType = AGREEMENT_TYPES[b.agreement_type] ? b.agreement_type : a.agreement_type;
    const agreementDate = b.agreement_date || a.agreement_date;
    const exclusivityApplies = AGREEMENT_TYPES[agreementType].requiresExclusivity && b.exclusivity_applies !== false;
    const exclusivityMonths = Number(b.exclusivity_months) || 6;
    const exclusivityEnd = exclusivityApplies ? new Date(new Date(agreementDate).setMonth(new Date(agreementDate).getMonth() + exclusivityMonths)).toISOString().slice(0, 10) : null;
    const contentDueDays = Number(b.content_due_days) || 21;
    const contentDueDate = new Date(new Date(agreementDate).setDate(new Date(agreementDate).getDate() + contentDueDays)).toISOString().slice(0, 10);
    const exclusivityCategory = b.exclusivity_category ? String(b.exclusivity_category).slice(0, 200) : a.exclusivity_category;

    const products = (Array.isArray(b.products) ? b.products : []).filter((p: any) => p?.product_name).map((p: any) => ({
      product_name: String(p.product_name).slice(0, 160), variant: p.variant ? String(p.variant).slice(0, 100) : null,
      quantity: Number(p.quantity) || 1, rrp: p.rrp != null && p.rrp !== "" ? Number(p.rrp) : null,
      cost_price: p.cost_price != null && p.cost_price !== "" ? Number(p.cost_price) : null,
    }));
    const deliverables = (Array.isArray(b.deliverables) ? b.deliverables : []).filter((d: any) => d?.deliverable_type).map((d: any) => ({
      deliverable_type: String(d.deliverable_type).slice(0, 80), platform: String(d.platform || "Instagram").slice(0, 40),
      quantity: Number(d.quantity) || 1, due_date: d.due_date || contentDueDate,
    }));

    const agreementRow = {
      influencer_id: influencerId, brand_id: brandId, agreement_type: agreementType,
      campaign_name: b.campaign_name ? String(b.campaign_name).slice(0, 160) : null, agreement_date: agreementDate,
      content_due_days: contentDueDays, content_due_date: contentDueDate, minimum_live_period_months: Number(b.minimum_live_period_months) || 6,
      exclusivity_applies: exclusivityApplies, exclusivity_category: exclusivityCategory,
      exclusivity_months: exclusivityMonths, exclusivity_end_date: exclusivityEnd,
      usage_term_months: Number(b.usage_term_months) || 12, usage_paid_media: !!b.usage_paid_media,
      usage_retail_partners: b.usage_retail_partners !== false, usage_print: !!b.usage_print,
      discount_code: b.discount_code ? String(b.discount_code).slice(0, 40) : null,
      discount_start: b.discount_start || null, discount_end: b.discount_end || null,
      representative_name: b.representative_name ? String(b.representative_name).slice(0, 120) : null,
      representative_position: b.representative_position ? String(b.representative_position).slice(0, 120) : null,
      updated_at: new Date().toISOString(),
    };
    const upd = await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(agreementRow) });
    if (!upd.ok) { const t = await upd.text(); return NextResponse.json({ ok: false, error: t.slice(0, 300) }, { status: 500 }); }

    // Products/deliverables are small lists edited as a whole — replace
    // rather than diff, same as how the create form builds them.
    await fetch(`${sbUrl}/rest/v1/influencer_agreement_products?agreement_id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
    await fetch(`${sbUrl}/rest/v1/influencer_agreement_deliverables?agreement_id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
    if (products.length) await fetch(`${sbUrl}/rest/v1/influencer_agreement_products`, { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(products.map((p: any) => ({ ...p, agreement_id: id }))) });
    if (deliverables.length) await fetch(`${sbUrl}/rest/v1/influencer_agreement_deliverables`, { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(deliverables.map((d: any) => ({ ...d, agreement_id: id }))) });

    return NextResponse.json({ ok: true });
  }
  if (b.action === "send") {
    if (a.status !== "draft") return NextResponse.json({ ok: false, error: "Already sent" }, { status: 400 });
    const err = validateForSend({ agreement_type: a.agreement_type, exclusivity_applies: a.exclusivity_applies, exclusivity_category: a.exclusivity_category });
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    // Re-render from current row + sub-rows (in case the draft was edited since creation).
    const [prodRes, delRes, cfgRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/influencer_agreement_products?agreement_id=eq.${id}`, { headers: h(), cache: "no-store" }),
      fetch(`${sbUrl}/rest/v1/influencer_agreement_deliverables?agreement_id=eq.${id}`, { headers: h(), cache: "no-store" }),
      fetch(`${sbUrl}/rest/v1/influencer_agreement_brand_config?brand_id=eq.${a.brand_id}&limit=1`, { headers: h(), cache: "no-store" }),
    ]);
    const products = await prodRes.json().catch(() => []);
    const deliverables = await delRes.json().catch(() => []);
    const cfg = (await cfgRes.json().catch(() => []))[0];
    const i = a.influencers;
    const html = renderAgreementHtml({
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
      products, deliverables,
    });
    const sentAt = new Date().toISOString();
    await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "sent", sent_at: sentAt, rendered_html: html }) });
    const mail = await sendMail({ to: [i.email], subject: `Your ${a.brands.name} collaboration agreement — ${a.reference}`, html: signingEmail({ reference: a.reference, brand_name: a.brands.name, influencer_name: i.full_name, token: a.token }) });
    return NextResponse.json({ ok: true, emailed: mail.ok, emailError: mail.ok ? undefined : mail.error });
  }
  if (b.action === "resend") {
    if (a.status !== "sent") return NextResponse.json({ ok: false, error: "Only a sent, unsigned agreement can be resent" }, { status: 400 });
    const i = a.influencers;
    const mail = await sendMail({ to: [i.email], subject: `Reminder: your ${a.brands.name} collaboration agreement — ${a.reference}`, html: signingEmail({ reference: a.reference, brand_name: a.brands.name, influencer_name: i.full_name, token: a.token }) });
    return NextResponse.json({ ok: true, emailed: mail.ok });
  }
  if (b.action === "void") {
    if (a.status === "signed") return NextResponse.json({ ok: false, error: "Already signed — use terminate" }, { status: 400 });
    await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "terminated" }) });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "terminate") {
    if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "terminated" }) });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "deliverable") {
    const did = String(b.deliverable_id || "");
    if (!did) return NextResponse.json({ ok: false }, { status: 400 });
    const fields: any = {};
    if (b.status) fields.status = String(b.status);
    if (b.live_url !== undefined) fields.live_url = b.live_url ? String(b.live_url).slice(0, 300) : null;
    if (b.reach !== undefined) fields.reach = b.reach === "" ? null : Number(b.reach);
    if (b.engagement !== undefined) fields.engagement = b.engagement === "" ? null : Number(b.engagement);
    if (b.status === "live" && !fields.posted_at) fields.posted_at = new Date().toISOString().slice(0, 10);
    await fetch(`${sbUrl}/rest/v1/influencer_agreement_deliverables?id=eq.${did}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
