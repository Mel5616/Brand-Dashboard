import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;
export const maxDuration = 60;

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

    const system = `You write e-commerce product copy for Coolkidz Australia, a premium baby and parenting retailer.
Australian English throughout. No em dashes anywhere. Warm, clear, benefit-led, never hyped or making safety or medical claims.
Only use the facts provided. Do not invent materials, certifications, dimensions or features that are not given. If a detail is unknown, leave it out rather than guessing.

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
