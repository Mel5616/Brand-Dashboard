import { NextResponse, after } from "next/server";
import knowledge from "@/data/coolkidz-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// Public "Ask Coolkidz" assistant for coolkidz.com.au. Unlike the brand
// assistants it covers every brand Coolkidz distributes, so it can suggest
// products across brands (mix-and-save, sets, the gift registry) and answer
// trade questions from retailers and global brands. Facts come from
// coolkidz-knowledge.json (built from each brand's fact sheet by
// scripts/build_coolkidz_knowledge.py) plus the live coolkidz.com.au catalogue.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://coolkidz.com.au", "https://www.coolkidz.com.au", "https://ee807f-3c.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:9292", "http://127.0.0.1:9292"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://coolkidz.com.au",
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
type Prod = { title: string; handle: string; vendor: string; type: string; price: string; available: boolean };
let prodCache: { at: number; items: Prod[] } | null = null;
async function products(): Promise<Prod[]> {
  if (prodCache && Date.now() - prodCache.at < 10 * 60 * 1000) return prodCache.items;
  const items: Prod[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`https://coolkidz.com.au/products.json?limit=250&page=${page}`, { cache: "no-store", headers: { accept: "application/json" } }).catch(() => null);
    const j = await res?.json().catch(() => null);
    const nodes: any[] = j?.products || [];
    for (const n of nodes) {
      const vs: any[] = n.variants || [];
      const prices = vs.map(v => Number(v.price) || 0).filter(p => p > 0);
      if (!prices.length) continue;
      items.push({ title: n.title, handle: n.handle, vendor: String(n.vendor || "").replace(/( Wagons)? Australia$/, ""), type: n.product_type, price: Math.min(...prices).toFixed(2), available: vs.some(v => v.available) });
    }
    if (nodes.length < 250) break;
  }
  if (items.length) prodCache = { at: Date.now(), items };
  return items;
}

/* ---- link guard: a relative link must exist on coolkidz.com.au ---- */
const PAGES = ["/pages/sets", "/pages/gift-registry", "/pages/same-day-delivery-terms", "/policies/refund-policy", "/pages/become-a-stockist",
  "/pages/partner-with-us", "/pages/catalogues", "/pages/events", "/pages/help", "/pages/contact", "/pages/our-brands", "/pages/business",
  "/pages/for-retailers", "/pages/about", "/pages/delivery", "/pages/learning-hub", "/collections/all", "/collections/nursery-and-sleep", "/collections/out-and-about",
  "/collections/first-weeks", "/blogs/news", "/cart"];
function guardLinks(text: string, prods: Prod[]) {
  const ok = new Set([...PAGES, ...prods.map(p => `/products/${p.handle}`)]);
  return text.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (m, label, path) => {
    const bare = path.split("#")[0];
    if (ok.has(bare.split("?")[0]) || bare.startsWith("/collections/vendors?q=")) return m;
    return label;
  });
}

/* ---- prompt ---- */
const K = knowledge as { brands: Record<string, { site: string; facts: string }> };
const BRAND_FACTS = Object.entries(K.brands).map(([name, b]) => `=== ${name} (brand website: ${b.site}) ===\n${b.facts}`).join("\n\n");

const SHOP = `ABOUT COOLKIDZ
Coolkidz Australia Pty Ltd is the Australian distributor of UPPAbaby, Nanit, Gaia Baby, WonderFold, Magic, Frida, ZAZU, MiaMily, smarTrike, Mamave, Matchstick Monkey and Hannie, for over 25 years. Showroom: 1 Beyer Road, Braeside VIC 3195 (call ahead). Phone 1300 722 302. Email info@coolkidz.com.au. Product help, warranty and returns for every brand: help.coolkidz.com.au.
coolkidz.com.au sells every brand in one cart. Single products are the same price as each brand's own Australian website.
MIX AND SAVE: the saving depends on how many different brands are in one order: 5% for two brands, 10% for three, 15% for four or more. Applied at checkout. This is the only discount on coolkidz.com.au.
CURATED SETS: ready-made mixed-brand sets at /pages/sets (The nursery, Hospital bag and home, Sleep sorted, Bath and care, Out the door, Baby number two).
GIFT REGISTRY: /pages/gift-registry. Free, every brand on one list, one share link, bought gifts come off the list automatically, no accounts. Press "Add to gift registry" on any product page.
DELIVERY AND RETURNS: standard delivery is free on every order Australia-wide (details at /pages/delivery); everything ships from the Coolkidz warehouse and large items like cots or wagons may arrive separately; same-day delivery terms for eligible Melbourne postcodes at /pages/same-day-delivery-terms; refund policy at /policies/refund-policy; faulty products via help.coolkidz.com.au.
SHOP BY MOMENT: /collections/nursery-and-sleep, /collections/out-and-about, /collections/first-weeks. Brand pages: /collections/vendors?q=BRAND (e.g. /collections/vendors?q=UPPAbaby).
FOR BUSINESS: retailers can apply to stock the brands at /pages/become-a-stockist (sales team, product training, merchandising, national delivery from a 7,000 sqm warehouse). Global brands looking for an Australian distributor: /pages/partner-with-us (distribution, retail network, a 12-person marketing team, their own Australian brand website, customer care). Catalogues at /pages/catalogues. Upcoming baby expos at /pages/events.`;

