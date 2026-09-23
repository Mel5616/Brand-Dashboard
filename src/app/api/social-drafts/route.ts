import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Social Writing pipeline (Owned & Earned > Social Writing): draft a
// caption + hashtags + visual direction for one platform/format from a
// one-line brief, review it, mark it posted once it's actually gone out
// (no platform publishing API is wired up here — this is a drafting and
// tracking tool, not an auto-poster). Mirrors blog-drafts/edm-drafts.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

function canWrite(acc: Awaited<ReturnType<typeof getAccess>>) {
  return acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
}

const HOUSE_RULES = `HOUSE SOCIAL RULES (apply to every post, every brand):
- Write for the platform, not a repurposed email. Instagram/Facebook: a real hook in line one (before "more" truncates it). TikTok: a spoken-voice script cue, not a caption to read silently. Pinterest: keyword-rich, descriptive, not a punchline.
- Voice: human, warm, conversational, Australian English. Concrete over vague — reject "premium quality" style claims. No corporate marketing-speak, no clichés, no more than one emoji per line and never as a substitute for a real sentence.
- Punctuation: no em dashes anywhere. Never start a sentence with "And".
- Claims: no unconfirmed AU prices/specs/launch dates/stock levels.
- Hashtags: 5-10, a mix of brand/niche/broad, lowercase, no spaces, no banned or unrelated tags padded on for reach.
- Visual direction: describe what the shot or graphic actually needs to show (real product/lifestyle context, not "nice photo of product") — this briefs whoever shoots or designs it, so be specific.`;

const SOCIAL_VOICE: Record<string, string> = {
  Frida: `FRIDA AUSTRALIA — warm, honest, reassuring; the reader is often pregnant or a new mum who may be anxious. Australian English (labour, mum, colour). Never preachy or alarmist. COMPLIANCE: never say a product treats/cures/prevents/manages a medical condition ("helps with"/"designed for" only); no therapeutic claims; any infant-sleep content must align with Red Nose Australia guidance.`,
  SmarTrike: `SMARTRIKE / WONDER — clean, confident, warm, modern, aspirational but grounded, never gimmicky. Render product names exactly: smarTrike® Wonder™, Wonder+™, Wonder max™ ("max" lowercase). Lead with real strengths: ultra-lightweight, carry-on approved, 3-second fold, 360° easy steer.`,
  Nanit: `NANIT — confident, research-led, reassuring-not-alarmist; premium/tech-forward audience. COMPLIANCE: Nanit is not a medical device; never claim it prevents/diagnoses SIDS or any condition.`,
  Magic: `MAGIC — light, practical, a little wry, design-forward, sustainability-leaning. Sells nappy disposal bins (Heka range), not strollers/carriers.`,
  Hannie: `HANNIE — warm, plain-spoken, benefit-led with practical specifics (weights, ages, cm). Sells one product family: a portable high chair.`,
  "Gaia Baby": `GAIA BABY — calm, warm, minimal, design-led nursery furniture; never busy or baby-themed. COMPLIANCE: never invent or generalise a safety/standards certification.`,
  WonderFold: `WONDERFOLD — warm, practical, family-first; strong inclusivity thread (multiples, special-needs families). Sells multi-child stroller wagons (W2/W4).`,
  UPPAbaby: `UPPABABY — premium, design-led, confident, quietly aspirational; back every claim with a spec or real scenario, never generic "premium quality" language.`,
  ZAZU: `ZAZU — warm, plain-spoken, parent-to-parent, a little playful. Leans on named characters (Lou the Owl, Emmy the Elephant etc). COMPLIANCE: avoid clinical "sleep training method" claims or guaranteed behavioural outcomes.`,
  MiaMily: `MIAMILY — warm, plain, practical; ride-on luggage brand, NOT baby carriers. COMPLIANCE: never guarantee airline cabin-baggage fit; never invent a minimum rider age.`,
  "Coolkidz Australia": `COOLKIDZ AUSTRALIA — the umbrella retail brand; warm, practical, genuinely helpful, comparison-shopping tone across brands rather than any single brand's voice.`,
  "Matchstick Monkey": `MATCHSTICK MONKEY — playful, sensory, design-led, a little cheekier than most. COMPLIANCE: never claim the product treats/cures/relieves teething as a medical fact ("designed to soothe/massage gums" only).`,
  Mamave: `MAMAVE — warm, reassuring, cosmetic-science-credible; pregnancy-to-newborn skincare (Mumma/Bubba ranges). COMPLIANCE: never claim a product treats/cures/prevents a skin/medical condition.`,
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

const FIELD_KEYS = ["CAPTION", "HASHTAGS", "VISUAL_DIRECTION"] as const;
function extractFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FIELD_KEYS) {
    const m = text.match(new RegExp(`===${key}===([\\s\\S]*?)(?:===|$)`));
    out[key.toLowerCase()] = (m?.[1] ?? "").trim();
  }
  return out;
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  let q = `${sbUrl}/rest/v1/social_drafts?select=*&order=created_at.desc&limit=300`;
  if (brandId) q += `&brand_id=eq.${encodeURIComponent(brandId)}`;
  const res = await fetch(q, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [], socialVoices: SOCIAL_VOICE });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]"), socialVoices: SOCIAL_VOICE });
}

