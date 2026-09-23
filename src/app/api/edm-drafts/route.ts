import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { mintToken, storeCreds } from "@/lib/shopifyMint";

// Email Writing pipeline (Owned & Earned > Email Writing): generate a full,
// on-brand EDM draft from a one-line brief, review it, then push it to
// Klaviyo via the existing KlaviyoSendPanel component on approval — the
// actual send/schedule/test flow lives there already (src/components/KlaviyoSend.tsx),
// this route only handles drafting + tracking. Mirrors blog-drafts/route.ts.
export const revalidate = 0;
export const maxDuration = 90;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

function canWrite(acc: Awaited<ReturnType<typeof getAccess>>) {
  return acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
}

// ── House rules for every EDM, every brand ───────────────────────────────
const HOUSE_RULES = `HOUSE EMAIL RULES (apply to every EDM, every brand):
- The test: would a parent actually open this, read it, and click? One clear idea per email, not a catalogue.
- Subject line: ~40-50 characters, front-load the benefit or hook, no clickbait, no spammy punctuation (no "!!!", no ALL CAPS words).
- Preview text: ~80-100 characters, complements the subject rather than repeating it, gives a reason to open.
- Structure: a short, scannable body. One hero message, one clear CTA button (repeat it once more near the end for longer emails). Cut anything that doesn't serve the single goal of this send.
- Voice: human, warm, conversational, Australian English. Concrete over vague — reject "premium quality" style claims. No keyword stuffing, no robotic marketing-speak, no clichés.
- Punctuation: no em dashes anywhere. Never start a sentence with "And".
- Claims: no unconfirmed AU prices/specs/launch dates/stock levels; state trade-offs honestly.
- Output must be ready to paste into Klaviyo as-is: a self-contained HTML email using inline CSS only (Klaviyo strips <style> blocks in some clients), a single <table role="presentation"> layout at 600px max-width, Arial/Helvetica fallback fonts, mobile-first single column. Include {% unsubscribe_link %} in the footer, Klaviyo's own Liquid tag, verbatim.
- Images: only ever use an exact image URL you are explicitly given below (as the hero image, or a product photo). Never invent, guess, or paraphrase an image URL — if none are given, skip images entirely and rely on typography and colour instead. A fabricated src just breaks in the inbox. When you're given a titled list of real product photos, pick the one whose product title actually matches what this email is about — never default to the first one in the list just because it's first.
- If the brand voice below gives you a "Header logo" URL, that logo MUST appear at the top of the email as a real <img src="..."> tag — never write the brand name out as styled text instead, even if you also use a separate product photo further down as the hero image. The logo image and the hero/product image are two different things and both can appear; the logo is never optional or replaceable with text when a URL is provided.

DESIGN SYSTEM (build every email to this structure, adapting only the brand's own colours/logo/copy — this is what "done well" looks like, not a suggestion):
1. Header — logo centred, top padding 36-40px, bottom padding 24px. Nothing else in this row.
2. Eyebrow (optional, use when it earns its place) — a short uppercase label above the headline, 11-12px, letter-spacing 0.12em, brand accent colour, bold. Skip it rather than force one.
3. Headline — the single hero message, 26-30px, bold, line-height 1.15-1.2, the ink colour (never body-copy grey). Short: a sentence or a fragment, not a paragraph. This is the one thing the reader should remember if they read nothing else.
4. Intro body — 1-2 sentences max, 15-16px, line-height 1.6, the muted/secondary text colour from the brand palette, generous 20-24px gap below the headline.
5. Hero image — full 600px width, rounded corners (8-12px), sits directly under the intro with 24-28px of space above and below it. This is the visual anchor of the email; give it room, don't crowd it with text wrapped alongside it.
6. CTA button — one only (a second copy of the same button near the end is fine for longer emails, don't introduce a second style). Solid brand colour background, white or high-contrast text, bold, rounded corners (6-8px), generous padding (14-16px vertical, 32-36px horizontal), centred, short imperative label ("Shop now", "Read the guide") — never a bare text link doing the CTA's job.
7. Secondary content (optional, at most one block) — a single supporting element: a short FAQ-style line, a second smaller product mention, a customer line. Separate it from the section above with either a thin 1px hairline rule in a light neutral, or a 40px+ whitespace gap — pick one, don't do both. Never stack multiple small feature blocks or an icon grid; that's what makes an email look like a cluttered template instead of a considered send.
8. Footer — 40-48px of top padding to clearly separate it from content, small type (11-12px), muted colour, centred: brand name, one-line address if given, then {% unsubscribe_link %}.
Consistency rules across the whole email: one accent colour used for emphasis (the CTA and maybe the eyebrow), everything else in the brand's ink/muted/background colours — never a rainbow. No gradients (render inconsistently across email clients). No drop shadows or decorative borders beyond the hero image's rounded corners. Paragraphs capped at 2-3 sentences. Section-to-section spacing is generous and consistent (24-40px), never cramped, never uneven.`;

