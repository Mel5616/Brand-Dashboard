import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { GRAPHIC_BRANDS, buildGraphic, type GraphicCopy } from "@/lib/socialGraphic";

export const revalidate = 0;
export const maxDuration = 60;
const BUCKET = "social-images";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[–—]/g, ",").replace(/\s+/g, " ").trim().slice(0, max);

// "Generate graphic" on a Social Writing draft: asks the model for the short
// on-graphic wording (drawn only from the caption, so it can't add claims),
// renders it in the brand's palette and logo, stores it and attaches it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await getAccess();
  const ok = acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
  if (!ok) return NextResponse.json({ error: "No access" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  const { id } = await params;
  let body: any = {}; try { body = await req.json(); } catch { /* optional */ }
  const wanted = ["bold", "soft", "list"].includes(body.layout) ? body.layout : null;

  const dres = await fetch(`${sbUrl}/rest/v1/social_drafts?select=*&id=eq.${encodeURIComponent(id)}`, { headers: h, cache: "no-store" });
  const draft = (await dres.json().catch(() => []))[0];
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const bres = await fetch(`${sbUrl}/rest/v1/brands?select=name&id=eq.${draft.brand_id}`, { headers: h, cache: "no-store" });
  const brandName: string = (await bres.json().catch(() => []))[0]?.name ?? "";
  const style = GRAPHIC_BRANDS[brandName];
  if (!style) return NextResponse.json({ error: `Graphics aren't set up for ${brandName || "this brand"} yet (Frida, SmarTrike and Magic so far).` }, { status: 400 });

  const system = `You write the short words that go ON a social media graphic for ${brandName}, an Australian baby-goods brand. Use ONLY ideas and facts already in the caption: no new claims, prices, dates or product features. Australian English. No em dashes or en dashes. No emoji. Short and plain.
Reply with JSON only, no fences:
{"layout":"bold|soft|list","kicker":"2-4 words, label above the headline","line1":"main headline, max 55 chars","line2":"optional second line, max 40 chars, a contrast or follow-on (bold/soft only)","sub":"optional, max 110 chars (list only)","items":["2-4 short checklist items, max 28 chars each (list only)"],"cta":"max 28 chars, e.g. Link in bio"}
Use "list" only when the post is about a checklist or list. ${wanted ? `Use layout "${wanted}".` : "Otherwise pick bold or soft."}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, system, messages: [{ role: "user", content: `Caption:\n${draft.caption}\n\nVisual direction (for context): ${draft.visual_direction ?? ""}` }] }),
  });
  const out = await r.json().catch(() => null);
  const text: string = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  let raw: any;
  try { raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Couldn't work out the graphic wording. Try again." }, { status: 502 }); }
  const copy: GraphicCopy = {
    layout: wanted ?? (["bold", "soft", "list"].includes(raw.layout) ? raw.layout : "bold"),
    kicker: clean(raw.kicker, 32), line1: clean(raw.line1, 70), line2: clean(raw.line2, 50) || undefined,
    sub: clean(raw.sub, 130) || undefined, items: Array.isArray(raw.items) ? raw.items.map((x: unknown) => clean(x, 34)).filter(Boolean) : undefined,
    cta: clean(raw.cta, 32) || "Link in bio",
  };
  if (!copy.line1) return NextResponse.json({ error: "No headline came back. Try again." }, { status: 502 });
  if (copy.layout === "list" && !(copy.items?.length)) copy.layout = "bold";

  const origin = new URL(req.url).origin;
  const get = async (p: string) => { const x = await fetch(origin + p.split("/").map(encodeURIComponent).join("/")); if (!x.ok) throw new Error(`asset ${p} ${x.status}`); return x.arrayBuffer(); };
  const toData = (buf: ArrayBuffer) => `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  const logoPaths = [...new Set([style.bold.logo, style.soft.logo, style.list.logo])];
  let fonts: { name: string; data: ArrayBuffer; weight: 300 | 600 | 800; style: "normal" }[];
  const logos: Record<string, string> = {};
  try {
    const [f3, f6, f8] = await Promise.all([get("/fonts/outfit-300.woff"), get("/fonts/outfit-600.woff"), get("/fonts/outfit-800.woff")]);
    fonts = [{ name: "Outfit", data: f3, weight: 300, style: "normal" }, { name: "Outfit", data: f6, weight: 600, style: "normal" }, { name: "Outfit", data: f8, weight: 800, style: "normal" }];
    await Promise.all(logoPaths.map(async p => { logos[p] = toData(await get(p)); }));
  } catch (e: any) { return NextResponse.json({ error: `Couldn't load fonts or logo: ${e.message}` }, { status: 500 }); }

  const height = draft.format === "story" || draft.format === "reel" ? 1920 : 1350;
  const png = await new ImageResponse(buildGraphic(copy, style, logos, height), { width: 1080, height, fonts }).arrayBuffer();

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const path = `${id}/${Date.now()}.png`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, new Uint8Array(png), { contentType: "image/png", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await sb.from("social_drafts").update({ image_url: url, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data, url, copy });
}
