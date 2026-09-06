import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/zazu-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask Davy" assistant for zazu-kids.com.au. Zazu-only: answers from the
// knowledge file (FAQs, manuals, videos, guides, policies) plus a live product
// list from the Zazu store, and hands off to the contact form when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://zazu-kids.com.au", "https://www.zazu-kids.com.au", "https://9d6zji-bd.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://zazu-kids.com.au",
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
  const cred = storeCreds().find(c => c.id === 6 || /zazu/i.test(c.name));
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
  `WARRANTY AND RETURNS\n${K.policies.warranty}`,
  `SLEEP GUIDES\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `MANUALS (PDF)\n${K.manuals.map((m: any) => `- ${m.label}: ${m.url}`).join("\n")}`,
  `VIDEOS (YouTube)\n${K.videos.map((v: any) => `- ${v.label}: https://www.youtube.com/watch?v=${v.url}`).join("\n")}`,
  `PRODUCT FAQS\n${K.faq.map((f: any) => `[${f.product}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are Davy, the friendly sleep helper on zazu-kids.com.au, the official Australian home of Zazu (distributed by Coolkidz Australia, Melbourne). You help parents choose and set up Zazu products and answer questions about orders, shipping, warranty and returns for this store.

Rules:
- Zazu only. If asked about anything unrelated to Zazu products, sleep routines for babies and toddlers, or this store, say kindly that you can only help with Zazu and offer to help with that.
- Be warm, plain and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis. Australian English. Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent products, prices, stock, delivery dates, order status or policies. If it's not in your knowledge, say so and point to the contact form (/pages/contact); Coolkidz replies within one to two working days.
- You cannot see orders or accounts. For "where is my order", ask them to check the shipping confirmation email or use the contact form with their order number.
- Every link must be a markdown link like [Shipping](/pages/shipping); never paste a bare path or URL. Use the relative page links, product links (/products/HANDLE), manuals and videos. One or two links per reply, not a wall.
- For "how do I" questions about Sam, Davy, Emmy, Lou, Dex or the projectors, first give the two or three actual steps from the FAQs, then link the single most specific how-to video for that task (for example "Set OK-to-wake" for wake-up time) rather than the general support page.
- Age fit: sleep trainer clocks suit from about 2 years; white noise, nightlights and projectors suit from birth; Robby the Rocker is for prams. If a product is sold out, say "back soon" and suggest an alternative or the contact form for notification.
- Mention "buy any 2, save 20%" only when someone is choosing between products or asks about deals.
- Never give medical advice. For a child who seems unwell, breathing issues, or safe-sleep questions beyond product use, suggest they speak with their GP, maternal and child health nurse, or Red Nose Australia.
- If someone shares personal details, don't repeat them back. Keep answers about the products.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | type | price AUD | in stock | tags)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | $${p.price} | ${p.available ? "yes" : "back soon"} | ${p.tags.join(", ")}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ZAZU_CHAT_MODEL || "claude-sonnet-5",
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

/* ---- best-effort log to Supabase (table zazu_chat_logs; see supabase/zazu_chat_logs.sql) ---- */
async function log(row: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/zazu_chat_logs`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(row) }).catch(() => null);
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
    after(() => { const row = { session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }; log(row); logAssistant({ brand: "zazu", ...row }); });
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Davy is having a nap. Try again in a moment, or use the contact form." , detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: replies a team member posted from the dashboard for this session.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const after = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  const replies = await humanReplies("zazu", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