// ── Per-brand email voice (condensed from the blog voice guides — same tone
// and compliance rules, restructured for a short, single-CTA email rather
// than a long-form article) ──────────────────────────────────────────────
const EMAIL_VOICE: Record<string, string> = {
  Frida: `FRIDA AUSTRALIA (fridaaustralia.com.au) — warm, honest, reassuring; the reader is often pregnant or a new mum who may be anxious. Australian English (labour, mum, colour). Never preachy or alarmist. COMPLIANCE: never say a product treats/cures/prevents/manages a medical condition ("helps with"/"designed for" only); no therapeutic claims; any infant-sleep content must align with Red Nose Australia guidance.
BRAND STYLE GUIDE: Palette — accent blue #4AC1E0, deeper blue #2FA9CB, lilac #C781B7, ink/text #4F5356, pale blue background #EAF6FA, pale lilac background #F3E7F1. Header logo — use this EXACT image, ~160-180px wide: https://fridaaustralia.com.au/cdn/shop/files/Frida_logo_main.png?v=1788744567&width=600 — CTA button in the accent blue with white text.`,
  SmarTrike: `SMARTRIKE / WONDER (smartrike.com.au) — clean, confident, warm, modern, aspirational but grounded, never gimmicky. Render product names exactly: smarTrike® Wonder™, Wonder+™, Wonder max™ ("max" lowercase). Lead with real strengths: ultra-lightweight, carry-on approved, 3-second fold, 360° easy steer.
BRAND STYLE GUIDE (follow exactly):
- Palette: blue grey #41414e (primary — headlines, logotype, text on light backgrounds), light grey #e5e1e6 (default background), warm sand/beige #c4bc9b (supporting accent). Blue grey text on a light grey background is the house look. Keep it bright, airy, lots of clean space — never busy or cluttered.
- Typography: the brand face is Stabil Grotesk, not available as a web-safe email font, so fall back to a clean geometric sans (Helvetica Neue, Arial) — bold weight for headlines, light/regular for body. Headline should read clearly larger and bolder than body copy.
- Header logo — use this EXACT image (PNG, not the SVG on the live site — SVG logos don't reliably render in email clients), roughly 140-160px wide, on a light background, don't distort its proportions: https://marketing.coolkidz.com.au/logos/smartrike.png
- Core lines to reach for naturally: "Growing together", "Everyday travel with Wonder™".
- CTA button: blue grey (#41414e) background, white text, rounded corners — not a plain text link.`,
  Nanit: `NANIT (nanit.com.au) — confident, research-led, reassuring-not-alarmist; premium/tech-forward audience. COMPLIANCE: Nanit is not a medical device; never claim it prevents/diagnoses SIDS or any condition.
BRAND STYLE GUIDE: Palette — deep navy ink #000041, warm cream background #fefaf2, peach highlight #ffddbf, soft teal accent #a8e8e2, muted navy-blue button #384871. Header logo — use this EXACT image, ~160px wide: https://cdn.shopify.com/s/files/1/0794/2399/6132/files/nanit_logo.png?v=1775286940 — CTA button in the navy-blue with white text.`,
  Magic: `MAGIC (magicbabyproducts.com.au) — light, practical, a little wry, design-forward, sustainability-leaning. Sells nappy disposal bins (Heka range), not strollers/carriers.
BRAND STYLE GUIDE: Palette — black #000000 and white #FFFFFF as the base, off-white background #FAFCFC, olive/lichen green accent #82A31A, muted colourways for imagery context only (pigeon blue-grey #788A8E, concrete grey #CBCBCB, graphite #252525). Header logo — use this EXACT image, ~140px wide: https://magicbabyproducts.com.au/cdn/shop/files/magic-logo-01.png?height=50&v=1766462489 — CTA button black background, white text.`,
  Hannie: `HANNIE (hannie.com.au) — warm, plain-spoken, benefit-led with practical specifics (weights, ages, cm). Sells one product family: a portable high chair.
BRAND STYLE GUIDE: Palette — paper background #F7F4EE, ink text #231F20, sage green primary #8E9C80, deep sage #5F6E54, sand secondary background #E9E2D3, clay accent #7E3B2F. Header logo — use this EXACT image, ~140px wide: https://hannie.com.au/cdn/shop/files/Hannie_wordmark_original_231124.png?v=1761180156&width=220 — CTA button in sage green with white text.`,
  "Gaia Baby": `GAIA BABY (www.gaia-baby.com.au) — calm, warm, minimal, design-led nursery furniture; never busy or baby-themed. COMPLIANCE: never invent or generalise a safety/standards certification.
BRAND STYLE GUIDE: Palette — cream background #f2efe6, white secondary background #ffffff, body text #444444, heading/near-black #1d1d1f, deep green primary #1f473e, sage green accent #4a5740, orange highlight #ff9c05 (use sparingly). Header logo — use this EXACT image, ~160px wide: https://cdn.shopify.com/s/files/1/0710/3253/7410/t/31/assets/logo-colour.png?v=1789968875 — CTA button in deep green with white text.`,
  WonderFold: `WONDERFOLD (wonderfold.com.au) — warm, practical, family-first; strong inclusivity thread (multiples, special-needs families). Sells multi-child stroller wagons (W2/W4).
BRAND STYLE GUIDE: Palette — deep teal primary #063537 ("nightfall"), soft off-white background #F2F6F6, teal accent #00A39D, warm tan secondary #E0A580. Header logo — use this EXACT image (PNG, not the SVG on the live site — SVG logos don't reliably render in email clients), ~160px wide: https://marketing.coolkidz.com.au/logos/wonderfold.png — CTA button in deep teal with white text.`,
  UPPAbaby: `UPPABABY (uppababy.com.au) — premium, design-led, confident, quietly aspirational; back every claim with a spec or real scenario, never generic "premium quality" language. High price point — content should justify the investment, never apologise for it.
BRAND STYLE GUIDE: Palette — near-black text/primary #171717, white background #ffffff, soft peach highlight #ffddbf, red for sale/limited-time only #cf2d2e (use sparingly). Header logo — use this EXACT image, ~150px wide: https://cdn.shopify.com/s/files/1/0681/1877/4015/files/UPPAbaby_Logo_e8570038-4798-4703-8af1-0ff215f0802d.png?v=1713791034 — CTA button near-black background, white text.`,
  ZAZU: `ZAZU (zazu-kids.com.au) — warm, plain-spoken, parent-to-parent, a little playful. Leans on named characters (Lou the Owl, Emmy the Elephant etc). COMPLIANCE: avoid clinical "sleep training method" claims or guaranteed behavioural outcomes.
BRAND STYLE GUIDE: Palette — white background #FFFFFF, ink text #231F20, warm gold/sun primary #F7B955, coral accent #E8524A, green accent #6CC07E, neutral panel #F4F2EF. Header logo — use this EXACT image, ~140px wide: https://cdn.shopify.com/s/files/1/0753/4667/3894/t/10/assets/zazu-logo.png?v=1788628009 — CTA button in the warm gold with dark ink text.`,
  MiaMily: `MIAMILY (miamily.com.au) — warm, plain, practical; ride-on luggage brand, NOT baby carriers. COMPLIANCE: never guarantee airline cabin-baggage fit; never invent a minimum rider age.
BRAND STYLE GUIDE: Palette — navy primary #012054, forest green accent #023B32, burgundy accent #5C1E2D, sand/stone secondary background #E7E3DB, blush wash background #F5E6EA. Header logo — use this EXACT image, ~130px wide: https://miamily.com.au/cdn/shop/t/15/assets/logo-digital.png?v=42392348860472842651789187351 — CTA button in navy with white text.`,
  "Coolkidz Australia": `COOLKIDZ AUSTRALIA (coolkidz.com.au) — the umbrella retail brand; warm, practical, genuinely helpful, comparison-shopping tone across brands rather than any single brand's voice.
BRAND STYLE GUIDE: Palette — red primary #D63A2F, white background #FFFFFF, light grey secondary background #F7F7F7, black heading text #000000. Header logo — use this EXACT image, ~160px wide: https://coolkidz.com.au/cdn/shop/files/Coolkidz_Logo.png?v=1744850972&width=500 — CTA button in red with white text.`,
  "Matchstick Monkey": `MATCHSTICK MONKEY (www.matchstickmonkey.com.au) — playful, sensory, design-led, a little cheekier than most. COMPLIANCE: never claim the product treats/cures/relieves teething as a medical fact ("designed to soothe/massage gums" only).
BRAND STYLE GUIDE: Palette — sage green primary #A5BCB1, deep sage #7E9A8C, mustard accent #F0C368, mint accent #B9E0C5, cream background #F7F3EC, ink text #121212. Header logo — use this EXACT image, ~140px wide: https://cdn.shopify.com/s/files/1/0606/3721/6831/t/6/assets/logo.png?v=1788446102 — CTA button in mustard or sage green with dark ink text.`,
  Mamave: `MAMAVE (mamave.com.au) — warm, reassuring, cosmetic-science-credible; pregnancy-to-newborn skincare (Mumma/Bubba ranges). COMPLIANCE: never claim a product treats/cures/prevents a skin/medical condition.
BRAND STYLE GUIDE: Palette — coral/red primary #DD624B (matches the logo), deep coral accent #C1503B, soft peach secondary background #FFD9CC, warm sand neutral #D9C4B6. Header logo — use this EXACT image, ~150px wide: https://mamave.com.au/cdn/shop/files/Primary_Logo_-_Red.png — CTA button in coral with white text.`,
};

