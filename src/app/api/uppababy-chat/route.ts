import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/uppababy-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public assistant for uppababy.com.au, the same shape as Ask Davy on Zazu.
// Answers from the knowledge file, which is generated in the uppababy-site repo
// by scripts/build_knowledge.py from the same data the site itself is built
// from, plus a live product list from the store. Hands off to support when it
// cannot help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://uppababy.com.au", "https://www.uppababy.com.au", "https://6d6483.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://uppababy.com.au",
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

/* ---- live products (cached 10 min) ----
   Prices and stock are deliberately absent from the knowledge file. They belong
   here, read from the store at answer time, so the assistant cannot quote a
   price that changed last week. */
type Prod = { title: string; handle: string; type: string; price: string; available: boolean; tags: string[] };
let prodCache: { at: number; items: Prod[] } | null = null;
async function products(): Promise<Prod[]> {
  if (prodCache && Date.now() - prodCache.at < 10 * 60 * 1000) return prodCache.items;
  const cred = storeCreds().find(c => /uppababy/i.test(c.name) || /6d6483/.test(c.domain));
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return prodCache?.items || [];
  const q = `{ products(first: 250, query: "status:active") { nodes { title handle productType tags variants(first:1){ nodes { availableForSale } } priceRangeV2 { minVariantPrice { amount } } } } }`;
  const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store" }).catch(() => null);
  const j = await res?.json().catch(() => null);
  const nodes: any[] = j?.data?.products?.nodes || [];
  const items: Prod[] = nodes.map(n => ({ title: n.title, handle: n.handle, type: n.productType, price: Number(n.priceRangeV2?.minVariantPrice?.amount || 0).toFixed(2), available: !!n.variants?.nodes?.[0]?.availableForSale, tags: n.tags || [] }));
  if (items.length) prodCache = { at: Date.now(), items };
  return items;
}

/* ---- prompt ---- */
const K = knowledge as any;
const STATIC = [
  `STORE\n${Object.entries(K.store).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `COLLECTIONS\n${Object.entries(K.collections).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `THE RANGE\n${K.models.map((m: any) => `${m.model} — ${m.job}\n${m.intro}\nFacts: ${m.facts}`).join("\n\n")}`,
  `MESA CAR CAPSULE\n${K.capsule.intro}\nDirect fit: ${JSON.stringify(K.capsule.direct_fit)}\nWith adapters: ${JSON.stringify(K.capsule.adapter_fit)}\nApproval: ${JSON.stringify(K.capsule.approval)}`,
  `ADAPTERS AND WHAT FITS WHAT\n${JSON.stringify(K.adapters)}`,
  `STOCKISTS: ${K.stockists.count} shops, listed with addresses and phone numbers at ${K.stockists.page}. By state:\n${Object.entries(K.stockists.by_state).map(([s, v]: any) => `${s}: ${v.join("; ")}`).join("\n")}`,
  `WRITTEN ANSWERS\n${K.faq.map((f: any) => `[${f.topic}] Q: ${f.q}\nA: ${f.a}${f.link ? `\nMore: ${f.link}` : ""}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are the UPPAbaby Australia assistant on uppababy.com.au, the official Australian store, distributed, warranted and serviced by Coolkidz Australia in Melbourne. You help parents choose a pram, work out what fits what, and answer questions about ownership: warranty, servicing, spare parts, delivery and returns.

Rules:
- UPPAbaby only. If asked about anything else, say kindly that you can only help with UPPAbaby and this store, and offer to help with that.
- Warm, plain and brief: under 130 words, two to five short sentences or a short list, and always finish the sentence. No emojis. Australian English. Prices in AUD with a dollar sign.
- Never invent a number. Weights, dimensions, capacities, prices, stock, delivery dates and order status come only from the knowledge below or the live product list. If a figure is not there, say you do not have it confirmed and point to the page or to support rather than estimating. This matters more than sounding complete.
- Prices and availability come from the live product list, never from memory.
- You cannot see orders or accounts. For "where is my order", ask them to check the dispatch email or contact support with their order number.
- Every link must be a markdown link like [Compare the range](/pages/product-comparison), never a bare path. One or two links per reply, not a wall.
- Choosing a pram: ask how many children, whether they need it from birth, and what the boot or the stairs are like, then recommend one model and say why. Do not list all six.
- "Will it fit my car / my boot / my pram": use the adapters and fits data. If a combination is not in it, say so rather than guessing.
- Safety questions: the Mesa is an Australian-approved capsule and the prams meet the mandatory Australian standard. Do not state a standard number, an approval code or a test result that is not in your knowledge.
- Where to buy: point to [the stockist list](/pages/store-locator), which has 106 shops with phone numbers, and mention they can also buy here with free delivery over $100.
- Never give medical advice. For anything about a child's health or safe sleep beyond product use, suggest their GP, maternal and child health nurse, or Red Nose Australia.
- If someone shares personal details, do not repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | type | price AUD | in stock | tags)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | $${p.price} | ${p.available ? "yes" : "sold out"} | ${p.tags.join(", ")}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.UPPABABY_CHAT_MODEL || "claude-sonnet-5",
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
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many messages. Give it a few minutes, or use the support page." }, { status: 429, headers });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers }); }
  const raw: any[] = Array.isArray(b?.messages) ? b.messages : [];
  const messages = raw.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content || "").slice(0, 1500).trim() })).filter(m => m.content);
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ ok: false, error: "Say something first" }, { status: 400, headers });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "Assistant not configured" }, { status: 503, headers });
  try {
    const reply = await ask(messages, await products());
    const q = messages[messages.length - 1].content;
    after(() => { logAssistant({ brand: "uppababy", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }); });
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "The assistant is unavailable for a moment. Try again shortly, or see the support page.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: replies a team member posted from the dashboard.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const afterId = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  return NextResponse.json({ ok: true, replies: await humanReplies("uppababy", session, afterId) }, { headers });
}
