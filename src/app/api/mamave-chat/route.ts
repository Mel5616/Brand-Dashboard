import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/mamave-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask Mamave" assistant for mamave.com.au. Mamave-only: answers from the
// knowledge file (products, FAQs, ingredients glossary, guides, policies) plus a live
// product list from the Mamave store, and hands off to support when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://mamave.com.au", "https://www.mamave.com.au", "https://mamave-baby.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8376", "http://127.0.0.1:8376"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://mamave.com.au",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
});
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) }); }

/* ---- rate limit: 20 messages per 10 minutes per IP ---- */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), win = now - 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter(t => t > win);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 20;
}

/* ---- live products (cached 10 min) ---- */
type Prod = { title: string; handle: string; type: string; price: string; available: boolean; tags: string[] };
let prodCache: { at: number; items: Prod[] } | null = null;
async function products(): Promise<Prod[]> {
  if (prodCache && Date.now() - prodCache.at < 10 * 60 * 1000) return prodCache.items;
  const cred = storeCreds().find(c => /mamave/i.test(c.name) || c.domain === "mamave-baby.myshopify.com");
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return prodCache?.items || [];
  const q = `{ products(first: 50, query: "status:active") { nodes { title handle productType tags tracksInventory: variants(first:1){ nodes { inventoryPolicy availableForSale } } priceRangeV2 { minVariantPrice { amount } } } } }`;
  const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store" }).catch(() => null);
  const j = await res?.json().catch(() => null);
  const nodes: any[] = j?.data?.products?.nodes || [];
  const items: Prod[] = nodes.map(n => ({ title: n.title, handle: n.handle, type: n.productType, price: Number(n.priceRangeV2?.minVariantPrice?.amount || 0).toFixed(2), available: !!n.tracksInventory?.nodes?.[0]?.availableForSale, tags: n.tags || [] }));
  if (items.length) prodCache = { at: Date.now(), items };
  return items;
}

/* ---- prompt ---- */
const K = knowledge as any;
const STATIC = [
  `STORE\n${Object.entries(K.store).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `OFFERS\n${K.offers.join("\n")}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `SHIPPING\n${K.policies.shipping}`,
  `RETURNS\n${K.policies.returns}`,
  `TRAVEL MINIS\n${K.travel_minis}`,
  `PRODUCTS (RRP inc GST; each links to /products/HANDLE)\n${K.products.map((p: any) => `${p.name} (${p.range} range, ${p.type}): $${p.price}; handle ${p.handle}${p.goldens?.length ? `; golden ingredients: ${p.goldens.join(", ")}` : ""}${p.faqs?.length ? `\n  ${p.faqs.map((f: any) => `Q: ${f[0]} A: ${f[1]}`).join("\n  ")}` : ""}`).join("\n\n")}`,
  `FAQS\n${K.faq.map((f: any) => `[${f.category}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
  `JOURNAL GUIDES (blog)\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `INGREDIENTS GLOSSARY\n${K.ingredients.map((i: any) => `${i.name}: ${i.about}`).join("\n")}`,
].join("\n\n");

const PERSONA = `You are the Mamave assistant on mamave.com.au, the official home of Mamave, Australian made pregnancy safe skincare for mums and bubs, formulated by Georgie, a cosmetic development chemist, and distributed by Coolkidz Australia in Melbourne. You help parents choose the right product, explain ingredients, and answer questions about orders, shipping, subscriptions, bundles and returns for this store.

Rules:
- Mamave only. If asked about anything unrelated to Mamave skincare, pregnancy or baby skincare routines with these products, or this store, say kindly that you can only help with Mamave and offer to help with that.
- You give general product information only, never medical advice. Never diagnose or promise to treat any condition (eczema, rashes, stretch marks, cradle cap or anything else); you may describe what a formula is designed to support. For medical concerns, or before use with a health condition, tell people to speak to their GP, midwife or pharmacist. Suggest patch testing on new skin.
- Be warm, plain and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis. No em dashes; use commas, colons or full stops. Never start a sentence with "And". Australian English. Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent products, prices, stock, delivery dates, order status, ingredients or policies. If it's not in your knowledge, say so and point to [Contact Us](/pages/contact-us) or support@mamave.com.au.
- You cannot see orders or accounts. For "where is my order", ask them to check the tracking email or contact support with their order number.
- Every link must be a markdown link like [Compare the Range](/pages/compare); never paste a bare path or URL. Use relative page links and product links (/products/HANDLE). One or two links per reply, not a wall.
- Choosing for mum: Mumma's Oil is the concentrated massage oil for skin elasticity and the appearance of stretch marks, applied up to three times a day. Mumma's Moisturiser is the daily cream with vitamin C rich pomegranate and cranberry. Many mums use both: oil first, moisturiser to seal it in. Mumma's Soak is the bath ritual and Mumma's Scrub the gentle exfoliant. When someone is deciding, ask their stage and skin concern, or point to [Compare the Range](/pages/compare).
- Choosing for bub: Bubba's Wash is the pH balanced all in one for hair and body from newborn. Bubba's Moisturiser hydrates daily after the bath. Bubba's Barrier Cream protects at nappy changes. Bubba's Massage Oil is for baby massage and gently supports cradle cap care.
- Travel minis are 30mL versions for hospital bags, travel and trying before buying full size. They do not count toward the 3+ bundle discount.
- Savings: 3 or more full size products saves 15% automatically ([Build Your Own Bundle](/pages/build-a-bundle)). Refill & Save subscriptions save 10% with delivery every 4, 6 or 8 weeks; subscription and bundle savings do not stack. Free standard shipping over $75 in Australia.
- Stock: if the live list says a product is back soon, say so and suggest the closest alternative in the range.
- If someone shares personal or health details, don't repeat them back. If someone seems distressed or asks about a reaction, tell them to stop using the product and speak to a health professional or call 13 11 26 (Poisons Information) if a child has swallowed product.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | type | price AUD | in stock | tags)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | ${p.price} | ${p.available ? "yes" : "back soon"} | ${p.tags.join(", ")}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.MAMAVE_CHAT_MODEL || "claude-sonnet-5",
      max_tokens: 700,
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: STATIC, cache_control: { type: "ephemeral" } },
        { type: "text", text: live },
      ],
      messages,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `anthropic ${res.status}`);
  return (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many messages. Give it a few minutes, or use the contact form." }, { status: 429, headers });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers }); }
  const raw: any[] = Array.isArray(b?.messages) ? b.messages : [];
  const messages = raw.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content || "").slice(0, 1500).trim() })).filter(m => m.content);
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ ok: false, error: "Say something first" }, { status: 400, headers });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "Assistant not configured" }, { status: 503, headers });
  try {
    const reply = await ask(messages, await products());
    const q = messages[messages.length - 1].content;
    after(() => { logAssistant({ brand: "mamave", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }); });
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Something went wrong. Try again in a moment, or use the contact form.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: replies a team member posted from the dashboard for this session.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const after = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  const replies = await humanReplies("mamave", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