// Real, live product photos for this brand — so the model has actual hosted
// URLs to build a hero image from instead of inventing an <img src> that
// 404s. Best-effort: an empty list just means the email goes text-only.
// Titled, not just bare URLs — a longer pool with product names is what lets
// the model actually pick something relevant to the brief instead of
// defaulting to whatever came back first from the store.
async function fetchBrandImages(brandId: number, limit = 25): Promise<{ title: string; url: string }[]> {
  const store = storeCreds().find(s => s.id === brandId);
  if (!store) return [];
  const token = await mintToken(store);
  if (!token) return [];
  const res = await fetch(`https://${store.domain}/admin/api/2024-10/products.json?limit=${limit}&status=active&fields=title,images`, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  const json = await res.json().catch(() => ({}));
  const items: { title: string; url: string }[] = [];
  for (const p of json.products || []) { const src = p.images?.[0]?.src; if (src && p.title) items.push({ title: p.title, url: src }); }
  return items;
}

async function callClaude(system: string, user: string, maxTokens: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) throw new Error(`AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 300)}`);
  return text;
}

// Delimiter-based, not JSON — same reasoning as blog-drafts: a full HTML
// email is full of quotes/newlines that routinely break JSON.parse.
const FIELD_KEYS = ["SUBJECT", "PREVIEW_TEXT"] as const;
function extractFields(text: string): Record<string, string> {
  const bodyMatch = text.match(/===BODY_HTML===([\s\S]*?)===END===/);
  if (!bodyMatch) throw new Error("AI response was missing the body markers — try again");
  const header = text.slice(0, bodyMatch.index).trim();
  const out: Record<string, string> = { body_html: bodyMatch[1].trim() };
  for (const key of FIELD_KEYS) {
    const m = header.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    out[key.toLowerCase()] = (m?.[1] ?? "").trim();
  }
  return out;
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brand_id");
  const campaignId = params.get("campaign_id");
  let q = `${sbUrl}/rest/v1/edm_drafts?select=*&order=created_at.desc&limit=200`;
  if (brandId) q += `&brand_id=eq.${encodeURIComponent(brandId)}`;
  if (campaignId) q += `&campaign_id=eq.${encodeURIComponent(campaignId)}`;
  const res = await fetch(q, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [], emailVoices: EMAIL_VOICE });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]"), emailVoices: EMAIL_VOICE });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  // Links this draft back to the campaign it belongs to (see
  // supabase/add_edm_drafts_campaign_link.sql) — how a multi-email series
  // (Generate campaign kit's 3 EDMs, or Send to Email Planner) shows as a
  // connected set instead of unrelated one-off drafts.
  const campaignFields = b.campaign_id ? { campaign_id: String(b.campaign_id), campaign_name: b.campaign_name ? String(b.campaign_name).slice(0, 200) : null } : {};

  // Campaigns' "Send to Email Planner →" — the email was already written by
  // hand in the campaign brief (brief.emails[]), so import it as-is (status
  // "draft", ready to review/send) instead of asking Claude to write it again.
  if (b.import) {
    const brandId = Number(b.brand_id);
    const subject = String(b.subject || "").trim().slice(0, 200);
    const bodyHtml = String(b.body_html || "");
    if (!brandId || !subject || !bodyHtml) return NextResponse.json({ ok: false, error: "Brand, subject and a body are required" }, { status: 400 });
    const row = {
      brand_id: brandId, status: "draft", subject,
      preview_text: b.preview_text ? String(b.preview_text).trim().slice(0, 200) : null,
      body_html: bodyHtml,
      scheduled_for: b.scheduled_for ? String(b.scheduled_for) : null,
      brief: b.brief ? String(b.brief).trim() : null,
      created_by: acc.user?.email ?? null,
      ...campaignFields,
    };
    const res = await fetch(`${sbUrl}/rest/v1/edm_drafts`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  // EDM Planner "+ Plan EDM" — a bare placeholder (brand, date, one-line
  // brief), no AI call. Stays status "planned" until someone hits "Use this
  // brief ↑" in Email Writing to actually generate it.
  if (b.plan_only) {
    const brandId = Number(b.brand_id);
    const brief = String(b.brief || "").trim();
    if (!brandId || !brief) return NextResponse.json({ ok: false, error: "A brand and a brief are required" }, { status: 400 });
    const row = { brand_id: brandId, status: "planned", brief, scheduled_for: b.scheduled_for ? String(b.scheduled_for) : null, created_by: acc.user?.email ?? null, ...campaignFields };
    const res = await fetch(`${sbUrl}/rest/v1/edm_drafts`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  // SMS — the same drafting/scheduling pipeline as email (Klaviyo treats
  // them as parallel campaign types), just a short message instead of a
  // full HTML send. No hero image, no subject line.
  if (b.channel === "sms") {
    const brandName = String(b.brand_name || "");
    const voice = EMAIL_VOICE[brandName];
    if (!voice) return NextResponse.json({ ok: false, error: `No brand voice set up yet for ${brandName || "this brand"}` }, { status: 400 });
    const brief = String(b.brief || "").trim();
    if (!brief) return NextResponse.json({ ok: false, error: "Give it a topic/brief to write from" }, { status: 400 });
    const brandId = Number(b.brand_id);
    const linkNote = b.source_url
      ? `Include this exact link: ${b.source_url}`
      : `If a link is genuinely needed, use the placeholder {{ organization.url }} rather than inventing a real one.`;

    const system = `You are the on-brand SMS marketing writer for ${brandName}, an Australian baby-goods brand.
SMS RULES: 160 characters is the target, 300 is the absolute max including any link. One idea, one CTA. Plain, direct, human — this gets read in a pocket, not a Klaviyo modal. No em dashes. Never start a sentence with "And". Australian English. Klaviyo appends its own opt-out line automatically — never write your own "reply STOP" text.
${linkNote}
Respond with ONLY the message text, nothing else — no preamble, no quote marks around it, no markdown.

${voice}`;
    const user = `Write the SMS.
Topic/brief: ${brief}
Write it now, message text only.`;

    let smsText: string;
    try { smsText = (await callClaude(system, user, 300)).trim().replace(/^"|"$/g, ""); }
    catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 502 }); }
    if (!smsText) return NextResponse.json({ ok: false, error: "AI response was empty — try again" }, { status: 502 });

    const row = {
      brand_id: brandId, status: "draft", channel: "sms", sms_text: smsText.slice(0, 320),
      scheduled_for: b.scheduled_for ? String(b.scheduled_for) : null,
      brief, created_by: acc.user?.email ?? null,
      ...campaignFields,
    };
    const res = await fetch(`${sbUrl}/rest/v1/edm_drafts`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  const brandName = String(b.brand_name || "");
  const voice = EMAIL_VOICE[brandName];
  if (!voice) return NextResponse.json({ ok: false, error: `No email voice guide set up yet for ${brandName || "this brand"}` }, { status: 400 });
  const brief = String(b.brief || "").trim();
  const scheduledFor = b.scheduled_for ? String(b.scheduled_for) : null;
  const brandId = Number(b.brand_id);
  // Set when this draft was started "Send as EDM" from a blog post — a real
  // hero image and a real link already exist, so use them exactly rather
  // than asking the model to invent either.
  const sourceUrl = b.source_url ? String(b.source_url) : null;
  const sourceImageUrl = b.source_image_url ? String(b.source_image_url) : null;
  if (!brief) return NextResponse.json({ ok: false, error: "Give it a topic/brief to write from" }, { status: 400 });

  const brandImages = sourceImageUrl ? [] : await fetchBrandImages(brandId).catch(() => []);
  const imageNote = sourceImageUrl
    ? `Hero image — use this EXACT url for the hero image, don't alter it: ${sourceImageUrl}`
    : brandImages.length
      ? `Real product photos you may use as the hero/feature image — pick the one whose title actually matches this email's topic, don't just take the first one. Use the EXACT url, don't alter it, don't use any other image:\n${brandImages.map(i => `- "${i.title}": ${i.url}`).join("\n")}`
      : `No real images are available for this email — skip images entirely, don't invent an image url.`;
  const linkNote = sourceUrl ? `The CTA button must link to this EXACT url: ${sourceUrl}` : "";

  const system = `You are the on-brand EDM (email marketing) writer for ${brandName}, an Australian baby-goods brand. Follow the house rules and the brand voice exactly.

Respond in EXACTLY this plain-text format, nothing before or after it, no markdown fences:

SUBJECT: <the email subject line>
PREVIEW_TEXT: <the preview/preheader text>
===BODY_HTML===
<the full email as a single self-contained HTML document with inline CSS, per the house rules>
===END===

${HOUSE_RULES}

${voice}

${imageNote}
${linkNote}`;

  const user = `Write the email.
Topic/brief: ${brief}
Write it now, in the exact format specified.`;

  let draft: any;
  try {
    const text = await callClaude(system, user, 4000);
    draft = extractFields(text);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 502 });
  }

  const row = {
    brand_id: brandId, status: "draft",
    subject: String(draft.subject || "").slice(0, 200),
    preview_text: String(draft.preview_text || "").slice(0, 200),
    body_html: String(draft.body_html || ""),
    scheduled_for: scheduledFor,
    image_url: sourceImageUrl || brandImages[0]?.url || null,
    brief, created_by: acc.user?.email ?? null,
    ...campaignFields,
  };
  if (!row.subject || !row.body_html) return NextResponse.json({ ok: false, error: "AI response was missing a subject or body — try again" }, { status: 502 });

  const res = await fetch(`${sbUrl}/rest/v1/edm_drafts`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const action = String(b.action || "edit");

  if (action === "edit") {
    const fields: any = { updated_at: new Date().toISOString() };
    for (const f of ["subject", "preview_text", "body_html", "scheduled_for", "image_url", "sms_text"]) {
      if (b[f] !== undefined) fields[f] = b[f];
    }
    const res = await fetch(`${sbUrl}/rest/v1/edm_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
    return NextResponse.json({ ok: res.ok });
  }

  if (action === "reject") {
    const res = await fetch(`${sbUrl}/rest/v1/edm_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "rejected", note: b.note ? String(b.note).slice(0, 500) : null, updated_at: new Date().toISOString() }) });
    return NextResponse.json({ ok: res.ok });
  }

  if (action === "mark-sent") {
    // Live-sends, so admin only — called by the UI right after KlaviyoSendPanel
    // confirms a real send/schedule went through (see src/components/KlaviyoSend.tsx).
    if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    const fields = {
      status: "sent",
      klaviyo_campaign_id: b.klaviyo_campaign_id ? String(b.klaviyo_campaign_id) : null,
      published_url: b.published_url ? String(b.published_url) : null,
      approved_by: acc.user?.email ?? null,
      published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${sbUrl}/rest/v1/edm_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/edm_drafts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
