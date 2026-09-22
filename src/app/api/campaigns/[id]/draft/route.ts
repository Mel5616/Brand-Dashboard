import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Draft the narrative brief fields for a Campaign card from its card note —
// admin only, same "draft with Claude" pattern as New Products/Blog Writing.
// Only ever fills fields that are currently blank; never overwrites what's
// already there, and never asserts something the note flags as unconfirmed.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

const DRAFT_FIELDS = [
  "oneLiner", "objective", "whyNow", "audience", "keyMessage", "offerMechanic", "do", "dont", "successMeasure", "compliance",
  "edmBrief", "paidBrief", "socialsBrief", "designBrief", "retailBrief", "websiteBrief", "affiliateBrief", "creativeDirection",
] as const;
// These per-discipline fields feed straight into that team's Asana subtask
// on "Push to Asana" — see src/app/api/campaigns/asana-push/route.ts — so
// they need to be genuinely actionable instructions for that person, not a
// restatement of the campaign summary.
const AFFILIATE_BRANDS = new Set(["UPPAbaby", "Nanit"]);

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  const { id } = await params;

  const res = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${id}&select=*`, { headers: h(), cache: "no-store" });
  const rows = await res.json().catch(() => []);
  const item = rows?.[0];
  if (!item) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const existing: Record<string, string> = item.brief || {};
  // Work from whatever's actually there — the card note, or fields already
  // filled in (oneLiner/objective/etc, or an earlier AI Draft pass). Only
  // block when there's genuinely nothing to draft from at all.
  if (!item.note?.trim() && !Object.values(existing).some(v => String(v || "").trim()))
    return NextResponse.json({ ok: false, error: "Add a card note or fill in at least one brief field first — that's what the draft works from" }, { status: 400 });
  const applicable = DRAFT_FIELDS.filter(k => k !== "affiliateBrief" || AFFILIATE_BRANDS.has(item.brand));
  const blankFields = applicable.filter(k => !existing[k]?.trim());
  if (!blankFields.length) return NextResponse.json({ ok: false, error: "Every field already has content — nothing blank to draft" }, { status: 400 });

  const system = `You are a senior campaign strategist for Coolkidz Australia, drafting the internal brief for a marketing campaign card from a short card note.
Australian English throughout. No em dashes. Never start a sentence with "And".
Only use the facts given below (brand, campaign name, channel, key date, card note). Do not invent product facts, certifications, prices, or launch confirmations.
If the card note flags something as unconfirmed or needing confirmation, do NOT present it as settled anywhere in your output — reflect that uncertainty in "dependencies"/"compliance" wording instead (e.g. "Pending confirmation that...").
Write only the fields listed below, each 1-3 sentences, plain text (no markdown, no bullet characters). Leave a field as an empty string "" if the note genuinely gives you nothing to go on for it.
Return ONLY valid JSON, no preamble, no markdown fences, with exactly these keys: ${blankFields.map(k => `"${k}"`).join(", ")}.

Field meanings:
oneLiner — one sentence summarising the campaign for someone skimming the board.
objective — what this campaign is meant to achieve.
whyNow — why this is happening in this window, not another.
audience — who this is targeting.
keyMessage — the single message the creative should carry.
offerMechanic — the actual offer/mechanic, if there is one (leave blank if this isn't an offer-led campaign).
do — 2-4 short guardrails on what to include/emphasise.
dont — 2-4 short guardrails on what to avoid.
successMeasure — how you'd know this worked.
compliance — any claims/compliance care needed, or unresolved dependencies flagged in the note.
edmBrief — a genuinely actionable instruction to the email writer: how many sends, what each one needs to cover, tone/angle notes. If "deliverables" below already lists specific dates/topics, work from those exactly, don't invent different ones.
paidBrief — instruction to paid media: which channels, what the ad should say/show, targeting angle, where it sends people.
socialsBrief — instruction to social: what to post, which formats (reel, static, stories), how it should mirror or support the EDM/blog angle.
designBrief — instruction to design: what assets are needed (hero images, social tiles, banners), any visual direction beyond the brand's existing style guide.
retailBrief — instruction for retail/wholesale, only if this campaign has any in-store, wholesale or stockist angle — leave blank for a D2C-only campaign.
websiteBrief — instruction to the website/e-commerce owner: what needs to exist on-site (landing page, capture form, PDP updates).
affiliateBrief — only ever write this for UPPAbaby or Nanit; instruction to the affiliate manager on what to brief partners/creators.
creativeDirection — the visual/tonal direction for creative assets across the campaign, one level more specific than "on brand".
Base every one of these on the facts given below plus the existing brief fields already filled in (shown below) — stay consistent with them, don't contradict a date, offer or audience already decided.`;

  const existingBriefSummary = Object.entries(existing).filter(([k, v]) => v && !blankFields.includes(k as any))
    .map(([k, v]) => `${k}: ${v}`).join("\n");

  const facts = [
    `Brand: ${item.brand}`,
    `Campaign: ${item.campaign}`,
    item.channel && `Channel: ${item.channel}`,
    item.key_date && `Key date: ${item.key_date}`,
    item.note?.trim() && `Card note: ${item.note}`,
    existingBriefSummary && `Already decided (brief fields already filled in — treat as settled facts):\n${existingBriefSummary}`,
  ].filter(Boolean).join("\n");

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, system, messages: [{ role: "user", content: `${facts}\n\nWrite the brief fields. Return only the JSON object.` }] }),
  });
  const aiJson = await aiRes.json();
  if (!aiRes.ok) return NextResponse.json({ ok: false, error: aiJson?.error?.message || "Model call failed" }, { status: 502 });
  const raw = (aiJson.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").replace(/```json|```/g, "").trim();
  let gen: any;
  try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); gen = JSON.parse(s >= 0 && e > s ? raw.slice(s, e + 1) : raw); }
  catch { return NextResponse.json({ ok: false, error: "The model returned an unreadable draft. Try again." }, { status: 502 }); }

  const filled: Record<string, string> = {};
  for (const k of blankFields) if (gen[k]) filled[k] = String(gen[k]).trim();
  const merged = { ...existing, ...filled };

  const patchRes = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify({ brief: merged }) });
  const patchText = await patchRes.text();
  if (!patchRes.ok) return NextResponse.json({ ok: false, error: patchText.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(patchText)[0], filled: Object.keys(filled) });
}
