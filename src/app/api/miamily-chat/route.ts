import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import knowledge from "@/data/miamily-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask MiaMily" assistant for miamily.com.au. MiaMily-only: answers from the
// knowledge file (designs, specs, FAQs, guides, policies, stockists) plus a live
// product list from the MiaMily store, and hands off to support when it can't help.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://miamily.com.au", "https://www.miamily.com.au", "https://8717fd-c4.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8379", "http://127.0.0.1:8379"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://miamily.com.au",
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
  const cred = storeCreds().find(c => /miamily/i.test(c.name) || c.domain === "8717fd-c4.myshopify.com");
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
  `DESIGNS (RRP inc GST; every colour is its own product)\n${K.families.map((f: any) => `${f.design} (${f.collection}): RRP ${f.rrp}; ${f.capacity}; ${f.dimensions}; ${f.weight}; opening: ${f.opening}; lock: ${f.lock}; built-in seat: ${f.seat ? "yes" : "no"}; child seatbelt: ${f.child_seatbelt ? "yes" : "no"}; wheel brake: ${f.wheel_brake ? "yes" : "no"}; best for: ${f.best_for}; who rides: ${f.who_rides}; materials: ${f.materials}; features: ${f.features.join("; ")}; colours: ${f.colours}`).join("\n\n")}`,
  `SAFETY RULES (manufacturer's, not suggestions)\n${K.safety_rules.map((r: string) => `- ${r}`).join("\n")}`,
  `HOW TO LOAD A CHILD\n${K.how_to_ride.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}`,
  `JOURNAL GUIDES (blog)\n${K.guides.map((g: any) => `- ${g.title} (${g.url}): ${g.summary}`).join("\n")}`,
  `FAQS\n${K.faq.map((f: any) => `[${f.category}] Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`,
  `AUTHORISED STOCKISTS (physical stores)\n${K.stockists.map((x: string) => `- ${x}`).join("\n")}`,
].join("\n\n");

const PERSONA = `You are the MiaMily Australia assistant on miamily.com.au, the official Australian home of MiaMily ride-on luggage (Swiss-designed, distributed by Coolkidz Australia in Melbourne). You help parents pick the right case, explain how the built-in seat works, and answer questions about orders, shipping, warranty, returns and stockists for this store.

Rules:
- MiaMily only. If asked about anything unrelated to MiaMily luggage, family travel with these cases, or this store, say kindly that you can only help with MiaMily and offer to help with that.
- Be warm, plain and brief: under 120 words, two to five short sentences or a short list, and always finish the sentence. No emojis. No em dashes; use commas, colons or full stops. Australian English. Prices in AUD with a dollar sign.
- Answer from the knowledge below and the live product list. Never invent products, colours, prices, stock, delivery dates, order status or policies. If it's not in your knowledge, say so and point to the support portal (https://help.coolkidz.com.au/support/tickets/new) or the contact page (/pages/contact).
- Delivery: fast dispatch from the Melbourne warehouse, tracked, Australia-wide. There is no same-day delivery; never promise a delivery date. Check In cases do not ship to New Zealand; Carry On cases and Backpacks do.
- You cannot see orders or accounts. For "where is my order", ask them to check the tracking email or contact support with their order number.
- Every link must be a markdown link like [Which MiaMily?](/pages/compare); never paste a bare path or URL. Use the relative page links and product links (/products/HANDLE). One or two links per reply, not a wall.
- Choosing: Carry On is the original cabin ride-on (clamshell, child seatbelt). Carry On Plus adds top opening, a front pocket and a wheel brake, best for regular flyers with a toddler. Carry On Pro is lighter, front-opening and zipperless, a gate seat for teens and adults, with NO child seatbelt, so do not recommend it as a toddler ride-on. Check In and Check In Plus are the 77-litre checked versions with the same seat. The Expandable Backpack (15 to 30 litres) slides over any MiaMily handle. When someone is deciding, ask trip length, the child's age, and cabin-only or checked, or point to [Which MiaMily?](/pages/compare).
- Seat facts: patented built-in seat rated to 100 kg including luggage contents, so kids, teens and adults can sit. Child must sit unassisted, be belted in and supervised; flat surfaces only, never escalators, stairs or travelators. Say these limits whenever someone asks about safety or young children. Never state a minimum age; MiaMily sets none.
- Airline fit: the Carry On family is cabin-size for most airlines but allowances vary, so tell people to check their carrier, and point to the [Size guide](/pages/size-guide) for exact dimensions.
- Stock: if the live list says a colour is back soon, say so and suggest the closest colour in stock or an authorised stockist.
- Never give medical or safety advice beyond the product rules. If someone shares personal details, don't repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[]) {
  const live = `LIVE PRODUCTS (title | link | type | price AUD | in stock | tags)\n${prods.map(p => `${p.title} | /products/${p.handle} | ${p.type} | ${p.price} | ${p.available ? "yes" : "back soon"} | ${p.tags.join(", ")}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.MIAMILY_CHAT_MODEL || "claude-sonnet-5",
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
    after(() => { logAssistant({ brand: "miamily", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }); });
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
  const replies = await humanReplies("miamily", session, after);
  return NextResponse.json({ ok: true, replies }, { headers });
}
