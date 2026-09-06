import { NextResponse, after } from "next/server";
import knowledge from "@/data/frida-knowledge.json";
import { logAssistant } from "@/lib/assistantLog";

// Public "Ask Frida" assistant for fridaaustralia.com.au. Frida-only: answers from
// the knowledge file (policies, kit contents, FAQs, guides, pages) plus the live
// public product list, and hands off to the contact page when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://fridaaustralia.com.au", "https://www.fridaaustralia.com.au", "https://aqegfh-j1.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:9292"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://fridaaustralia.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
type Prod = { title: string; handle: string; type: string; price: string; available: boolean; variants: string };
let prodCache: { at: number; items: Prod[] } | null = null;
async function products(): Promise<Prod[]> {
  if (prodCache && Date.now() - prodCache.at < 10 * 60 * 1000) return prodCache.items;
  const res = await fetch("https://fridaaustralia.com.au/products.json?limit=50", { cache: "no-store", headers: { accept: "application/json" } }).catch(() => null);
  const j = await res?.json().catch(() => null);
  const nodes: any[] = j?.products || [];
  const items: Prod[] = nodes
    .filter(n => !/100-off/.test(n.handle))
    .map(n => {
      const vs: any[] = n.variants || [];
      const avail = vs.some(v => v.available);
      const price = Math.min(...vs.map(v => Number(v.price) || 0)).toFixed(2);
      const variants = vs.length > 1 ? vs.map(v => `${v.title} $${Number(v.price).toFixed(2)}`).join(", ") : "";
      return { title: n.title, handle: n.handle, type: n.product_type, price, available: avail, variants };
    });
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
  `GIFT CARDS\n${K.policies.gift_cards}`,
  `KIT CONTENTS (authoritative)\n${Object.entries(K.kits).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `GUIDES\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `FAQS\n${K.faq.map((f: any) => `[${f.product}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
].join("\n\n");

const PERSONA = `You are the Frida Australia helper ("Ask Frida") on fridaaustralia.com.au, the official Australian home of Frida Baby and Frida Mom, distributed by Coolkidz Australia in Braeside, Victoria. You help parents and health professionals choose and use Frida products, prepare for birth and recovery, and answer questions about shipping, returns, stockists and this store.

Rules:
- Frida only. If asked about anything unrelated to Frida products, pregnancy, birth, postpartum recovery, baby care basics, or this store, say kindly that you can only help with Frida and offer to help with that.
- Calm, plain, warm and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis, no jokes about bodily fluids. Australian English (mum, labour, colour). Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent products, prices, stock, delivery dates, order status or policies. If it is not in your knowledge, say so and point to the contact page (/pages/contact); the team replies within one to two working days.
- You cannot see orders or accounts. For "where is my order", ask them to check the shipping confirmation email or use the contact page with their order number.
- Every link must be a markdown link like [Hospital bag checklist](/pages/what-to-pack-in-your-hospital-bag); never paste a bare path or URL. Use the relative page links and product links (/products/HANDLE). One or two links per reply, not a wall.
- Products are for comfort, hygiene and care. Never say a product treats, cures, heals, relieves pain, prevents infection or is clinically proven. Use "designed for", "cooling comfort", "helps clear". Never give medical advice or a diagnosis. For anything about a specific person's symptoms, bleeding, wounds, fever, a baby's breathing, feeding problems or safe sleep, say clearly that a midwife, child health nurse, GP or pharmacist should be asked, and for emergencies call 000. For perinatal mental health mention PANDA 1300 726 306.
- Kit contents: the Postpartum Recovery Kit does NOT include the peri bottle or the gown. Only the Labour & Delivery Kit includes them. Never say otherwise.
- If a product is sold out, say "back soon" and suggest the closest alternative or the contact page to be notified.
- Mention offers only when someone is choosing between products, asks about deals, or the offer clearly applies to what they are buying.
- If someone shares personal details, do not repeat them back. Keep answers about the products and the store.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | type | from price AUD | in stock | options)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | $${p.price} | ${p.available ? "yes" : "back soon"} | ${p.variants}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.FRIDA_CHAT_MODEL || process.env.ZAZU_CHAT_MODEL || "claude-sonnet-5",
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
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many messages. Give it a few minutes, or use the contact page." }, { status: 429, headers });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers }); }
  const raw: any[] = Array.isArray(b?.messages) ? b.messages : [];
  const messages = raw.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content || "").slice(0, 1500).trim() })).filter(m => m.content);
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ ok: false, error: "Say something first" }, { status: 400, headers });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "Assistant not configured" }, { status: 503, headers });
  try {
    const reply = await ask(messages, await products());
    const q = messages[messages.length - 1].content;
    after(() => logAssistant({ brand: "frida", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }));
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "The helper is busy for a moment. Try again shortly, or use the contact page.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}
