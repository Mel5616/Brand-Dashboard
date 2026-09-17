import { NextResponse, after } from "next/server";
import knowledge from "@/data/smartrike-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask Wonder" assistant for smartrike.com.au. smarTrike-only: answers from
// the fact sheet (range, policies, safety, developmental guidance, FAQs) plus the
// live public product list, may recommend one model once it knows the child's age,
// and hands off to the phone line or help centre when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://smartrike.com.au", "https://www.smartrike.com.au", "https://smartrike.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:9292", "http://127.0.0.1:9292"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://smartrike.com.au",
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

/* ---- live products from the public storefront (cached 10 min) ---- */
type Prod = { title: string; handle: string; type: string; price: string; available: boolean };
let prodCache: { at: number; items: Prod[] } | null = null;
async function products(): Promise<Prod[]> {
  if (prodCache && Date.now() - prodCache.at < 10 * 60 * 1000) return prodCache.items;
  const res = await fetch("https://smartrike.com.au/products.json?limit=50", { cache: "no-store", headers: { accept: "application/json" } }).catch(() => null);
  const j = await res?.json().catch(() => null);
  const nodes: any[] = j?.products || [];
  const items: Prod[] = nodes.map(n => {
    const vs: any[] = n.variants || [];
    const prices = vs.map(v => Number(v.price) || 0).filter(p => p > 0);
    return { title: n.title, handle: n.handle, type: n.product_type, price: prices.length ? Math.min(...prices).toFixed(2) : "see site", available: vs.some(v => v.available) };
  });
  if (items.length) prodCache = { at: Date.now(), items };
  return items;
}

/* ---- prompt ---- */
const K = knowledge as any;
const STATIC = [
  `STORE\n${Object.entries(K.store).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `RANGE\n${Object.entries(K.range).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `CHOOSING BY AGE\n${K.choosing}`,
  `SHIPPING\n${K.policies.shipping}`,
  `RETURNS\n${K.policies.returns}`,
  `WARRANTY\n${K.policies.warranty}`,
  `AIR TRAVEL\n${K.policies.air_travel}`,
  `SAFETY\n${K.safety}`,
  `DEVELOPMENT (general guidance)\n${K.development}`,
  `AWARDS\n${K.awards}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `FAQS\n${K.faq.map((f: any) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are Ask Wonder, the on-site guide for smartrike.com.au, the official Australian home of smarTrike stroller-trikes, distributed by Coolkidz Australia in Braeside, Victoria. You help parents choose between the Wonder, Wonder+, Wonder max, Wind and Wind+ trikes and the Xtend scooters, and answer questions about ages, sizes, travel, safety, delivery, returns and warranty for this store.

Rules:
- smarTrike only. If asked about anything unrelated to smarTrike products, toddler mobility, or this store, say kindly that you can only help with smarTrike and offer to help with that.
- Answer ONLY from the fact sheet below and the live product list. Never invent specifications, prices, stock, delivery dates, order status, airline allowances or policies. If it is not in the fact sheet, say you do not have that information and offer 1300 722 302 (Mon to Fri 8am to 5pm AEST) or the help centre.
- You MAY recommend one specific model when the parent has given you enough to go on: the child's age, plus how often they will use it or what matters most. If you do not yet know the child's age, ask for it in one short question before recommending.
- Warm, plain and brief: under 120 words, two to five short sentences, no bullet lists unless comparing models, and always finish the sentence. No emojis. Australian English. Prices in AUD with a dollar sign, as RRP.
- Write brand names exactly: smarTrike, Wonder, Wonder+, Wonder max (lowercase max), Wind, Wind+, Xtend.
- Every link must be a markdown link like [Compare the range](/pages/compare); never paste a bare path or URL. One or two links per reply. End with ONE short next step.
- You cannot see orders or accounts. For "where is my order", ask them to check the dispatch email or call with their order number.
- Development questions get general guidance from the fact sheet, never a diagnosis. If a parent sounds concerned about their child's development, suggest a maternal and child health nurse or GP.
- If a product is sold out, say "back soon" and suggest the closest alternative.
- If someone shares personal details, do not repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[], page: string) {
  const where = page ? `\n\nCURRENT PAGE: the visitor is on ${page}. When they say "this one" or "this trike", they mean the product or page at that path.` : "";
  const live = `LIVE PRODUCTS (title | link | type | from price AUD | in stock)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | $${p.price} | ${p.available ? "yes" : "back soon"}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.SMARTRIKE_CHAT_MODEL || process.env.FRIDA_CHAT_MODEL || "claude-sonnet-5",
      max_tokens: 700,
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: STATIC, cache_control: { type: "ephemeral" } },
        { type: "text", text: live + where },
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
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many messages. Give it a few minutes, or call 1300 722 302." }, { status: 429, headers });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers }); }
  const raw: any[] = Array.isArray(b?.messages) ? b.messages : [];
  const messages = raw.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content || "").slice(0, 1500).trim() })).filter(m => m.content);
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ ok: false, error: "Say something first" }, { status: 400, headers });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "Assistant not configured" }, { status: 503, headers });
  try {
    const reply = await ask(messages, await products(), String(b?.page || "").slice(0, 200));
    const q = messages[messages.length - 1].content;
    after(() => logAssistant({ brand: "smartrike", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }));
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Ask Wonder is busy for a moment. Try again shortly, or call 1300 722 302.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: any replies a team member posted from the dashboard for this session.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const after = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  const replies = await humanReplies("smartrike", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
