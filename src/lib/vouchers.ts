import { randomBytes } from "crypto";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { rest } from "@/lib/registry";

// $20 vouchers for UPPAbaby customers who spend $500 or more.
//
// The customer picks a brand in the cart (a $0 "voucher" line carries the
// choice as a line property). When the UPPAbaby order is paid, Shopify calls
// /api/webhooks/uppababy-order-paid, which creates a one-use discount code on
// the chosen brand's store, records it in issued_vouchers and emails it.
//
// A discount code rather than a gift card because a code can carry a minimum
// spend and an expiry, and it creates no gift card liability (Mel, 21 Sep 2026).

export const VOUCHER = {
  value: 20,          // dollars off
  minSpend: 60,       // on the brand site
  days: 90,           // validity
  threshold: 500,     // UPPAbaby subtotal that earns it
  sourceBrandId: 5,   // UPPAbaby
  prefix: "UB20-",
};

export type VoucherBrand = { id: number; name: string; host: string; colour: string; logo: string };

export const VOUCHER_BRANDS: VoucherBrand[] = [
  { id: 8,  name: "Frida",            host: "fridaaustralia.com.au",     colour: "#0A3D62", logo: "/logos/Frida_logo_main.png" },
  { id: 11, name: "Mamave",           host: "mamave.com.au",             colour: "#DD624B", logo: "/logos/Primary Logo - Red.png" },
  { id: 10, name: "Matchstick Monkey", host: "www.matchstickmonkey.com.au", colour: "#5B7A5E", logo: "/logos/Matchstick Monkey Logo.jpg" },
];
export const DEFAULT_BRAND = VOUCHER_BRANDS[0];

export function brandByName(name: string | null | undefined): VoucherBrand {
  const n = (name || "").toLowerCase().replace(/[^a-z]/g, "");
  return VOUCHER_BRANDS.find(b => b.name.toLowerCase().replace(/[^a-z]/g, "") === n) || DEFAULT_BRAND;
}

/** UB20-7KQ4M2: read down a phone without confusing 0/O or 1/I. */
export function voucherCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += A[b[i] % A.length];
  return VOUCHER.prefix + s;
}

const gql = async (domain: string, token: string, query: string, variables: unknown) => {
  const res = await fetch(`https://${domain}/admin/api/2025-07/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }), cache: "no-store",
  }).catch(() => null);
  return res ? res.json().catch(() => null) : null;
};

/** Create the one-use code on the brand store. Returns the discount node gid. */
export async function createBrandCode(brand: VoucherBrand, code: string, expiresAt: Date, orderName: string) {
  const cred = storeCreds().find(c => c.id === brand.id);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return { ok: false as const, error: `no credentials for ${brand.name}` };
  const q = `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) {
    codeDiscountNode { id } userErrors { field message } } }`;
  const d = {
    title: `UPPAbaby $${VOUCHER.value} voucher, ${orderName}`,
    code,
    startsAt: new Date().toISOString(),
    endsAt: expiresAt.toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection: { all: true },
    customerGets: { value: { discountAmount: { amount: VOUCHER.value.toFixed(2), appliesOnEachItem: false } }, items: { all: true } },
    minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: VOUCHER.minSpend.toFixed(2) } },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
  };
  const j = await gql(cred.domain, token, q, { d });
  const gid = j?.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
  if (gid) return { ok: true as const, gid };
  const err = j?.data?.discountCodeBasicCreate?.userErrors?.[0]?.message || j?.errors?.[0]?.message || "discount create failed";
  return { ok: false as const, error: String(err).slice(0, 200) };
}

/** Tag the UPPAbaby order so support can see the code from the order page. */
export async function tagSourceOrder(orderGid: string, code: string) {
  const cred = storeCreds().find(c => c.id === VOUCHER.sourceBrandId);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return;
  await gql(cred.domain, token, `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
    { id: orderGid, tags: ["voucher-issued", `voucher:${code}`] });
}

/* ---- the terms, as sent with every voucher ---- */
export const VOUCHER_TERMS = (brand: VoucherBrand, expiresAt: Date) => [
  `This voucher was issued because your UPPAbaby Australia order had a subtotal of $${VOUCHER.threshold} or more after discounts. One voucher per qualifying order.`,
  `It gives $${VOUCHER.value} off one online order at ${brand.host.replace(/^www\./, "")} when that order's subtotal is $${VOUCHER.minSpend} or more, before shipping.`,
  `Single use. It cannot be combined with other discount codes, applied to a previous order, used on gift cards or shipping, exchanged for cash or credit, and no change is given.`,
  `Valid until ${fmtDate(expiresAt)}. Expired vouchers cannot be reissued or extended.`,
  `If the qualifying UPPAbaby order is cancelled or returned for a refund, the voucher may be cancelled.`,
  `Issued by Coolkidz Australia Pty Ltd (ABN 98 293 897 047), Australian distributor of UPPAbaby, Frida, Mamave and Matchstick Monkey. Nothing here limits your rights under the Australian Consumer Law.`,
];

/* ---- the email ---- */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const FROM = "UPPAbaby Australia <mel@coolkidz.com.au>";
const REPLY_TO = "uppababysupport@coolkidz.net.au";
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" });

