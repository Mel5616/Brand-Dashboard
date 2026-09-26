import { createHash, randomBytes } from "crypto";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { rest } from "@/lib/registry";
import { BRAND_LOGOS } from "@/lib/brandLogos";

// Absolute — this app's own /public files, since an email needs a real URL,
// not a relative path. Two brands (Nanit, Gaia Baby) get an email-specific
// override: their BRAND_LOGOS entries are .svg/.avif, which Outlook and a
// fair few other email clients don't render at all (a blank box, not a
// broken-image icon, so it's easy to miss in testing) — these are plain PNG
// re-exports of the same artwork, not a different logo.
const LOGO_BASE = "https://marketing.coolkidz.com.au";
const EMAIL_LOGO_OVERRIDES: Record<number, string> = {
  0: "/logos/nanit-logo-email.png",
  3: "/logos/gaia-baby-logo-email.png",
};
const emailLogoUrl = (id: number) => `${LOGO_BASE}${EMAIL_LOGO_OVERRIDES[id] || BRAND_LOGOS[id]}`;

// Review rewards: one $5 code per published review, valid on any Coolkidz
// brand store, single use across the portfolio. The customer picks the
// brand at redemption; the code exists on every store and the sweep
// switches it off everywhere else the moment it is used once.
export const REWARD = { value: 5, minSpend: 0, days: 90, prefix: "THANKS5-" };

export type RewardBrand = { id: number; name: string; host: string; colour: string; tagline: string };
export const REWARD_BRANDS: RewardBrand[] = [
  { id: 5,  name: "UPPAbaby",          host: "uppababy.com.au",              colour: "#3B4C5E", tagline: "Prams, capsules and car seats" },
  { id: 0,  name: "Nanit",             host: "nanit.com.au",                 colour: "#000041", tagline: "The smart baby monitor" },
  { id: 8,  name: "Frida",             host: "fridaaustralia.com.au",        colour: "#4AC1E0", tagline: "NoseFrida and postpartum recovery" },
  { id: 12, name: "smarTrike",         host: "smartrike.com.au",             colour: "#41414e", tagline: "The Wonder stroller-trike" },
  { id: 4,  name: "WonderFold",        host: "wonderfold.com.au",            colour: "#063537", tagline: "Wagons for the whole crew" },
  { id: 3,  name: "Gaia Baby",         host: "www.gaia-baby.com.au",         colour: "#7A6A58", tagline: "Cots and nursery furniture" },
  { id: 2,  name: "Hannie",            host: "hannie.com.au",                colour: "#8E9C80", tagline: "Feeding and mealtime" },
  { id: 1,  name: "Magic",             host: "magicbabyproducts.com.au",     colour: "#82A31A", tagline: "Nappy bins that seal the smell" },
  { id: 6,  name: "ZAZU",              host: "zazu-kids.com.au",             colour: "#F7B955", tagline: "Sleep trainers and night lights" },
  { id: 11, name: "Mamave",            host: "mamave.com.au",                colour: "#DD624B", tagline: "Skincare for mum and bub" },
  { id: 10, name: "Matchstick Monkey", host: "www.matchstickmonkey.com.au",  colour: "#7E9A8C", tagline: "Teethers and baby toothbrushes" },
  { id: 7,  name: "MiaMily",           host: "miamily.com.au",               colour: "#5A7D9A", tagline: "Ride-on suitcases and kids' luggage" },
  { id: 9,  name: "Coolkidz Australia", host: "coolkidz.com.au",             colour: "#D63A2F", tagline: "Every brand, one place" },
];
export const rewardBrand = (id: number) => REWARD_BRANDS.find(b => b.id === id);

