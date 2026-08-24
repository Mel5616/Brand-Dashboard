import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { fetchSiteContext } from "@/lib/briefing";

// Draft a kit's tagline, overview and product list with Claude — grounded in
// whatever real brand material already exists (the Briefing Engine's brand
// profile, the live product feed off the brand's own site, and the current
// Product Information fact sheet), never invented. Same pattern as the New
// Products / Briefing Engine draft routes: raw fetch, JSON-shape prompt,
// brace-slice parsing. The lead reviews and edits everything afterwards.
export const revalidate = 0;
export const maxDuration = 60;

function stripHtml(html: string, max = 6000) {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

export async function POST(req: Request) {
  try {
    if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
    if (!b.kit_id) return NextResponse.json({ error: "kit_id required" }, { status: 400 });

    const sb = await createClient();
    const { data: kit } = await sb.from("retailer_kits").select("id, brand_id, title").eq("id", b.kit_id).single();
    if (!kit) return NextResponse.json({ error: "Kit not found" }, { status: 404 });
    const { data: brand } = await sb.from("brands").select("name").eq("id", kit.brand_id).single();
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const [{ data: profileRow }, { data: sheetRow }] = await Promise.all([
      sb.from("brand_profiles").select("profile").ilike("name", brand.name).maybeSingle(),
      sb.from("product_fact_sheets").select("html_url").ilike("brand_name", brand.name).eq("status", "current").order("last_updated", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const profile = profileRow?.profile as Record<string, any> | undefined;

    let siteFeed = "";
    if (profile?.siteUrl) siteFeed = await fetchSiteContext(profile.siteUrl).catch(() => "");

    let sheetText = "";
    if (sheetRow?.html_url) {
      try {
        const html = await fetch(sheetRow.html_url, { cache: "no-store" }).then(r => r.ok ? r.text() : "");
        sheetText = stripHtml(html);
      } catch { /* fact sheet unreachable — draft from whatever else we have */ }
    }

    if (!profile && !sheetText) {
      return NextResponse.json({ error: "Nothing to draft from yet — no brand profile (Briefing Engine) or Product Information fact sheet found for this brand. Add one of those first, or write the kit manually." }, { status: 422 });
    }

    const facts = [
      `Brand: ${brand.name}`,
      profile?.essence && `Brand essence: ${profile.essence}`,
      profile?.positioning && `Positioning: ${profile.positioning}`,
      profile?.audience && `Audience: ${typeof profile.audience === "string" ? profile.audience : JSON.stringify(profile.audience)}`,
      profile?.brandLine && `Tagline reference: ${profile.brandLine}`,
      profile?.proofPoints && `Proof points: ${Array.isArray(profile.proofPoints) ? profile.proofPoints.join("; ") : String(profile.proofPoints)}`,
      siteFeed && `Live site feed:\n${siteFeed}`,
      sheetText && `Product Information fact sheet (raw extract, may include stray formatting):\n${sheetText}`,
    ].filter(Boolean).join("\n\n");

    const system = `You write retailer onboarding material for Coolkidz Australia, a premium baby and parenting distributor. You are drafting a "Retailer Kit" — the pack a brand-new stockist reads to understand a brand before their first order.
Australian English throughout. No em dashes anywhere. Clear, confident, professional — written for a retail buyer, not a consumer.
Only use the facts provided below. Do not invent certifications, materials, awards, retailer names or specific numbers that are not given. If you are not confident of a product's description from the material given, keep it brief and generic rather than guessing details.

Return ONLY valid JSON in exactly this shape, no preamble, no markdown fences:
{
  "tagline": "one short line capturing the brand",
  "overview": "3 to 5 short paragraphs a new retailer's team would read to understand the brand, its positioning and why it's worth stocking",
  "products": [ { "name": "Product name", "description": "one or two sentences" }, ... up to 8 products, only ones you have real evidence for from the facts given ]
}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 1800, system,
        messages: [{ role: "user", content: `Draft the retailer kit overview and product list for ${brand.name}. Return only the JSON object.\n\n${facts}` }],
      }),
    });
    const aiJson = await aiRes.json();
    if (!aiRes.ok) return NextResponse.json({ error: "Model call failed", detail: aiJson?.error?.message ?? null }, { status: 502 });
    const raw = (aiJson.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").replace(/```json|```/g, "").trim();
    let gen: any;
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); gen = JSON.parse(s >= 0 && e > s ? raw.slice(s, e + 1) : raw); }
    catch { return NextResponse.json({ error: "The model returned an unreadable draft. Try again." }, { status: 502 }); }

    return NextResponse.json({
      draft: {
        tagline: gen.tagline ?? "",
        overview: gen.overview ?? "",
        products: Array.isArray(gen.products) ? gen.products.slice(0, 8).map((p: any) => ({ name: String(p.name ?? "").trim(), description: String(p.description ?? "").trim() })).filter((p: any) => p.name) : [],
      },
      sources: { profile: !!profile, siteFeed: !!siteFeed, factSheet: !!sheetText },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Draft failed", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
