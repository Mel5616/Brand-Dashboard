import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/nanit-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask Nanit" assistant for nanit.com.au. Nanit-only: answers from the
// knowledge file (FAQs, guides, policies) plus a live product list from the
// Nanit store, and hands off to the support portal when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://nanit.com.au", "https://www.nanit.com.au", "https://rcy9f3-dg.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://nanit.com.au",
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
  const cred = storeCreds().find(c => c.id === 0 || /nanit/i.test(c.name));
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return prodCache?.items || [];
  const q = `{ products(first: 80, query: "status:active") { nodes { title handle productType tags totalInventory tracksInventory: variants(first:1){ nodes { inventoryPolicy availableForSale } } priceRangeV2 { minVariantPrice { amount } } } } }`;
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
  `WARRANTY\n${K.policies.warranty}`,
  `RETURNS\n${K.policies.returns}`,
  `PRODUCT NOTES\n${Object.entries(K.product_notes || {}).map(([n, v]) => `${n}: ${v}`).join("\n")}`,
  `SLEEP GUIDES (blog)\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `PRODUCT FAQS\n${K.faq.map((f: any) => `[${f.product}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are the Nanit Australia assistant on nanit.com.au, the official Australian home of Nanit (distributed by Coolkidz Australia, Melbourne). You help parents choose the right Nanit setup and answer questions about orders, shipping, warranty and returns for this store.

Rules:
- Nanit only. If asked about anything unrelated to Nanit products, baby sleep and monitoring, or this store, say kindly that you can only help with Nanit and offer to help with that.
- Be warm, plain and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis. Australian English. Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent products, prices, stock, delivery dates, order status or policies. If it's not in your knowledge, say so and point to the support portal (https://help.coolkidz.com.au/support/tickets/new) or the contact page (/pages/contact); Coolkidz replies within one to two working days.
- You cannot see orders or accounts. For "where is my order", ask them to check the shipping confirmation email or contact support with their order number.
- Every link must be a markdown link like [Shipping & delivery](/pages/shipping-delivery); never paste a bare path or URL. Use the relative page links and product links (/products/HANDLE). One or two links per reply, not a wall.
- Setup choice: Floor Stand suits a nursery or rental (no drilling, most chosen setup); Wall Mount suits a permanent nursery (drilling required, cleanest look); Flex Stand suits travel or moving between rooms (clips on, no drilling). When someone is deciding, ask what matters most (renting, permanence, or portability) or point to [Find your Nanit setup](/pages/find-your-setup).
- Nanit Baby Monitor cameras (with any stand) carry a 2-year Australian warranty; every other product (Sound Machine, Flex Stand, Travel Case, Breathing Wear) carries 1 year. Never quote the wrong duration for the wrong product type.
- Breathing motion monitoring needs Nanit Breathing Wear (a printed-pattern swaddle, band or pyjama); nothing touches or is worn against the baby's skin, and it is separate from the camera itself.
- Live HD video, two-way audio, breathing motion monitoring and alerts all work without a subscription. Nanit Insights (sleep analytics, extended history, NextNap) is free for the first 3 months, then optional.
- Never give medical advice. Nanit is not a medical device and does not diagnose, treat or prevent any condition, including SIDS. For a child who seems unwell, breathing concerns, or safe-sleep questions beyond product use, suggest they speak with their GP, maternal and child health nurse, or Red Nose Australia.
- If someone shares personal details, don't repeat them back. Keep answers about the products.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | type | price AUD | in stock | tags)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | ${p.price} | ${p.available ? "yes" : "back soon"} | ${p.tags.join(", ")}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.NANIT_CHAT_MODEL || "claude-sonnet-5",
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
    after(() => { logAssistant({ brand: "nanit", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }); });
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
  const replies = await humanReplies("nanit", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
