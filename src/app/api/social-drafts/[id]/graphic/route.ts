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

// Public storefronts we can pull the brand's own product photos from (Shopify
// /products.json). ZAZU's site isn't Shopify, so its posts stay photo-free.
const SITES: Record<string, string> = {
  Frida: "fridaaustralia.com.au", SmarTrike: "smartrike.com.au", Magic: "magicbabyproducts.com.au",
  WonderFold: "wonderfold.com.au", "Gaia Baby": "www.gaia-baby.com.au", UPPAbaby: "uppababy.com.au",
  MiaMily: "miamily.com.au", "Matchstick Monkey": "www.matchstickmonkey.com.au", Mamave: "mamave.com.au",
  Hannie: "hannie.com.au", Nanit: "nanit.com.au",
};
type Product = { title: string; images: string[]; dims: { w: number; h: number }[] };

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[–—]/g, ",").replace(/\s+/g, " ").trim().slice(0, max);

async function loadProducts(domain: string): Promise<Product[]> {
  try {
    const r = await fetch(`https://${domain}/products.json?limit=250`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.products ?? [])
      .filter((p: any) => p.images?.length && !/gift ?card|e-?gift|voucher|sample|% off|\u{1F381}/iu.test(p.title))
      .map((p: any) => ({ title: String(p.title), images: p.images.slice(0, 6).map((i: any) => String(i.src)), dims: p.images.slice(0, 6).map((i: any) => ({ w: Number(i.width) || 1, h: Number(i.height) || 1 })) }))
      .slice(0, 120);
  } catch { return []; }
}

// Turn an uploaded photo (any common format) into a JPEG data URI plus its shape.
async function userPhoto(file: File): Promise<{ data: string; fit: "cover" | "contain"; aspect: number } | undefined> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(Buffer.from(await file.arrayBuffer())).rotate();
    const meta = await img.metadata();
    const jpg = await img.resize({ width: 1500, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const aspect = (meta.width || 1) / (meta.height || 1);
    return { data: `data:image/jpeg;base64,${jpg.toString("base64")}`, fit: aspect >= 1.25 ? "cover" : "contain", aspect };
  } catch { return undefined; }
}

async function productPhoto(products: Product[], ref: unknown): Promise<{ data: string; fit: "cover" | "contain"; aspect: number } | undefined> {
  const m = /^(\d+)\.(\d+)$/.exec(String(ref ?? ""));
  if (!m) return undefined;
  const src = products[Number(m[1])]?.images[Number(m[2])];
  if (!src) return undefined;
  try {
    const u = new URL(src); u.searchParams.set("width", "1000"); u.searchParams.set("format", "jpg");
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return undefined;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 2_500_000) return undefined;
    const d = products[Number(m[1])].dims[Number(m[2])];
    return { data: `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`, fit: d.w / d.h >= 1.25 ? "cover" : "contain", aspect: d.w / d.h };
  } catch { return undefined; }
}

