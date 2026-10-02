import { NextResponse, after } from "next/server";
import knowledge from "@/data/coolkidz-help-knowledge.json";
import { logAssistant, humanReplies } from "@/lib/assistantLog";

// "Ask us" assistant for the Coolkidz help centre (help.coolkidz.com.au, a Freshdesk portal).
// Ask Coolkidz on coolkidz.com.au helps people choose and buy; this one helps owners: set-up,
// care, troubleshooting and warranty. Facts come first from each brand's full fact sheet (built from
// the brand's own website), then from the help centre's own articles, via
// scripts/build_coolkidz_help_knowledge.py. UPPAbaby has its own help centre and assistant.
// Conversations land in the dashboard's AI Assistants tab as brand "coolkidz-help", and team
// replies posted there come back to the visitor through GET below.
export const revalidate = 0;
export const maxDuration = 30;

const BRAND = "coolkidz-help";
const ORIGINS = new Set(["https://help.coolkidz.com.au", "https://coolkidz.freshdesk.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://help.coolkidz.com.au",
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

/* ---- knowledge ---- */
type Article = { title: string; url: string; text: string };
const K = knowledge as { brands: Record<string, { site: string; facts: string }>; articles: Article[] };
const BRAND_FACTS = Object.entries(K.brands).map(([name, b]) => `=== ${name} (brand website: ${b.site}) ===\n${b.facts}`).join("\n\n");
// Articles are listed by title only: the model links one as [exact title](help-article) and the server fills in
// the real address, so a long article number can never be paired with the wrong title.
const ARTICLES = K.articles.map(a => `=== ${a.title} ===\n${a.text}`).join("\n\n");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ARTICLE_BY_TITLE = new Map(K.articles.map(a => [norm(a.title), a.url.replace("https://help.coolkidz.com.au", "")]));

/* ---- link guard: relative links must be a help centre page we know; full links only to our own and the brands' sites ---- */
const HELP_PAGES = new Set(["/support/tickets/new", "/support/tickets", "/support/solutions", "/support/home",
  ...K.articles.map(a => a.url.replace("https://help.coolkidz.com.au", ""))]);
const HOSTS = new Set(["help.coolkidz.com.au", "coolkidz.com.au", "www.coolkidz.com.au", "help.uppababy.com.au",
  ...Object.values(K.brands).map(b => new URL(b.site).host), ...Object.values(K.brands).map(b => new URL(b.site).host.replace(/^www\./, ""))]);
// Brand-site links must be a page from the fact sheets (each checked as live when the knowledge is built) or a brand's home page.
const trim = (u: string) => u.replace(/[.,;:]+$/, "").replace(/\/$/, "");
const KNOWN_URLS = new Set([...Object.values(K.brands).flatMap(b => [b.site, ...(b.facts.match(/https:\/\/[^\s)\]"'<>]+/g) || [])]).map(trim)]);
const OUR_HOSTS = new Set(["help.coolkidz.com.au", "coolkidz.com.au", "www.coolkidz.com.au", "help.uppababy.com.au"]);
function guardLinks(text: string) {
  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (href === "help-article" || href.startsWith("/support/solutions/articles/")) {
      const path = ARTICLE_BY_TITLE.get(norm(label)); // the title decides which article, never the number
      return path ? `[${label}](${path})` : label;
    }
    if (href.startsWith("/")) return HELP_PAGES.has(href.split(/[?#]/)[0]) ? m : label;
    try {
      const u = new URL(href);
      if (!href.startsWith("https://") || !HOSTS.has(u.host)) return label;
      return OUR_HOSTS.has(u.host) || KNOWN_URLS.has(trim(href)) ? m : label;
    } catch { return label; }
  });
}

/* ---- prompt ---- */
const DESK = `ABOUT THIS HELP CENTRE
help.coolkidz.com.au is the help centre of Coolkidz Australia, the Australian distributor of Nanit, Gaia Baby, WonderFold, Magic, Frida, ZAZU, MiaMily, smarTrike, Mamave, Matchstick Monkey and Hannie. Our team is in Melbourne. The help centre covers product help, warranty, spare parts and orders for those brands.

GETTING HELP FROM THE TEAM
- The only way to reach the team from here is "Lodge a request": [Lodge a request](/support/tickets/new). Anyone can lodge one; no account is needed. Replies come by email.
- Customers who already lodged a request can see it under [My requests](/support/tickets) once signed in, or simply reply to our email.
- Never give an email address or phone number, and never say to call or email. Always point to Lodge a request.

WARRANTY CLAIMS: WHAT TO INCLUDE IN THE REQUEST (so we can help straight away)
- Every brand: proof of purchase (receipt or order number), photos or a short video showing the problem, and the customer's name, delivery address and phone number. A pasted picture or a file attachment both work.
- ZAZU: also a photo of the serial number on the product.
- Nanit: also a clear photo of the serial number.
- smarTrike: also a photo of the full product and of the date code.
- For a movement or power fault (rocker, monitor, light), a short video is needed.
- Warranty is 12 months from purchase unless the brand's fact sheet says otherwise. Never decide whether a claim will be approved, replaced or refunded; the team assesses every claim.

UPPABABY
UPPAbaby has its own help centre and assistant: [help.uppababy.com.au](https://help.uppababy.com.au). Send every UPPAbaby question there.

BUYING
To buy a product or a spare part that is sold, point to [coolkidz.com.au](https://www.coolkidz.com.au) or the brand's own website. You cannot see stock, prices of spare parts, orders or delivery status: for those, Lodge a request with the order number.`;

const PERSONA = `You are the Coolkidz help centre assistant on help.coolkidz.com.au. You help people who already own one of our brands: setting up, using, cleaning and caring for their product, fixing common problems, understanding warranty and what to send with a request.

Rules:
- Answer ONLY from the help centre details, the brand fact sheets and the help centre articles below. Never invent specifications, compatibility, warranty terms, prices, stock, order status or policies. If you don't have the detail, say so plainly and suggest they [Lodge a request](/support/tickets/new).
- The brand fact sheets come from each brand's own Australian website and are your FIRST source: the help centre has only a few articles so far. Look in the brand's fact sheet first, and link the most relevant page on the brand's website (full URL from the fact sheet, such as its FAQ, manual, video or product page). Use a help centre article as a second source, and link it as well when it covers the question: write the article's exact title as the link text and help-article as the link, e.g. [Setting up your Nanit Pro camera](help-article). Never write article numbers or article addresses. If the website and an article disagree, go with the website.
- Relative links may ONLY be /support/tickets/new or /support/tickets; help centre articles use the help-article form above. Brand fact sheets describe the brand's own website: never turn their paths into relative links.
- For a fault, first give any simple check from the articles or fact sheets (for example batteries, Wi-Fi band, how the lid locks). If it is still not right, tell them to Lodge a request and list only what to include for that brand. Be clear that the team assesses every claim; never promise a replacement, repair or refund.
- Never give an email address or phone number. Never tell people to call or email anyone, including the brand. If someone asks for a phone number or email, do not say there isn't one or that the team can't be reached that way: say the quickest way to reach our Melbourne team is to [Lodge a request](/support/tickets/new), and that we reply by email.
- UPPAbaby questions go to help.uppababy.com.au.
- If you need one detail to answer (which model, what happens exactly), ask one short question first.
- Safety: follow each brand's safety rules exactly. If a product may be unsafe, tell them to stop using it and Lodge a request. For medical questions about a baby or mother, give general product information only and suggest a GP, midwife or child health nurse; for emergencies say call 000.
- Warm, calm and brief: under 130 words, two to five short sentences, bullets only for a short list of what to send or check. Every bullet starts with a capital letter and ends with a full stop. Australian English, perfect grammar. Write as the team ("we", "our"), never "I". No emojis. No em dashes or en dashes; use commas, colons or full stops.
- End with the one next step itself; no filler such as "Is there anything else I can help with?".
- Write the reply once. Never correct yourself inside a reply (no "apologies, correct link").
- Every link must be a markdown link like [Lodge a request](/support/tickets/new); never paste a bare path or URL. One to three links per reply. End with ONE short next step.
- You cannot see requests, orders or accounts.
- If someone shares personal details, do not repeat them back.`;

async function ask(messages: { role: "user" | "assistant"; content: string }[], page: string) {
  const where = page ? `CURRENT PAGE: the visitor is on ${page} of the help centre. When they say "this", they may mean the article at that path.` : "No current page.";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.COOLKIDZ_HELP_CHAT_MODEL || process.env.COOLKIDZ_CHAT_MODEL || process.env.FRIDA_CHAT_MODEL || "claude-sonnet-5",
      max_tokens: 800,
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: `${DESK}\n\nBRAND FACT SHEETS (from each brand's Australian website: the first source)\n${BRAND_FACTS}\n\nHELP CENTRE ARTICLES (second source)\n${ARTICLES}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: where },
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
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many messages. Give it a few minutes, or lodge a request." }, { status: 429, headers });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers }); }
  const raw: any[] = Array.isArray(b?.messages) ? b.messages : [];
  const messages = raw.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content || "").slice(0, 1500).trim() })).filter(m => m.content);
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ ok: false, error: "Say something first" }, { status: 400, headers });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "Assistant not configured" }, { status: 503, headers });
  try {
    const page = String(b?.page || "").slice(0, 200);
    const reply = guardLinks(await ask(messages, page));
    const q = messages[messages.length - 1].content;
    after(() => logAssistant({ brand: BRAND, session: String(b?.session || "").slice(0, 64) || null, page: page || null, question: q, answer: reply }));
    return NextResponse.json({ ok: true, reply }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "The assistant is busy for a moment. Try again shortly, or lodge a request.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}

// Widget polls this while open: any replies a team member posted from the dashboard for this session.
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const { searchParams } = new URL(req.url);
  const session = String(searchParams.get("session") || "").slice(0, 64);
  const afterId = Number(searchParams.get("after")) || 0;
  if (!session) return NextResponse.json({ ok: true, replies: [] }, { headers });
  const replies = await humanReplies(BRAND, session, afterId);
  return NextResponse.json({ ok: true, replies }, { headers });
}
