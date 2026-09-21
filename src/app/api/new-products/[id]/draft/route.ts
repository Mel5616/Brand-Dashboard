import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { mintToken, storeCreds } from "@/lib/shopifyMint";

export const revalidate = 0;
export const maxDuration = 60;

// Condensed from BRAND_VOICE in src/app/api/blog-drafts/route.ts — same
// tone/compliance rules, stripped of blog-specific FAQ markup and length
// targets since this drafts short product-page copy, not articles.
const PRODUCT_VOICE: Record<string, string> = {
  Frida: `Warm, honest, reassuring — the reader is often pregnant or a new mum who may be anxious. Direct and practical, no fluff. Australian English (labour, mum, colour, recognise). COMPLIANCE (non-negotiable): never say a product treats, cures, prevents or manages a medical condition ("helps with"/"designed for" only); no therapeutic claims; perineal/postpartum products can describe what they do physically (cooling, soothing, protecting), never frame as treating tears/trauma/episiotomies.`,
  SmarTrike: `smarTrike® makes the Wonder™ family — "the world's most lightweight compact stroller-trike." Render names exactly: smarTrike® Wonder™, Wonder+™, Wonder max™ ("max" lowercase). Clean, confident, warm, modern, aspirational but grounded, never gimmicky. Lead with real strengths: ultra-lightweight, carry-on approved, 3-second fold, 360° easy steer, 140° reclining seat.`,
  Nanit: `Confident, research-led, reassuring-not-alarmist; premium/tech-forward audience. COMPLIANCE (non-negotiable): Nanit is not a medical device — never claim it monitors, prevents or diagnoses SIDS or any condition. Describe breathing-motion tracking only as "for reassurance/insight."`,
  Magic: `Light, practical, a little wry, design-forward, sustainability-leaning. Sells nappy disposal bins (Heka range) and bathroom accessories, not strollers/carriers. COMPLIANCE: "100% odour control" is the brand's own claim, repeatable as theirs but not independently asserted as guaranteed in all conditions.`,
  Hannie: `Warm, plain-spoken, benefit-led with practical specifics (weights, ages, cm). Sells one product family: a portable high chair. COMPLIANCE: only restate safety standards already confirmed elsewhere, never invent a certification or number.`,
  "Gaia Baby": `Calm, warm, minimal, design-led nursery furniture — never busy or baby-themed. COMPLIANCE (non-negotiable): this brand cites real safety/standards certifications — never invent or generalise one, only restate what's already confirmed, scoped to the specific range it applies to.`,
  WonderFold: `Warm, practical, family-first — durability, all-terrain capability, multi-child/multi-item hauling. Strong inclusivity thread (multiples, special-needs families). Sells W2 (2-seat) and W4 (4-seat) stroller wagons.`,
  UPPAbaby: `Premium, design-led, confident, quietly aspirational — never generic "premium quality" claims, back every claim with a spec or real scenario. High price point — content should justify the investment, never apologise for it.`,
  ZAZU: `Warm, plain-spoken, parent-to-parent, a little playful. Leans on named characters where relevant. COMPLIANCE: sleep-comfort products, not medical/behavioural devices — never guarantee a behavioural outcome.`,
  MiaMily: `Swiss-designed ride-on luggage/travel brand — NOT baby carriers, never write about babywearing. Warm, plain, practical. COMPLIANCE: never guarantee airline cabin-baggage fit (hedge as "fits most overhead compartments"); never invent a minimum rider age.`,
  "Coolkidz Australia": `The umbrella multi-brand retail site — warm, practical, genuinely helpful, comparison-shopping tone rather than any single brand's voice.`,
  "Matchstick Monkey": `Playful, sensory, design-led, a little cheekier than most. COMPLIANCE (non-negotiable): never claim the product treats, cures or relieves teething as a medical fact — "designed to soothe/massage gums" only, never "relieves teething pain."`,
  Mamave: `Pregnancy-to-newborn skincare — warm, reassuring, cosmetic-science-credible. COMPLIANCE (non-negotiable): never claim a product treats, cures or prevents a medical/skin condition — "helps with"/"supports"/"designed for" only.`,
};

