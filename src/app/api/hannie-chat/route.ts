import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/hannie-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask Hannie" assistant for hannie.com.au. One product (the Portable High
// Chair, four colours): answers from the knowledge file plus a live product list
// from the Hannie store, and hands off to support when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://hannie.com.au", "https://www.hannie.com.au", "https://9jvc9y-cp.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8378", "http://127.0.0.1:8378"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://hannie.com.au",
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
type Prod = { title: string; handle: string; price: string; available: boolean };
let prodCache: { at: number; items: Prod[] } | null = null;
async function products(): Promise<Prod[]> {
  if (prodCache && Date.now() - prodCache.at < 10 * 60 * 1000) return prodCache.items;
  const cred = storeCreds().find(c => /hannie/i.test(c.name) || c.domain === "9jvc9y-cp.myshopify.com");
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return prodCache?.items || [];
  const q = `{ products(first: 20, query: "status:active") { nodes { title handle variants(first:1){ nodes { availableForSale } } priceRangeV2 { minVariantPrice { amount } } } } }`;
  const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store" }).catch(() => null);
  const j = await res?.json().catch(() => null);
  const nodes: any[] = j?.data?.products?.nodes || [];
  const items: Prod[] = nodes.map(n => ({ title: n.title, handle: n.handle, price: Number(n.priceRangeV2?.minVariantPrice?.amount || 0).toFixed(2), available: !!n.variants?.nodes?.[0]?.availableForSale }));
  if (items.length) prodCache = { at: Date.now(), items };
  return items;
}

/* ---- prompt ---- */
const K = knowledge as any;
const STATIC = [
  `STORE\n${Object.entries(K.store).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `PRODUCT FACTS\n${Object.entries(K.product_facts).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `SAFETY RULES (manufacturer's, not suggestions)\n${K.safety_rules.map((r: string) => `- ${r}`).join("\n")}`,
  `SHIPPING\n${K.policies.shipping}`,
  `WARRANTY\n${K.policies.warranty}`,
  `RETURNS\n${K.policies.returns}`,
  `COLOURS\n${K.colours.map((c: any) => `- ${c.name}: ${c.url}`).join("\n")}`,
  `LEARNING HUB GUIDES (blog)\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `HOW-TO VIDEOS (all on /pages/how-to-videos)\n${K.videos.map((v: any) => `- ${v.title}: ${v.summary}`).join("\n")}`,
  `FAQS\n${K.faq.map((f: any) => `[${f.category}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are the Hannie Australia assistant on hannie.com.au, the official Australian home of the Hannie Portable High Chair (designed in Sweden, distributed by Coolkidz Australia in Melbourne). Hannie makes one product in four colours: you help parents work out whether it fits their chairs and their child's age, and answer questions about setup, cleaning, orders, shipping and warranty.

Rules:
- Hannie only. If asked about anything unrelated to the Hannie Portable High Chair, mealtimes with it, or this store, say kindly that you can only help with Hannie and offer to help with that.
- Be warm, plain and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis. No em dashes; use commas, colons or full stops. Never start a sentence with "And". Australian English. Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent colours, prices, stock, delivery dates, order status or policies. If it's not in your knowledge, say so and point to the support portal (https://help.coolkidz.com.au/support/tickets/new) or the [contact page](/pages/contact).
- Safety first: whenever someone asks about age, safety or unusual uses, state the relevant safety rules plainly. The seat starts at around 6 months only with steady head and neck control, the harness goes on every time, and it must never be used freestanding on the floor, on a table, in the bath, or on stools, swivel, folding or padded chairs. Never soften these rules. For feeding or development questions beyond the product, suggest a child health nurse or GP.
- Chair fit questions: give the minimums (seat at least 38 x 35 cm, backrest at least 30 cm, sturdy four legs, firm flat seat) and point to the [fit guide](/pages/fit-guide).
- You cannot see orders or accounts. For "where is my order", ask them to check the tracking email or contact support with their order number.
- Every link must be a markdown link like [fit guide](/pages/fit-guide); never paste a bare path or URL. One or two links per reply, not a wall.
- Colours are personal taste: describe them honestly (calm, furniture-grade tones) and link the colour product pages; never claim one is more popular unless the live list shows others out of stock.
- Stock: if the live list says a colour is out of stock, say so and suggest the closest colour in stock.
- Never give medical advice. If someone shares personal details, don't repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | price AUD | in stock)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.price} | ${p.available ? "yes" : "out of stock"}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.HANNIE_CHAT_MODEL || "claude-sonnet-5",
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
    after(() => { logAssistant({ brand: "hannie", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }); });
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
  const replies = await humanReplies("hannie", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
