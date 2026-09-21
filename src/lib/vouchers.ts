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

export type VoucherBrand = { id: number; name: string; host: string; colour: string; logo: string; logoW: number; about: string };

// "about" is Mel's copy (21 Sep 2026), used in the email and on the
// explainer page. Frida does not sell the Windi here, so it is not mentioned.
export const VOUCHER_BRANDS: VoucherBrand[] = [
  { id: 8,  name: "Frida", host: "fridaaustralia.com.au", colour: "#2E9FD8", logo: "/email/frida.png", logoW: 110,
    about: "Frida takes on the messy, uncomfortable parts of parenthood and makes them easier. It started with the NoseFrida snot sucker for clearing blocked little noses, and now covers bath time, nail care and everyday baby health. Frida Mom brings the same practical thinking to mum, with a postpartum recovery range for the weeks after birth." },
  { id: 11, name: "Mamave", host: "mamave.com.au", colour: "#DD624B", logo: "/email/mamave.png", logoW: 96,
    about: "Mamave is Australian skincare for mum and bub. Stretch oil, bath soak and body moisturiser care for mum through pregnancy and beyond, while a gentle wash, moisturiser, barrier cream and massage oil cover bub's daily routine from day one. One simple ritual, made for this stage of life." },
  { id: 10, name: "Matchstick Monkey", host: "www.matchstickmonkey.com.au", colour: "#4F6B72", logo: "/email/matchstick-monkey.png", logoW: 150,
    about: "Matchstick Monkey makes teething relief that works. Its signature teether has a bumpy back that holds teething gel and delivers it straight to sore gums, in an easy-grip shape for little hands. Bath toys and comforters round out a range full of design smarts and characters babies love." },
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
// uppababy.com.au is verified in Resend; noreply, never a personal address
// (Mel, 21 Sep 2026). Replies go to the support desk via REPLY_TO.
const FROM = "UPPAbaby Australia <noreply@uppababy.com.au>";
const REPLY_TO = "uppababysupport@coolkidz.net.au";
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" });

export async function sendVoucherEmail(o: { to: string; firstName: string; brand: VoucherBrand; code: string; expiresAt: Date; orderName: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://marketing.coolkidz.com.au";
  const shopUrl = `https://${o.brand.host}/discount/${encodeURIComponent(o.code)}?redirect=/collections/all`;
  const site = `https://${o.brand.host}`;
  const shown = o.brand.host.replace(/^www\./, "");
  const terms = VOUCHER_TERMS(o.brand, o.expiresAt).map(esc).join(" ");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F3F2F0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F2F0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#33404F">
  <tr><td align="center" style="background:#3B4C5E;padding:30px 24px;border-radius:14px 14px 0 0">
    <img src="${base}/email/uppababy-white.png" width="150" alt="UPPAbaby" style="display:block;width:150px;height:auto;border:0">
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:40px 40px 8px;text-align:center">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7A8798;font-weight:600">Our gift to you</div>
    <div style="font-size:76px;line-height:1;font-weight:700;letter-spacing:-.03em;color:#141C26;margin:14px 0 6px">$${VOUCHER.value}</div>
    <div style="font-size:21px;font-weight:300;color:#141C26">to spend at ${esc(o.brand.name)}</div>
    <p style="font-size:15px;line-height:1.65;color:#5B6774;margin:22px auto 0;max-width:420px">Thank you for your order, ${esc(o.firstName)}. Order ${esc(o.orderName)} came to more than $${VOUCHER.threshold}, so here is a little something for the next stage. Use the code at checkout, or tap the button and it is applied for you.</p>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:26px 40px 10px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="border:2px dashed #D9D5CE;border-radius:14px;background:#FAF9F7;padding:26px 20px 24px">
      <img src="${base}${o.brand.logo}" width="${o.brand.logoW}" alt="${esc(o.brand.name)}" style="display:block;width:${o.brand.logoW}px;height:auto;border:0;margin:0 auto 16px">
      <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#7A8798;font-weight:600">Your code</div>
      <div style="font-size:30px;font-weight:700;letter-spacing:.12em;color:#141C26;margin:8px 0 10px;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace">${esc(o.code)}</div>
      <div style="font-size:13px;color:#5B6774;line-height:1.5">$${VOUCHER.value} off when you spend $${VOUCHER.minSpend} or more<br>Valid until ${fmtDate(o.expiresAt)}</div>
    </td></tr></table>
  </td></tr>
  <tr><td align="center" style="background:#FFFFFF;padding:22px 40px 34px">
    <a href="${shopUrl}" style="display:inline-block;background:${o.brand.colour};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:15px 34px;border-radius:999px">Shop ${esc(o.brand.name)}</a>
    <div style="font-size:12.5px;color:#98A2B0;margin-top:12px">or enter the code at <a href="${site}" style="color:#5B6774">${esc(shown)}</a></div>
  </td></tr>
  <tr><td style="background:#F8F7F4;padding:28px 40px;border-top:1px solid #ECE9E3">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7A8798;font-weight:600;margin-bottom:10px">About ${esc(o.brand.name)}</div>
    <p style="font-size:14.5px;line-height:1.65;color:#33404F;margin:0 0 12px">${esc(o.brand.about)}</p>
    <a href="${site}" style="font-size:14px;font-weight:600;color:${o.brand.colour};text-decoration:none">Visit ${esc(shown)} &rarr;</a>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:24px 40px 30px;border-radius:0 0 14px 14px">
    <p style="font-size:13px;line-height:1.6;color:#5B6774;margin:0 0 18px">Questions? Just reply to this email and the UPPAbaby Australia team will help.</p>
    <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#98A2B0;font-weight:600;margin-bottom:6px">Voucher terms</div>
    <p style="font-size:11.5px;line-height:1.6;color:#98A2B0;margin:0">${terms}</p>
  </td></tr>
  <tr><td align="center" style="padding:22px 20px 0">
    <p style="color:#98A2B0;font-size:11px;line-height:1.7;margin:0">UPPAbaby, Frida, Mamave and Matchstick Monkey are distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195</p>
  </td></tr>
</table></td></tr></table></body></html>`;
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