const PERSONA = `You are Ask Coolkidz, the on-site guide for coolkidz.com.au, the Australian home of twelve baby brands. You help parents and gift-givers choose across brands (prams, capsules, nursery furniture, monitors, sleep, travel, feeding, baby and postpartum care), explain mix-and-save, sets and the gift registry, and point retailers and global brands to the right business page.

Rules:
- Answer ONLY from the Coolkidz details, the brand fact sheets and the live product list below. Never invent specifications, prices, stock, compatibility, delivery dates, order status, discounts or policies. If you don't have a detail, say so and offer 1300 722 302 or help.coolkidz.com.au.
- Recommend products from the live list with links to coolkidz.com.au, e.g. [Vista V3](/products/handle). Relative links may ONLY be a /products/ link copied exactly from the live list, or one of the coolkidz.com.au pages named in the Coolkidz details. Brand fact sheets describe the brand's own website: never turn their paths into relative links. When it genuinely helps, suggest something from another brand that goes with it, and mention the mix-and-save saving once, lightly. Never pressure.
- Brand fact sheets sometimes mention offers, bundles, codes or "buy 2 save" deals that run only on that brand's own website. Never offer or mention those on coolkidz.com.au; the only saving here is mix-and-save.
- For a detailed guide that only exists on a brand's own site, you may link to that brand website (full URL from the fact sheet).
- If you need to know more before recommending (age, space, budget, how they'll use it), ask one short question first.
- Safety: follow each brand's safety rules exactly. For medical questions about a baby or mother, give the general product information only and suggest speaking with a GP, midwife or child health nurse; for emergencies say call 000.
- Warm, calm and brief: under 130 words, two to five short sentences, no bullet lists unless comparing products, always finish the sentence. Australian English. Prices in AUD with a dollar sign. No emojis. No em dashes; use commas, colons or full stops.
- Every link must be a markdown link like [Curated sets](/pages/sets); never paste a bare path or URL. One to three links per reply. End with ONE short next step.
- You cannot see orders or accounts. For "where is my order", ask them to check their dispatch email or call with their order number.
- Out-of-stock products: say so plainly and suggest the closest in-stock alternative.
- If someone shares personal details, do not repeat them back.
- Never criticise one of the twelve brands to promote another; compare honestly on facts.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], prods: Prod[], page: string) {
  const where = page ? `\n\nCURRENT PAGE: the visitor is on ${page}. When they say "this one", they mean the product or page at that path.` : "";
  const live = `LIVE PRODUCTS ON COOLKIDZ.COM.AU (brand | title | link | type | from price AUD | in stock)\n${prods.map(p => `${p.vendor} | ${p.title} | /products/${p.handle} | ${p.type} | $${p.price} | ${p.available ? "yes" : "no"}`).join("\n")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.COOLKIDZ_CHAT_MODEL || process.env.FRIDA_CHAT_MODEL || "claude-sonnet-5",
      max_tokens: 800,
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: `${SHOP}\n\nBRAND FACT SHEETS\n${BRAND_FACTS}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: live, cache_control: { type: "ephemeral" } },
        { type: "text", text: where || "No current page." },
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
    const prods = await products();
    const reply = guardLinks(await ask(messages, prods, String(b?.page || "").slice(0, 200)), prods);
    const q = messages[messages.length - 1].content;
    after(() => logAssistant({ brand: "coolkidz", session: String(b?.session || "").slice(0, 64) || null, page: String(b?.page || "").slice(0, 200) || null, question: q, answer: reply }));
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Ask Coolkidz is busy for a moment. Try again shortly, or call 1300 722 302.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: any replies a team member posted from the dashboard for this session.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const afterId = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  const replies = await humanReplies("coolkidz", session, afterId);
  return NextResponse.json({ ok: true, replies }, { headers });
}