/** Shared secret for the poller: derived from the service key so no new env var is needed anywhere. */
export const rewardKey = () => createHash("sha256").update("review-reward:" + (process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest("hex").slice(0, 40);

export function rewardCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = randomBytes(6); let s = "";
  for (let i = 0; i < 6; i++) s += A[b[i] % A.length];
  return REWARD.prefix + s;
}

const gql = async (domain: string, token: string, query: string, variables: unknown) => {
  const res = await fetch(`https://${domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), cache: "no-store" }).catch(() => null);
  return res ? res.json().catch(() => null) : null;
};

/** Create the code on one brand store. */
async function createCodeOn(brand: RewardBrand, code: string, expiresAt: Date, sourceBrand: string) {
  const cred = storeCreds().find(c => c.id === brand.id);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return { ok: false as const, error: `no credentials for ${brand.name}` };
  const q = `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message } } }`;
  const d = {
    title: `Review reward $${REWARD.value} (review left at ${sourceBrand})`, code, startsAt: new Date().toISOString(), endsAt: expiresAt.toISOString(),
    usageLimit: 1, appliesOncePerCustomer: true, customerSelection: { all: true },
    customerGets: { value: { discountAmount: { amount: REWARD.value.toFixed(2), appliesOnEachItem: false } }, items: { all: true } },
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true },
  };
  const j = await gql(cred.domain, token, q, { d });
  const gid = j?.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
  if (gid) return { ok: true as const, gid };
  return { ok: false as const, error: String(j?.data?.discountCodeBasicCreate?.userErrors?.[0]?.message || j?.errors?.[0]?.message || "discount create failed").slice(0, 200) };
}

export async function createCodeEverywhere(code: string, expiresAt: Date, sourceBrand: string) {
  const codes: Record<string, string> = {}; const errors: string[] = [];
  await Promise.all(REWARD_BRANDS.map(async b => { const r = await createCodeOn(b, code, expiresAt, sourceBrand); if (r.ok) codes[String(b.id)] = r.gid; else errors.push(`${b.name}: ${r.error}`); }));
  return { codes, errors };
}

export async function deactivateCode(brandId: number, gid: string) {
  const cred = storeCreds().find(c => c.id === brandId);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return;
  await gql(cred.domain, token, `mutation($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`, { id: gid });
}

/* ---- the email ---- */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" });
// coolkidz.com.au is verified in Resend (checked 23 Sep 2026); noreply, never a
// personal address. REVIEW_REWARD_FROM / _REPLY_TO override.
const FROM = process.env.REVIEW_REWARD_FROM || "Coolkidz Australia <noreply@coolkidz.com.au>";
const REPLY_TO = process.env.REVIEW_REWARD_REPLY_TO || "hello@coolkidz.com.au";

export const REWARD_TERMS = (expiresAt: Date) => [
  `This code was issued as a thank-you for leaving a product review. It is given for every published review regardless of the rating.`,
  `It gives $${REWARD.value} off one online order at any one of the Coolkidz Australia brand stores listed above. No minimum spend. Single use: once redeemed on one store it is switched off on the others.`,
  `It cannot be combined with other discount codes, applied to a previous order, used on gift cards or shipping, exchanged for cash or credit, and no change is given.`,
  `Valid until ${fmtDate(expiresAt)}. Expired codes cannot be reissued or extended.`,
  `Issued by Coolkidz Australia Pty Ltd (ABN 98 293 897 047), 1 Beyer Road, Braeside VIC 3195. Nothing here limits your rights under the Australian Consumer Law.`,
];

export async function sendRewardEmail(o: { to: string; firstName: string; sourceBrand: string; code: string; expiresAt: Date }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  // Fixed-height tile (a table, not a plain <a>, so `valign` reliably pins
  // the pill row to the bottom even in Outlook) — every box is the same
  // size regardless of whether a brand's tagline wraps to one line or two
  // (Mel, 24 Sep 2026: the brand name moved off the header and into this
  // pill so it no longer drives the tile's height).
  const tiles = REWARD_BRANDS.filter(b => b.id !== 9).map(b => `<td width="50%" style="padding:6px"><a href="https://${b.host}/discount/${encodeURIComponent(o.code)}?redirect=/collections/all" style="display:block;text-decoration:none;border:1px solid #E6E3DD;border-radius:12px;background:#FFFFFF;overflow:hidden"><table role="presentation" width="100%" height="128" cellspacing="0" cellpadding="0"><tr><td valign="top" style="padding:16px 16px 0"><img src="${emailLogoUrl(b.id)}" alt="${esc(b.name)}" height="22" style="display:block;height:22px;width:auto;max-width:150px;border:0;margin:0 0 8px"><div style="font-size:12.5px;color:#5B6774;line-height:1.45">${esc(b.tagline)}</div></td></tr><tr><td valign="bottom" align="right" style="padding:0 14px 14px"><span style="display:inline-block;background:#F1F0EC;color:#7A8798;font-size:10.5px;font-weight:700;letter-spacing:.02em;border-radius:999px;padding:4px 11px;white-space:nowrap">${esc(b.name)}</span></td></tr></table></a></td>`);
  const rows: string[] = []; for (let i = 0; i < tiles.length; i += 2) rows.push(`<tr>${tiles[i]}${tiles[i + 1] || "<td></td>"}</tr>`);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F3F2F0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F2F0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#33404F">
  <tr><td align="center" style="background:#FFFFFF;padding:36px 40px 0;border-radius:14px 14px 0 0">
    <img src="https://coolkidz.com.au/cdn/shop/files/Coolkidz_Logo.png?v=1744850972&width=500" width="150" alt="Coolkidz Australia" style="display:block;width:150px;height:auto;border:0">
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:30px 40px 8px;text-align:center">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7A8798;font-weight:600">Thank you for your review</div>
    <div style="font-size:76px;line-height:1;font-weight:700;letter-spacing:-.03em;color:#141C26;margin:14px 0 6px">$${REWARD.value}</div>
    <div style="font-size:21px;font-weight:300;color:#141C26">off at any of our brands</div>
    <p style="font-size:15px;line-height:1.65;color:#5B6774;margin:22px auto 0;max-width:440px">Thanks, ${esc(o.firstName)}. Your ${esc(o.sourceBrand)} review helps the next parent decide, so here is $${REWARD.value} to spend at whichever of our brands you like next. No minimum spend.</p>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:26px 40px 10px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="border:2px dashed #D9D5CE;border-radius:14px;background:#FAF9F7;padding:24px 20px 22px">
      <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#7A8798;font-weight:600">Your code</div>
      <div style="font-size:30px;font-weight:700;letter-spacing:.12em;color:#141C26;margin:8px 0 10px;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace">${esc(o.code)}</div>
      <div style="font-size:13px;color:#5B6774;line-height:1.5">Use it once, on any one store below<br>Valid until ${fmtDate(o.expiresAt)}</div>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:18px 34px 30px">
    <p style="font-size:14px;line-height:1.65;color:#5B6774;margin:0 6px 14px">${esc(o.sourceBrand)} is one of the brands Coolkidz Australia brings to Australian families. We are the family-owned distributor behind all of them, so one code works across the lot.</p>
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7A8798;font-weight:600;margin:0 6px 8px">Pick your brand</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join("")}</table>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:10px 40px 30px;border-radius:0 0 14px 14px">
    <p style="font-size:13px;line-height:1.6;color:#5B6774;margin:0 0 18px">Questions? Reply to this email and the Coolkidz Australia team will help.</p>
    <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#98A2B0;font-weight:600;margin-bottom:6px">Terms</div>
    <p style="font-size:11.5px;line-height:1.6;color:#98A2B0;margin:0">${REWARD_TERMS(o.expiresAt).map(esc).join(" ")}</p>
  </td></tr>
  <tr><td align="center" style="padding:22px 20px 0"><p style="color:#98A2B0;font-size:11px;line-height:1.7;margin:0">UPPAbaby, Nanit, Frida, smarTrike, WonderFold, Gaia Baby, Hannie, Magic, ZAZU, Mamave, Matchstick Monkey and MiaMily are distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195</p></td></tr>
</table></td></tr></table></body></html>`;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [o.to], subject: `Thanks for your review: $${REWARD.value} off any Coolkidz brand`, html }) }).catch(() => null);
  if (!res?.ok) return { ok: false, error: res ? (await res.text()).slice(0, 200) : "network" };
  return { ok: true };
}

