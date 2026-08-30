import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { mintToken, storeCreds } from "@/lib/shopifyMint";
import { buildAdhocList } from "@/lib/klaviyo";
import { klaviyoKeyForBrand } from "@/lib/klaviyoBrandKeys";

// Abandoned-cart win-back tool (Email tab): finds this month's high-value
// UPPAbaby abandoned checkouts live from Shopify (nothing is pre-computed —
// abandoned_checkouts only stores monthly aggregates, not customer-level
// rows), generates a personal single-use discount code per customer, and
// builds an ad-hoc Klaviyo audience so KlaviyoSendPanel can send one
// campaign where each recipient sees their own code via Liquid
// personalization ({{ person.winback_code }}).
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });

const MIN_SPEND = 899;
const DISCOUNT_AMOUNT = 100;
const EXPIRY_DAYS = 7;
const API = "2024-01";

async function shopGet(domain: string, token: string, path: string): Promise<{ data: any; link: string }> {
  const res = await fetch(`https://${domain}/admin/api/${API}/${path}`, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" });
  const data = await res.json();
  return { data, link: res.headers.get("Link") || "" };
}

async function* pagedCheckouts(domain: string, token: string, since: string) {
  let url = `checkouts.json?limit=250&created_at_min=${since}`;
  for (let i = 0; i < 80; i++) {
    const { data, link } = await shopGet(domain, token, url);
    const items = data.checkouts || [];
    if (!items.length) return;
    yield* items;
    const next = link.split(",").find((p: string) => p.includes('rel="next"'));
    if (!next) return;
    const cursor = next.split("page_info=")[1]?.split(">")[0]?.split("&")[0];
    if (!cursor) return;
    url = `checkouts.json?limit=250&page_info=${cursor}`;
  }
}

function exGst(gross: number, tax: number) {
  return tax > 0 ? gross - tax : gross / 1.1;
}

async function findCandidates(cred: { domain: string; clientId: string; clientSecret: string; id: number; name: string }, brandId: number) {
  const token = await mintToken(cred);
  if (!token) throw new Error("Couldn't authenticate with Shopify");

  const monthStart = new Date();
  monthStart.setDate(1);
  const since = monthStart.toISOString().slice(0, 10);

  // Already offered a code this cycle — don't re-offer.
  const already = await rest(`winback_sends?brand_id=eq.${brandId}&created_at=gte.${since}&select=email`).then(r => r.json()).catch(() => []);
  const excludeEmails = new Set((already || []).map((r: any) => (r.email || "").toLowerCase()));

  const byEmail = new Map<string, any>();
  for await (const ck of pagedCheckouts(cred.domain, token, since)) {
    const gross = Number(ck.total_price || 0);
    const tax = Number(ck.total_tax || 0);
    // Bot/junk carts inflate the numbers absurdly — same threshold as sync_shopify_extras.py.
    if (gross <= 0 || gross > 15000) continue;
    const value = exGst(gross, tax);
    if (value < MIN_SPEND) continue; // wouldn't clear the minimum spend anyway
    const email = (ck.email || ck.customer?.email || "").trim().toLowerCase();
    if (!email || email.endsWith("@coolkidz.com.au") || excludeEmails.has(email)) continue;
    const cust = ck.customer || {};
    const name = `${cust.first_name || ""} ${cust.last_name || ""}`.trim() || "Guest";
    const items = (ck.line_items || []).reduce((s: number, li: any) => s + (li.quantity || 1), 0);
    const cur = byEmail.get(email);
    if (!cur || value > cur.value) {
      byEmail.set(email, { email, name, phone: ck.phone || cust.phone || "", value: Math.round(value * 100) / 100, items, created_at: ck.created_at, checkout_url: ck.abandoned_checkout_url });
    }
  }
  return [...byEmail.values()].sort((a, b) => b.value - a.value);
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const brandId = Number(new URL(req.url).searchParams.get("brand_id") || 5);
  const cred = storeCreds().find(s => s.id === brandId);
  if (!cred) return NextResponse.json({ ok: false, error: "Store not configured" }, { status: 400 });
  try {
    const candidates = await findCandidates(cred, brandId);
    return NextResponse.json({ ok: true, candidates, offer: { discountAmount: DISCOUNT_AMOUNT, minSpend: MIN_SPEND, expiryDays: EXPIRY_DAYS } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Couldn't fetch abandoned checkouts" }, { status: 502 });
  }
}

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `WINBACK-${s}`;
}

async function createDiscountCode(cred: { domain: string; clientId: string; clientSecret: string; id: number; name: string }, code: string) {
  const token = await mintToken(cred);
  if (!token) throw new Error("Couldn't authenticate with Shopify");
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const mutation = `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;
  const variables = {
    basicCodeDiscount: {
      title: code, code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      customerSelection: { all: true },
      customerGets: { value: { discountAmount: { amount: DISCOUNT_AMOUNT.toFixed(2), appliesOnEachItem: false } }, items: { all: true } },
      minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: MIN_SPEND.toFixed(2) } },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  };
  const res = await fetch(`https://${cred.domain}/admin/api/${API}/graphql.json`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: mutation, variables }), cache: "no-store",
  }).then(r => r.json());
  const errs = res?.data?.discountCodeBasicCreate?.userErrors ?? [];
  const nodeId = res?.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
  if (!nodeId) throw new Error(errs[0]?.message || res?.errors?.[0]?.message || "Couldn't create discount code");
  return { nodeId, expiresAt: endsAt.toISOString() };
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brandId = Number(b.brand_id || 5);
  const cred = storeCreds().find(s => s.id === brandId);
  if (!cred) return NextResponse.json({ ok: false, error: "Store not configured" }, { status: 400 });

  if (b.action === "generate-codes") {
    const customers: { email: string; name: string; value: number }[] = Array.isArray(b.customers) ? b.customers : [];
    if (!customers.length) return NextResponse.json({ ok: false, error: "No customers selected" }, { status: 400 });
    const results: any[] = [];
    for (const c of customers) {
      const code = genCode();
      try {
        const { nodeId, expiresAt } = await createDiscountCode(cred, code);
        const row = {
          brand_id: brandId, email: c.email, name: c.name, cart_value: c.value,
          discount_code: code, price_rule_id: nodeId, status: "code_created",
          created_by: acc.user?.email ?? null, expires_at: expiresAt,
        };
        const ins = await rest("winback_sends", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
        const text = await ins.text();
        if (!ins.ok) throw new Error(/PGRST205|does not exist/i.test(text) ? "Run add_winback_sends.sql first" : "Code created but failed to save");
        results.push({ ...c, code, ok: true, sendRowId: JSON.parse(text)[0].id, expiresAt });
      } catch (e: any) {
        results.push({ ...c, ok: false, error: e.message || "Failed" });
      }
    }
    return NextResponse.json({ ok: true, results });
  }

  if (b.action === "build-audience") {
    const customers: { email: string; name: string; code: string }[] = Array.isArray(b.customers) ? b.customers : [];
    if (!customers.length) return NextResponse.json({ ok: false, error: "No customers to build a list from" }, { status: 400 });
    try {
      const expiryLabel = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
      const listId = await buildAdhocList(`Win-back — ${new Date().toLocaleDateString("en-AU")}`, customers.map(c => ({
        email: c.email, name: c.name,
        properties: { winback_code: c.code, winback_expires: expiryLabel },
      })), klaviyoKeyForBrand(brandId));
      await rest(`winback_sends?email=in.(${customers.map(c => `"${c.email}"`).join(",")})&brand_id=eq.${brandId}&status=eq.code_created`, {
        method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ klaviyo_list_id: listId }),
      });
      return NextResponse.json({ ok: true, listId });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message || "Couldn't build Klaviyo audience" }, { status: 502 });
    }
  }

  if (b.action === "mark-sent") {
    const { listId, campaignId } = b;
    if (!listId) return NextResponse.json({ ok: false, error: "Missing listId" }, { status: 400 });
    await rest(`winback_sends?klaviyo_list_id=eq.${encodeURIComponent(listId)}`, {
      method: "PATCH", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString(), klaviyo_campaign_id: campaignId || null }),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