export async function sendVoucherEmail(o: { to: string; firstName: string; brand: VoucherBrand; code: string; expiresAt: Date; orderName: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://marketing.coolkidz.com.au";
  const shopUrl = `https://${o.brand.host}/discount/${encodeURIComponent(o.code)}?redirect=/collections/all`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#33404F">
  <div style="padding:26px 28px 6px"><div style="font-size:19px;font-weight:700;letter-spacing:-.01em;color:#141C26">UPPAbaby</div></div>
  <div style="padding:0 28px 28px">
    <h1 style="font-size:23px;font-weight:400;color:#141C26;margin:16px 0 14px">Your $${VOUCHER.value} ${esc(o.brand.name)} voucher, ${esc(o.firstName)}.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Thank you for your order (${esc(o.orderName)}). As promised, here is $${VOUCHER.value} to spend at ${esc(o.brand.name)}. Enter the code at checkout, or use the button and it is applied for you.</p>
    <div style="border:1px solid #E4E1DC;border-radius:12px;padding:18px 20px;margin:0 0 18px;background:#FAF9F7;text-align:center">
      <img src="${base}${o.brand.logo}" alt="${esc(o.brand.name)}" style="height:34px;max-width:180px;object-fit:contain;margin:0 auto 12px;display:block">
      <div style="font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:#7A8798;font-weight:600;margin-bottom:6px">Your code</div>
      <div style="font-size:26px;font-weight:700;color:#141C26;letter-spacing:.06em;font-variant-numeric:tabular-nums">${esc(o.code)}</div>
      <div style="font-size:13px;color:#7A8798;margin-top:8px">$${VOUCHER.value} off when you spend $${VOUCHER.minSpend} or more. Valid until ${fmtDate(o.expiresAt)}.</div>
    </div>
    <p style="text-align:center;margin:0 0 22px"><a href="${shopUrl}" style="display:inline-block;background:${o.brand.colour};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">Shop ${esc(o.brand.name)}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0 0 18px">Just reply to this email if you need anything.</p>
    <div style="border-top:1px solid #E4E1DC;padding-top:14px">
      <div style="font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:#7A8798;font-weight:600;margin-bottom:6px">Voucher terms</div>
      <p style="font-size:12px;line-height:1.6;color:#7A8798;margin:0">${VOUCHER_TERMS(o.brand, o.expiresAt).map(esc).join(" ")}</p>
    </div>
  </div>
  <p style="color:#98A2B0;font-size:11px;text-align:center;margin-top:6px;line-height:1.6">UPPAbaby, Frida, Mamave and Matchstick Monkey are distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195</p>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [o.to], subject: `Your $${VOUCHER.value} ${o.brand.name} voucher from UPPAbaby`, html }),
  }).catch(() => null);
  if (!res?.ok) return { ok: false, error: res ? (await res.text()).slice(0, 200) : "network" };
  return { ok: true };
}

/* ---- redemption: look the open codes up against the brand stores ---- */
export type VoucherRow = {
  id: string; source_order_id: number; source_order_name: string | null; order_subtotal: number | null;
  customer_email: string | null; customer_name: string | null; brand_id: number; brand_name: string; code: string;
  value: number; min_spend: number; expires_at: string; discount_gid: string | null; email_sent: boolean;
  status: string; error: string | null; redeemed_at: string | null; redeemed_order_name: string | null; redeemed_order_total: number | null; issued_at: string;
};

let lastSweep = 0;
/** Marks redeemed and expired rows. One Shopify search per brand for the
 *  whole prefix, so it costs three calls however many vouchers are open. */
export async function sweepRedemptions(rows: VoucherRow[], force = false) {
  const open = rows.filter(r => r.status === "issued");
  if (!open.length) return rows;
  if (!force && Date.now() - lastSweep < 5 * 60 * 1000) return rows;
  lastSweep = Date.now();
  const since = open.reduce((m, r) => (r.issued_at < m ? r.issued_at : m), open[0].issued_at).slice(0, 10);
  const byCode = new Map(open.map(r => [r.code.toUpperCase(), r]));
  const updates: Promise<unknown>[] = [];
  for (const brand of VOUCHER_BRANDS) {
    if (!open.some(r => r.brand_id === brand.id)) continue;
    const cred = storeCreds().find(c => c.id === brand.id);
    const token = cred ? await mintToken(cred) : null;
    if (!cred || !token) continue;
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const after: string = cursor ? `, after: "${cursor}"` : "";
      const q = `{ orders(first: 100${after}, sortKey: CREATED_AT, reverse: true, query: "discount_code:${VOUCHER.prefix} created_at:>=${since}") {
        edges { cursor node { name createdAt cancelledAt discountCodes currentTotalPriceSet { shopMoney { amount } } } } pageInfo { hasNextPage } } }`;
      const j = await gql(cred.domain, token, q, {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const edges: any[] = j?.data?.orders?.edges || [];
      for (const e of edges) {
        const n = e.node;
        if (n.cancelledAt) continue;
        for (const c of (n.discountCodes || []) as string[]) {
          const row = byCode.get(c.toUpperCase());
          if (!row || row.status !== "issued") continue;
          row.status = "redeemed"; row.redeemed_at = n.createdAt; row.redeemed_order_name = n.name;
          row.redeemed_order_total = Number(n.currentTotalPriceSet?.shopMoney?.amount || 0);
          updates.push(rest(`issued_vouchers?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "redeemed", redeemed_at: row.redeemed_at, redeemed_order_name: row.redeemed_order_name, redeemed_order_total: row.redeemed_order_total }) }));
        }
      }
      if (!j?.data?.orders?.pageInfo?.hasNextPage || !edges.length) break;
      cursor = edges[edges.length - 1].cursor;
    }
  }
  const now = new Date().toISOString();
  for (const r of open) {
    if (r.status === "issued" && r.expires_at < now) {
      r.status = "expired";
      updates.push(rest(`issued_vouchers?id=eq.${r.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "expired" }) }));
    }
  }
  await Promise.all(updates);
  return rows;
}