/* ---- redemption sweep: one order search per store, then switch the code off elsewhere ---- */
export type RewardRow = { id: string; source_brand_id: number; source_brand_name: string; review_id: string; customer_email: string; customer_name: string | null; rating: number | null; code: string; value: number; expires_at: string; codes: Record<string, string>; email_sent: boolean; status: string; error: string | null; redeemed_brand_id: number | null; redeemed_brand_name: string | null; redeemed_at: string | null; redeemed_order_name: string | null; redeemed_order_total: number | null; issued_at: string };
let lastSweep = 0;
export async function sweepRewards(rows: RewardRow[], force = false) {
  const open = rows.filter(r => r.status === "issued");
  if (!open.length) return rows;
  if (!force && Date.now() - lastSweep < 5 * 60 * 1000) return rows;
  lastSweep = Date.now();
  const since = open.reduce((m, r) => (r.issued_at < m ? r.issued_at : m), open[0].issued_at).slice(0, 10);
  const byCode = new Map(open.map(r => [r.code.toUpperCase(), r]));
  const updates: Promise<unknown>[] = [];
  for (const brand of REWARD_BRANDS) {
    const cred = storeCreds().find(c => c.id === brand.id);
    const token = cred ? await mintToken(cred) : null;
    if (!cred || !token) continue;
    const j = await gql(cred.domain, token, `{ orders(first: 100, sortKey: CREATED_AT, reverse: true, query: "discount_code:${REWARD.prefix} created_at:>=${since}") { edges { node { name createdAt cancelledAt discountCodes currentTotalPriceSet { shopMoney { amount } } } } } }`, {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (j?.data?.orders?.edges || []) as any[]) {
      const n = e.node; if (n.cancelledAt) continue;
      for (const c of (n.discountCodes || []) as string[]) {
        const row = byCode.get(c.toUpperCase()); if (!row || row.status !== "issued") continue;
        row.status = "redeemed"; row.redeemed_brand_id = brand.id; row.redeemed_brand_name = brand.name; row.redeemed_at = n.createdAt; row.redeemed_order_name = n.name; row.redeemed_order_total = Number(n.currentTotalPriceSet?.shopMoney?.amount || 0);
        updates.push(rest(`review_rewards?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "redeemed", redeemed_brand_id: brand.id, redeemed_brand_name: brand.name, redeemed_at: row.redeemed_at, redeemed_order_name: row.redeemed_order_name, redeemed_order_total: row.redeemed_order_total }) }));
        for (const [bid, gid] of Object.entries(row.codes || {})) if (Number(bid) !== brand.id) updates.push(deactivateCode(Number(bid), gid));
      }
    }
  }
  const now = new Date().toISOString();
  for (const r of open) if (r.status === "issued" && r.expires_at < now) { r.status = "expired"; updates.push(rest(`review_rewards?id=eq.${r.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "expired" }) })); }
  await Promise.all(updates);
  return rows;
}
