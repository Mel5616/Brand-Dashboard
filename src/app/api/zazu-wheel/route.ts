import { NextResponse, after } from "next/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { genRewardCode } from "@/lib/shopifyRewardCode";

// "Spin for a sleep-in" wheel on zazu-kids.com.au. The server picks the prize
// (so the wheel can't be steered from the browser), mints a single-use Shopify
// code for it, subscribes the email to Klaviyo when consent is given, and logs
// the spin. Every spin wins; the free Lou is real but rare and capped monthly.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://zazu-kids.com.au", "https://www.zazu-kids.com.au", "https://9d6zji-bd.myshopify.com", "http://localhost:3000", "http://localhost:3001"]);
const cors = (origin: string | null) => ({ "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://zazu-kids.com.au", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" });
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) }); }

type Prize = { key: string; label: string; weight: number; kind: "percent" | "shipping" | "product"; value?: number; productGid?: string };
export const PRIZES: Prize[] = [
  { key: "p10", label: "10% off", weight: 35, kind: "percent", value: 10 },
  { key: "p15", label: "15% off", weight: 25, kind: "percent", value: 15 },
  { key: "ship", label: "Free shipping", weight: 25, kind: "shipping" },
  { key: "p20", label: "20% off", weight: 14.5, kind: "percent", value: 20 },
  { key: "lou", label: "A free Lou the Owl", weight: 0.5, kind: "product", productGid: "gid://shopify/Product/9163729240294" },
];
const LOU_MONTHLY_CAP = 3, EXPIRY_DAYS = 30;
const KLAVIYO_COMPANY = process.env.ZAZU_KLAVIYO_PUBLIC_KEY || "S3ASij", KLAVIYO_LIST = process.env.ZAZU_KLAVIYO_LIST_ID || "XxZxk4";

const hits = new Map<string, number[]>();
function limited(ip: string) { const now = Date.now(), arr = (hits.get(ip) || []).filter(t => t > now - 10 * 60 * 1000); arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear(); return arr.length > 6; }

const sb = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
const sbh = () => ({ apikey: sb.key!, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json" });
async function priorSpin(email: string) {
  if (!sb.url || !sb.key) return null;
  const r = await fetch(`${sb.url}/rest/v1/zazu_wheel_spins?email=eq.${encodeURIComponent(email)}&select=prize_key,prize_label,code,expires_at&order=created_at.desc&limit=1`, { headers: sbh(), cache: "no-store" }).catch(() => null);
  if (!r?.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}
async function lousThisMonth(): Promise<number | null> {
  if (!sb.url || !sb.key) return null;
  const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
  const r = await fetch(`${sb.url}/rest/v1/zazu_wheel_spins?prize_key=eq.lou&created_at=gte.${from.toISOString()}&select=id`, { headers: { ...sbh(), Prefer: "count=exact" }, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return null;
  const range = r.headers.get("content-range") || ""; const n = Number(range.split("/")[1]); return Number.isFinite(n) ? n : null;
}
async function logSpin(row: Record<string, unknown>) {
  if (!sb.url || !sb.key) return;
  await fetch(`${sb.url}/rest/v1/zazu_wheel_spins`, { method: "POST", headers: { ...sbh(), Prefer: "return=minimal" }, body: JSON.stringify(row) }).catch(() => null);
}

function pick(allowLou: boolean): Prize {
  const pool = PRIZES.filter(p => allowLou || p.key !== "lou");
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) { r -= p.weight; if (r <= 0) return p; }
  return pool[0];
}

async function mint(prize: Prize) {
  const cred = storeCreds().find(c => c.id === 6 || /zazu/i.test(c.name));
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) throw new Error("no Zazu credentials");
  const code = genRewardCode("SPIN");
  const startsAt = new Date(), endsAt = new Date(startsAt.getTime() + EXPIRY_DAYS * 864e5);
  const common = { title: `Spin the wheel: ${prize.label}`, code, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), usageLimit: 1, appliesOncePerCustomer: true, customerSelection: { all: true } };
  let query: string, variables: any;
  if (prize.kind === "shipping") {
    query = `mutation($d: DiscountCodeFreeShippingInput!){ discountCodeFreeShippingCreate(freeShippingCodeDiscount:$d){ codeDiscountNode{ id } userErrors{ field message } } }`;
    variables = { d: { ...common, destination: { all: true }, combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false } } };
  } else {
    const items = prize.kind === "product" ? { products: { productsToAdd: [prize.productGid] } } : { all: true };
    const value = { percentage: prize.kind === "product" ? 1 : (prize.value || 0) / 100 };
    query = `mutation($d: DiscountCodeBasicInput!){ discountCodeBasicCreate(basicCodeDiscount:$d){ codeDiscountNode{ id } userErrors{ field message } } }`;
    variables = { d: { ...common, customerGets: { value, items }, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true } } };
  }
  const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), cache: "no-store" }).then(r => r.json());
  const root = res?.data?.discountCodeFreeShippingCreate || res?.data?.discountCodeBasicCreate;
  const nodeId = root?.codeDiscountNode?.id;
  if (!nodeId) throw new Error(root?.userErrors?.[0]?.message || res?.errors?.[0]?.message || "code create failed");
  return { code, nodeId, expiresAt: endsAt.toISOString() };
}

async function subscribe(email: string, prize: Prize, code: string, expiresAt: string, source: string) {
  const body = { data: { type: "subscription", attributes: { custom_source: source, profile: { data: { type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } }, properties: { wheel_prize: prize.label, wheel_code: code, wheel_expires: expiresAt } } } } }, relationships: { list: { data: { type: "list", id: KLAVIYO_LIST } } } } };
  await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_COMPANY}`, { method: "POST", headers: { "Content-Type": "application/json", revision: "2024-10-15" }, body: JSON.stringify(body) }).catch(() => null);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many spins from this connection. Try again later." }, { status: 429, headers });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers }); }
  const email = String(b?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "That email doesn't look right." }, { status: 400, headers });
  const consent = !!b?.consent, session = String(b?.session || "").slice(0, 64) || null, page = String(b?.page || "").slice(0, 200) || null;

  const prior = await priorSpin(email);
  if (prior) return NextResponse.json({ ok: true, repeat: true, prize: { key: prior.prize_key, label: prior.prize_label }, code: prior.code, expires: prior.expires_at }, { headers });

  const lous = await lousThisMonth();
  const allowLou = lous !== null && lous < LOU_MONTHLY_CAP;   // no log table = no way to enforce the cap = no free Lou
  const prize = pick(allowLou);
  try {
    const { code, nodeId, expiresAt } = await mint(prize);
    after(async () => {
      await logSpin({ email, prize_key: prize.key, prize_label: prize.label, code, discount_node: nodeId, expires_at: expiresAt, consent, session, page, ip_hash: ip.slice(0, 12) });
      if (consent) await subscribe(email, prize, code, expiresAt, "Spin the wheel");
    });
    return NextResponse.json({ ok: true, prize: { key: prize.key, label: prize.label }, code, expires: expiresAt }, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "The wheel got stuck. Try again in a moment.", detail: process.env.NODE_ENV === "development" ? String(e?.message || e) : undefined }, { status: 502, headers });
  }
}