const PLATFORMS = ["instagram", "tiktok", "facebook", "pinterest"];
const FORMATS = ["feed", "reel", "story", "carousel"];

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const brandName = String(b.brand_name || "");
  const voice = SOCIAL_VOICE[brandName];
  if (!voice) return NextResponse.json({ ok: false, error: `No brand voice set up yet for ${brandName || "this brand"}` }, { status: 400 });
  const brief = String(b.brief || "").trim();
  if (!brief) return NextResponse.json({ ok: false, error: "Give it a topic/brief to write from" }, { status: 400 });
  const platform = PLATFORMS.includes(b.platform) ? b.platform : "instagram";
  const format = FORMATS.includes(b.format) ? b.format : (platform === "tiktok" ? "reel" : "feed");
  const campaignFields = b.campaign_id ? { campaign_id: String(b.campaign_id), campaign_name: b.campaign_name ? String(b.campaign_name).slice(0, 200) : null } : {};

  const system = `You are the on-brand social media writer for ${brandName}, an Australian baby-goods brand. Follow the house rules and the brand voice exactly.
Respond in EXACTLY this plain-text format, nothing before or after it, no markdown fences:
===CAPTION===
<the full caption, written for ${platform} (${format})>
===HASHTAGS===
<5-10 hashtags, space-separated, lowercase, no # missing>
===VISUAL_DIRECTION===
<what the shot/graphic needs to show>

${HOUSE_RULES}

${voice}`;

  const user = `Write the post.
Platform: ${platform} (${format})
Topic/brief: ${brief}
Write it now, in the exact format specified.`;

  let draft: any;
  try {
    const text = await callClaude(system, user, 1500);
    draft = extractFields(text);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 502 });
  }
  if (!draft.caption) return NextResponse.json({ ok: false, error: "AI response was missing a caption — try again" }, { status: 502 });

  const row = {
    brand_id: Number(b.brand_id), status: "draft", platform, format,
    caption: draft.caption, hashtags: draft.hashtags || null, visual_direction: draft.visual_direction || null,
    scheduled_for: b.scheduled_for ? String(b.scheduled_for) : null,
    brief, created_by: acc.user?.email ?? null,
    ...campaignFields,
  };
  const res = await fetch(`${sbUrl}/rest/v1/social_drafts`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
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
    for (const f of ["caption", "hashtags", "visual_direction", "scheduled_for", "platform", "format"]) {
      if (b[f] !== undefined) fields[f] = b[f];
    }
    const res = await fetch(`${sbUrl}/rest/v1/social_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
    return NextResponse.json({ ok: res.ok });
  }
  if (action === "reject") {
    const res = await fetch(`${sbUrl}/rest/v1/social_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "rejected", note: b.note ? String(b.note).slice(0, 500) : null, updated_at: new Date().toISOString() }) });
    return NextResponse.json({ ok: res.ok });
  }
  if (action === "mark-posted") {
    const fields = { status: "posted", approved_by: acc.user?.email ?? null, posted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const res = await fetch(`${sbUrl}/rest/v1/social_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
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
  const res = await fetch(`${sbUrl}/rest/v1/social_drafts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
