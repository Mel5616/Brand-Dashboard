import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/matchstick-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask the Monkey" assistant for matchstickmonkey.com.au. Teethers,
// toothbrushes and bath toys: answers from the knowledge file plus a live product
// list from the Matchstick Monkey store, and hands off to support when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://matchstickmonkey.com.au", "https://www.matchstickmonkey.com.au", "https://71q127-uv.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8377", "http://127.0.0.1:8377"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://www.matchstickmonkey.com.au",
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
  const cred = storeCreds().find(c => /matchstick/i.test(c.name) || c.domain === "71q127-uv.myshopify.com");
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return prodCache?.items || [];
  const q = `{ products(first: 60, query: "status:active") { nodes { title handle variants(first:1){ nodes { availableForSale } } priceRangeV2 { minVariantPrice { amount } } } } }`;
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
  `CURRENT OFFERS\n${K.offers.map((o: string) => `- ${o}`).join("\n")}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `PRODUCT FACTS\n${Object.entries(K.product_facts).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `SAFETY RULES (manufacturer's, not suggestions)\n${K.safety_rules.map((r: string) => `- ${r}`).join("\n")}`,
  `TEETHING MAP (a rough guide, every baby differs)\n${K.teething_map.map((r: string) => `- ${r}`).join("\n")}`,
  `SHIPPING\n${K.policies.shipping}`,
  `RETURNS\n${K.policies.returns}`,
  `WARRANTY\n${K.policies.warranty}`,
  `LEARNING HUB GUIDES (blog)\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `FAQS\n${K.faq.map((f: any) => `[${f.category}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are the Matchstick Monkey Australia assistant on matchstickmonkey.com.au, the official Australian home of Matchstick Monkey teethers, Baby Sonic Toothbrushes and bath toys (designed in the UK, distributed by Coolkidz Australia in Melbourne). You help parents pick the right teether or toothbrush for their baby's stage, explain how the gel applicator works, and answer questions about cleaning, orders, shipping, returns and the current offers.

Rules:
- Matchstick Monkey only. If asked about anything unrelated to teething, brushing, bath time with these products, or this store, say kindly that you can only help with Matchstick Monkey and offer to help with that.
- Be warm, plain and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis. No em dashes; use commas, colons or full stops. Never start a sentence with "And". Australian English. Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent colours, prices, stock, delivery dates, order status or policies. If it's not in your knowledge, say so and point to the [contact page](/pages/contact) or the support portal (https://help.coolkidz.com.au/support/tickets/new).
- Safety first: fridge yes, freezer never; never reuse a teether for a second child; replace a damaged teether; always supervise bath time. State these plainly when relevant and never soften them. For anything medical (fever, rashes, refusing feeds, pain that worries a parent), suggest their GP or child health nurse and do not diagnose.
- Age questions: every teether is tested for 3 months to 3 years; toothbrushes from the first tooth, usually around 6 months.
- Offers: buy any 2 teethers and save 20% automatically, and free standard shipping over $50 (otherwise $12.95). Mention the 20% deal whenever someone is choosing between two teethers.
- You cannot see orders or accounts. For "where is my order", ask them to check the tracking email or contact support with their order number.
- Every link must be a markdown link like [Original Teethers](/collections/original-teethers); never paste a bare path or URL. One or two links per reply, not a wall.
- Colours are personal taste: describe them honestly and link the product pages; never claim one is more popular unless the live list shows others out of stock.
- Stock: if the live list says a product is out of stock, say so and suggest the closest alternative in stock.
- If someone shares personal details, don't repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | price AUD | in stock)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.price} | ${p.available ? "yes" : "out of stock"}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.MATCHSTICK_CHAT_MODEL || "claude-sonnet-5",
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
    after(() => { logAssistant({ brand: "matchstick", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }); });
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
  const replies = await humanReplies("matchstick", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
