import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

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
- Output must be ready to paste into Klaviyo as-is: a self-contained HTML email using inline CSS only (Klaviyo strips <style> blocks in some clients), a single <table role="presentation"> layout at 600px max-width, Arial/Helvetica fallback fonts, mobile-first single column. Include {% unsubscribe_link %} in the footer, Klaviyo's own Liquid tag, verbatim.`;

// ── Per-brand email voice (condensed from the blog voice guides — same tone
// and compliance rules, restructured for a short, single-CTA email rather
// than a long-form article) ──────────────────────────────────────────────
const EMAIL_VOICE: Record<string, string> = {
  Frida: `FRIDA AUSTRALIA (fridaaustralia.com.au) — warm, honest, reassuring; the reader is often pregnant or a new mum who may be anxious. Australian English (labour, mum, colour). Never preachy or alarmist. COMPLIANCE: never say a product treats/cures/prevents/manages a medical condition ("helps with"/"designed for" only); no therapeutic claims; any infant-sleep content must align with Red Nose Australia guidance.`,
  SmarTrike: `SMARTRIKE / WONDER (smartrike.com.au) — clean, confident, warm, modern, aspirational but grounded, never gimmicky. Render product names exactly: smarTrike® Wonder™, Wonder+™, Wonder max™ ("max" lowercase). Lead with real strengths: ultra-lightweight, carry-on approved, 3-second fold, 360° easy steer.`,
  Nanit: `NANIT (nanit.com.au) — confident, research-led, reassuring-not-alarmist; premium/tech-forward audience. COMPLIANCE: Nanit is not a medical device; never claim it prevents/diagnoses SIDS or any condition.`,
  Magic: `MAGIC (magicbabyproducts.com.au) — light, practical, a little wry, design-forward, sustainability-leaning. Sells nappy disposal bins (Heka range), not strollers/carriers.`,
  Hannie: `HANNIE (hannie.com.au) — warm, plain-spoken, benefit-led with practical specifics (weights, ages, cm). Sells one product family: a portable high chair.`,
  "Gaia Baby": `GAIA BABY (www.gaia-baby.com.au) — calm, warm, minimal, design-led nursery furniture; never busy or baby-themed. COMPLIANCE: never invent or generalise a safety/standards certification.`,
  WonderFold: `WONDERFOLD (wonderfold.com.au) — warm, practical, family-first; strong inclusivity thread (multiples, special-needs families). Sells multi-child stroller wagons (W2/W4).`,
  UPPAbaby: `UPPABABY (uppababy.com.au) — premium, design-led, confident, quietly aspirational; back every claim with a spec or real scenario, never generic "premium quality" language. High price point — content should justify the investment, never apologise for it.`,
  ZAZU: `ZAZU (zazu-kids.com.au) — warm, plain-spoken, parent-to-parent, a little playful. Leans on named characters (Lou the Owl, Emmy the Elephant etc). COMPLIANCE: avoid clinical "sleep training method" claims or guaranteed behavioural outcomes.`,
  MiaMily: `MIAMILY (miamily.com.au) — warm, plain, practical; ride-on luggage brand, NOT baby carriers. COMPLIANCE: never guarantee airline cabin-baggage fit; never invent a minimum rider age.`,
  "Coolkidz Australia": `COOLKIDZ AUSTRALIA (coolkidz.com.au) — the umbrella retail brand; warm, practical, genuinely helpful, comparison-shopping tone across brands rather than any single brand's voice.`,
  "Matchstick Monkey": `MATCHSTICK MONKEY (www.matchstickmonkey.com.au) — playful, sensory, design-led, a little cheekier than most. COMPLIANCE: never claim the product treats/cures/relieves teething as a medical fact ("designed to soothe/massage gums" only).`,
  Mamave: `MAMAVE (mamave.com.au) — warm, reassuring, cosmetic-science-credible; pregnancy-to-newborn skincare (Mumma/Bubba ranges). COMPLIANCE: never claim a product treats/cures/prevents a skin/medical condition.`,
};

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
  const brandId = new URL(req.url).searchParams.get("brand_id");
  let q = `${sbUrl}/rest/v1/edm_drafts?select=*&order=created_at.desc&limit=200`;
  if (brandId) q += `&brand_id=eq.${encodeURIComponent(brandId)}`;
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

  const brandName = String(b.brand_name || "");
  const voice = EMAIL_VOICE[brandName];
  if (!voice) return NextResponse.json({ ok: false, error: `No email voice guide set up yet for ${brandName || "this brand"}` }, { status: 400 });
  const brief = String(b.brief || "").trim();
  const scheduledFor = b.scheduled_for ? String(b.scheduled_for) : null;
  if (!brief) return NextResponse.json({ ok: false, error: "Give it a topic/brief to write from" }, { status: 400 });

  const system = `You are the on-brand EDM (email marketing) writer for ${brandName}, an Australian baby-goods brand. Follow the house rules and the brand voice exactly.

Respond in EXACTLY this plain-text format, nothing before or after it, no markdown fences:

SUBJECT: <the email subject line>
PREVIEW_TEXT: <the preview/preheader text>
===BODY_HTML===
<the full email as a single self-contained HTML document with inline CSS, per the house rules>
===END===

${HOUSE_RULES}

${voice}`;

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
    brand_id: Number(b.brand_id), status: "draft",
    subject: String(draft.subject || "").slice(0, 200),
    preview_text: String(draft.preview_text || "").slice(0, 200),
    body_html: String(draft.body_html || ""),
    scheduled_for: scheduledFor,
    brief, created_by: acc.user?.email ?? null,
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
    for (const f of ["subject", "preview_text", "body_html", "scheduled_for"]) {
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