// "Generate graphic" on a Social Writing draft. Single posts get one image;
// Carousel drafts get a set of slides (cover, points, call to action). The
// model writes the on-graphic wording from the caption only (no new claims)
// and can pick the brand's own product photos from its website.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await getAccess();
  const ok = acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
  if (!ok) return NextResponse.json({ error: "No access" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  const { id } = await params;
  // JSON for a normal generate, multipart when the user supplies their own cover photo.
  let body: any = {}; let userFile: File | null = null;
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const fd = await req.formData();
    userFile = fd.get("photo") as File | null;
    body = { layout: fd.get("layout") || undefined, photos: fd.get("photos") !== "false", coverOnly: fd.get("coverOnly") === "true", slides: fd.get("slides") || undefined };
  } else { try { body = await req.json(); } catch { /* optional */ } }
  const wanted = ["bold", "soft", "list"].includes(body.layout) ? body.layout : null;
  const usePhotos = body.photos !== false;

  const dres = await fetch(`${sbUrl}/rest/v1/social_drafts?select=*&id=eq.${encodeURIComponent(id)}`, { headers: h, cache: "no-store" });
  const draft = (await dres.json().catch(() => []))[0];
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const bres = await fetch(`${sbUrl}/rest/v1/brands?select=name&id=eq.${draft.brand_id}`, { headers: h, cache: "no-store" });
  const brandName: string = (await bres.json().catch(() => []))[0]?.name ?? "";
  const style = GRAPHIC_BRANDS[brandName];
  if (!style) return NextResponse.json({ error: `Graphics aren't set up for ${brandName || "this brand"} yet.` }, { status: 400 });

  const carousel = draft.format === "carousel";
  const n = Math.min(6, Math.max(3, Number(body.slides) || 5));
  const products = usePhotos && SITES[brandName] ? await loadProducts(SITES[brandName]) : [];
  const catalogue = products.map((p, i) => `${i}: ${p.title} (photos 0-${p.images.length - 1})`).join("\n");

  const photoRule = products.length
    ? `PHOTOS: "photo" is "product.photo" using the numbers in the catalogue below (for example "4.1"), or null. Only use a photo when the post or slide is clearly about that product, and when in doubt use null. Prefer photo 0 for the main product shot and later numbers for lifestyle shots. Never put photos on more than 3 slides.\nCATALOGUE:\n${catalogue}`
    : `PHOTOS: always set "photo" to null.`;
  const common = `You write the short words that go ON a social media graphic for ${brandName}, an Australian baby-goods brand. Use ONLY ideas and facts already in the caption: no new claims, prices, dates or product features. Australian English. No em dashes or en dashes. No emoji. Short and plain.`;
  const system = carousel
    ? `${common}
Plan a ${n}-slide Instagram carousel from the caption. Slide 1 is the cover (a hook), the middle slides each make ONE point from the caption, the last slide is the call to action. Reply with JSON only, no fences:
{"slides":[{"kind":"cover|point|cta","kicker":"2-4 words","line1":"headline, max 50 chars","line2":"optional, max 36 chars (cover and cta only)","sub":"optional, max 120 chars (point slides)","photo":null}],"cta":"max 28 chars, e.g. Link in bio"}
${photoRule}`
    : `${common}
Reply with JSON only, no fences:
{"layout":"bold|soft|list","kicker":"2-4 words, label above the headline","line1":"main headline, max 55 chars","line2":"optional second line, max 40 chars (bold/soft only)","sub":"optional, max 110 chars (list only)","items":["2-4 short checklist items, max 28 chars each (list only)"],"cta":"max 28 chars, e.g. Link in bio","photo":null}
Use "list" only when the post is about a checklist or list. ${wanted ? `Use layout "${wanted}".` : "Otherwise pick bold or soft."}
${photoRule}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1800, system, messages: [{ role: "user", content: `Caption:\n${draft.caption}\n\nVisual direction (for context): ${draft.visual_direction ?? ""}` }] }),
  });
  const out = await r.json().catch(() => null);
  const text: string = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  let raw: any;
  try { raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Couldn't work out the graphic wording. Try again." }, { status: 502 }); }
  const cta = clean(raw.cta, 32) || "Link in bio";

  // Work out each slide's copy (and fetch its photo) before rendering.
  let plan: (Omit<GraphicCopy, "photo"> & { ref?: unknown })[];
  if (carousel) {
    const slides: any[] = Array.isArray(raw.slides) ? raw.slides.slice(0, 6) : [];
    if (slides.length < 2) return NextResponse.json({ error: "Couldn't plan the carousel. Try again." }, { status: 502 });
    plan = slides.map((s, i) => {
      const last = i === slides.length - 1;
      const kind = last ? "cta" : i === 0 ? "cover" : "point";
      const base = { kicker: clean(s.kicker, 32), line1: clean(s.line1, 64), line2: clean(s.line2, 44) || undefined, sub: clean(s.sub, 140) || undefined, cta: kind === "cta" ? cta : "Swipe", progress: { i, n: slides.length }, ref: s.photo };
      return kind === "point" ? { ...base, layout: "point" as const } : { ...base, layout: (kind === "cta" ? "soft" : "bold") as "soft" | "bold" };
    });
  } else {
    const layout = wanted ?? (["bold", "soft", "list"].includes(raw.layout) ? raw.layout : "bold");
    plan = [{
      layout, kicker: clean(raw.kicker, 32), line1: clean(raw.line1, 70), line2: clean(raw.line2, 50) || undefined, sub: clean(raw.sub, 130) || undefined,
      items: Array.isArray(raw.items) ? raw.items.map((x: unknown) => clean(x, 34)).filter(Boolean) : undefined, cta, ref: raw.photo,
    }];
    if (plan[0].layout === "list" && !(plan[0].items?.length)) plan[0].layout = "bold";
  }
  if (plan.some(p => !p.line1)) return NextResponse.json({ error: "A headline was missing. Try again." }, { status: 502 });

  const origin = new URL(req.url).origin;
  const get = async (p: string) => { const x = await fetch(origin + p.split("/").map(encodeURIComponent).join("/")); if (!x.ok) throw new Error(`asset ${p} ${x.status}`); return x.arrayBuffer(); };
  const toData = (buf: ArrayBuffer) => `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  const logoPaths = [...new Set([style.bold.logo.src, style.soft.logo.src, style.list.logo.src])];
  let fonts: { name: string; data: ArrayBuffer; weight: 300 | 600 | 800; style: "normal" }[];
  const logos: Record<string, string> = {};
  try {
    const [f3, f6, f8] = await Promise.all([get("/fonts/outfit-300.woff"), get("/fonts/outfit-600.woff"), get("/fonts/outfit-800.woff")]);
    fonts = [{ name: "Outfit", data: f3, weight: 300, style: "normal" }, { name: "Outfit", data: f6, weight: 600, style: "normal" }, { name: "Outfit", data: f8, weight: 800, style: "normal" }];
    await Promise.all(logoPaths.map(async p => { logos[p] = toData(await get(p)); }));
  } catch (e: any) { return NextResponse.json({ error: `Couldn't load fonts or logo: ${e.message}` }, { status: 500 }); }

  const mine = userFile && userFile.size ? await userPhoto(userFile) : undefined;
  if (userFile && userFile.size && !mine) return NextResponse.json({ error: "Couldn't read that photo. Try a JPG or PNG." }, { status: 400 });
  const coverOnly = !!mine && body.coverOnly === true && carousel;

  const height = draft.format === "story" || draft.format === "reel" ? 1920 : 1350;
  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const stamp = Date.now();
  let urls: string[];
  try {
    urls = await Promise.all(plan.map(async (p, k) => {
      if (coverOnly && k > 0) return "";
      const photo = k === 0 && mine && p.layout !== "list" ? mine : await productPhoto(products, p.ref);
      const { ref: _ref, ...rest } = p; void _ref;
      const copy: GraphicCopy = { ...rest, photo: photo?.data, photoFit: photo?.fit, photoAspect: photo?.aspect, layout: photo && (p.layout === "bold" || p.layout === "soft") && !carousel ? "photo" : photo && p.layout === "bold" ? "photo" : p.layout };
      const png = await new ImageResponse(buildGraphic(copy, style, logos, height), { width: 1080, height, fonts }).arrayBuffer();
      const path = `${id}/${stamp}-${k + 1}.png`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, new Uint8Array(png), { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(upErr.message);
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }));
  } catch (e: any) { return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 500 }); }

  // Cover-only keeps the draft's other slides.
  if (coverOnly) urls = [urls[0], ...(Array.isArray(draft.images) && draft.images.length > 1 ? draft.images.slice(1) : urls.slice(1).filter(Boolean))];
  const { data, error } = await sb.from("social_drafts").update({ image_url: urls[0], images: urls, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data, urls });
}