// Real product copy already live on this brand's store, so the model can
// match actual on-site vocabulary/style instead of drafting blind — never
// used as a source of facts, only tone.
async function liveStyleReference(brandId: number): Promise<string> {
  const store = storeCreds().find(s => s.id === brandId);
  if (!store) return "";
  const token = await mintToken(store);
  if (!token) return "";
  const res = await fetch(`https://${store.domain}/admin/api/2024-10/products.json?limit=3&status=active&fields=title,body_html`, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" }).catch(() => null);
  if (!res?.ok) return "";
  const json = await res.json().catch(() => ({}));
  const samples = (json.products || [])
    .map((p: any) => ({ title: p.title, text: String(p.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((p: any) => p.text.length > 40)
    .slice(0, 2)
    .map((p: any) => `"${p.title}": ${p.text.slice(0, 400)}`);
  return samples.join("\n\n");
}

// Draft website copy for a product with Claude. Returns the draft; the lead edits and saves.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const { id } = await params;
    const sb = await createClient();
    const { data: p } = await sb.from("new_products").select("*").eq("id", id).single();
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let brand: string | undefined;
    if (p.brand_id != null) { const { data: b } = await sb.from("brands").select("name").eq("id", p.brand_id).single(); brand = b?.name ?? undefined; }

    const dims = [p.length, p.width, p.height].every((v: any) => v != null) ? `${p.length} x ${p.width} x ${p.height} cm` : null;
    const facts = [
      brand && `Brand: ${brand}`,
      `Product: ${p.name}`,
      p.sku && `SKU: ${p.sku}`,
      p.source_description && `Supplier note: ${p.source_description}`,
      dims && `Dimensions: ${dims}`,
      p.weight != null && `Weight: ${p.weight} kg`,
    ].filter(Boolean).join("\n");

    const brandVoice = brand ? PRODUCT_VOICE[brand] : undefined;
    const styleRef = p.brand_id != null ? await liveStyleReference(Number(p.brand_id)).catch(() => "") : "";

    const system = `You write e-commerce product copy for ${brand || "Coolkidz Australia"}, an Australian baby and parenting retailer.
Australian English throughout. No em dashes anywhere. Never start a sentence with "And". Warm, clear, benefit-led, never hyped or making safety or medical claims.
Only use the facts provided below. Do not invent materials, certifications, dimensions or features that are not given. If a detail is unknown, leave it out rather than guessing.
${brandVoice ? `\nBRAND VOICE (match this tone and follow every compliance rule exactly):\n${brandVoice}\n` : ""}
${styleRef ? `\nREAL COPY ALREADY LIVE ON THIS BRAND'S STORE (style/vocabulary reference ONLY — how this brand writes, its sentence rhythm, its recurring phrases). These are different products. Do NOT pull any ingredient, material, certification, size or feature mentioned in them into this product's copy — only use facts explicitly given below for this specific product:\n${styleRef}\n` : ""}
Return ONLY valid JSON in exactly this shape, no preamble, no markdown fences:
{
  "long_description": "2 to 3 short paragraphs of website body copy",
  "short_description": "one punchy sentence for listings and cards",
  "whats_in_box": "a simple list, one item per line",
  "features": "a list of 4 to 6 key features and benefits, one per line"
}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 1200, system,
        messages: [{ role: "user", content: `Write the website copy for this product. Return only the JSON object.\n\n${facts}` }],
      }),
    });
    const aiJson = await aiRes.json();
    if (!aiRes.ok) return NextResponse.json({ error: "Model call failed", detail: aiJson?.error?.message ?? null }, { status: 502 });
    const raw = (aiJson.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").replace(/```json|```/g, "").trim();
    let gen: any;
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); gen = JSON.parse(s >= 0 && e > s ? raw.slice(s, e + 1) : raw); }
    catch { return NextResponse.json({ error: "The model returned an unreadable draft. Try again." }, { status: 502 }); }

    return NextResponse.json({ draft: {
      long_description: gen.long_description ?? "",
      short_description: gen.short_description ?? "",
      whats_in_box: gen.whats_in_box ?? "",
      features: gen.features ?? "",
    } });
  } catch (e: any) {
    return NextResponse.json({ error: "Draft failed", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
