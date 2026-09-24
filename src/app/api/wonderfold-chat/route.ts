import { NextResponse, after } from "next/server";
import knowledge from "@/data/wonderfold-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask WonderFold" assistant for wonderfold.com.au. WonderFold-only: answers from
// the fact sheet (range, finishes, choosing, policies, programs, FAQs) plus the live
// public product list, may recommend one model once it knows how many children ride,
// and hands off to the phone line when it can't help. Never makes medical or NDIS claims.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://wonderfold.com.au", "https://www.wonderfold.com.au", "https://wonderfold-australia.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:9292", "http://127.0.0.1:9292"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://wonderfold.com.au",
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
  const res = await fetch("https://wonderfold.com.au/products.json?limit=100", { cache: "no-store", headers: { accept: "application/json" } }).catch(() => null);
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
  `CHOOSING A SIZE AND FINISH\n${K.choosing}`,
  `ACCESSORIES\n${K.accessories}`,
  `SHIPPING\n${K.policies.shipping}`,
  `RETURNS\n${K.policies.returns}`,
  `WARRANTY\n${K.policies.warranty}`,
  `PROGRAMS\n${Object.entries(K.programs).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `WHERE TO BUY\n${K.retail}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `FAQS\n${K.faq.map((f: any) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are Ask WonderFold, the on-site guide for wonderfold.com.au, the official Australian home of WonderFold stroller wagons, distributed by Coolkidz Australia in Braeside, Victoria. You help families choose between the W2, W4 and W6 and the Elite, Luxe and Luxe Pro finishes, and answer questions about sizes, capsules, boot space, accessories, delivery, returns, warranty and the Warriors, NDIS and Whisperers programs.

Rules:
- WonderFold only. If asked about anything unrelated to WonderFold wagons, family outings with them, or this store, say kindly that you can only help with WonderFold.
- Answer ONLY from the fact sheet below and the live product list. Never invent specifications, prices, stock, folded sizes, compatibility, delivery dates, order status, discounts or policies. If it is not in the fact sheet, say you do not have that detail and offer 1300 722 302 (Mon to Fri 9am to 5pm AEST) or info@coolkidz.com.au.
- You MAY recommend one model and finish once you know how many children will ride (and ideally the youngest's age and where they will go). If you do not know how many children will ride, ask that first in one short question.
- Never describe a WonderFold as a medical device, mobility aid or therapeutic product, never say the NDIS will fund it, and never give medical or developmental advice. For additional needs, describe the wagon honestly and point to WonderFold Warriors.
- Warm, calm and brief: under 120 words, two to five short sentences, no bullet lists unless comparing models, and always finish the sentence. No urgency, no discount pressure. No emojis. Australian English. Prices in AUD with a dollar sign. No em dashes; use commas, colons or full stops. Never start a sentence with "And".
- Every link must be a markdown link like [Find your size](/pages/find-your-size); never paste a bare path or URL. One or two links per reply. End with ONE short next step.
- You cannot see orders or accounts. For "where is my order", ask them to check the dispatch email or call with their order number.
- If a product is out of stock, say so plainly and suggest the closest in-stock alternative.
- If someone shares personal details, do not repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[], page: string) {
  const where = page ? `\n\nCURRENT PAGE: the visitor is on ${page}. When they say "this one" or "this wagon", they mean the product or page at that path.` : "";
  const live = `LIVE PRODUCTS (title | link | type | from price AUD | in stock)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | $${p.price} | ${p.available ? "yes" : "back soon"}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.WONDERFOLD_CHAT_MODEL || process.env.FRIDA_CHAT_MODEL || "claude-sonnet-5",
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
    after(() => logAssistant({ brand: "wonderfold", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }));
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Ask WonderFold is busy for a moment. Try again shortly, or call 1300 722 302.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: any replies a team member posted from the dashboard for this session.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const after = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  const replies = await humanReplies("wonderfold", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
