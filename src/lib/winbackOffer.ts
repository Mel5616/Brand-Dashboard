import { randomBytes } from "crypto";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { rest } from "@/lib/registry";

// Abandoned checkout win-back for uppababy.com.au.
//
// Someone left a Vista or Cruz in the bag. We email them a one-use code that
// makes ALL FOUR accessories free when the pram is in the cart (organiser,
// cup holder, Reed liner and snack tray, about $340), with a one-click link
// that rebuilds their cart with the four gifts in it and the code applied.
// Sends and recoveries are tracked in winback_offers. Built 22 Sep 2026 for
// the September list; Mel confirmed all four, not one (22 Sep).

export const WINBACK = {
  brandId: 5,
  days: 14,
  prefix: "WB-",
  // The prams that qualify: the Vista V3 and Cruz V3 collections.
  buysCollections: ["gid://shopify/Collection/433596858623", "gid://shopify/Collection/462055047423", "gid://shopify/Collection/456575287551"], // Vista V3, Cruz V3, Vista no-bassinet
  // Pram handles all start "uppababy-vista-v3-pram…" or "uppababy-cruz-v3-pram…"
  // (with bassinet, toddler seat only, damaged box). Matching on words like
  // "vista-v3" and excluding "bassinet" threw out every "pram-with-bassinet"
  // cart on the first run, which was most of them.
  pramMatch: (handle: string) => /^uppababy-(vista|cruz)-v3-pram/.test(handle),
  // Damaged box, ex-display and clearance prams do not earn the gift (Mel,
  // 22 Sep 2026), same as the free Nappy Bag Pro.
  runout: (title: string) => /damaged box|ex[- ]?display|clearance|outlet/i.test(title),
};

export type Gift = { key: string; name: string; line: string; productGid: string; variantId: string; price: string; img: string };
export const GIFTS: Gift[] = [
  { key: "organiser", name: "Parent Organiser", line: "Two cup holders, a phone pocket and a zip, on the handlebar.", productGid: "gid://shopify/Product/9230963245311", variantId: "47389173481727", price: "99.95", img: "https://cdn.shopify.com/s/files/1/0681/1877/4015/files/0902-CAO-CHC_inUse_3e6f7402-8f8c-4f09-a46e-5a561b8c673c.png?v=1784780977&width=400" },
  { key: "cupholder", name: "Cup Holder", line: "Clips to the frame, fits a coffee or a bottle.", productGid: "gid://shopify/Product/9128285143295", variantId: "46948947755263", price: "69.95", img: "https://cdn.shopify.com/s/files/1/0681/1877/4015/files/0902-CUP_Front.png?v=1784780912&width=400" },
  { key: "liner", name: "Reed Seat Liner", line: "Reversible, cotton one side and mesh the other.", productGid: "gid://shopify/Product/8532197998847", variantId: "45264278028543", price: "79.95", img: "https://cdn.shopify.com/s/files/1/0681/1877/4015/files/0920-SEL-WW-REE_1-1.webp?v=1784780730&width=400" },
  { key: "tray", name: "Snack Tray", line: "For the toddler seat, with a cup holder of its own.", productGid: "gid://shopify/Product/8531853082879", variantId: "45261898875135", price: "89.95", img: "https://cdn.shopify.com/s/files/1/0681/1877/4015/files/UPPAbaby_Vista_Alta_Cruz_Snack_Tray.webp?v=1784780729&width=400" },
];
// The light grey organiser is also free under the code, so either colour works.
const GETS_PRODUCTS = [...GIFTS.map(g => g.productGid), "gid://shopify/Product/9572335452415"];

export function winbackCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += A[b[i] % A.length];
  return WINBACK.prefix + s;
}

export const gql = async (query: string, variables: unknown) => {
  const cred = storeCreds().find(c => c.id === WINBACK.brandId);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return null;
  const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }), cache: "no-store",
  }).catch(() => null);
  return res ? res.json().catch(() => null) : null;
};

export type Checkout = {
  id: string; createdAt: string; url: string; email: string; firstName: string; name: string | null;
  value: number; lines: { title: string; qty: number; variantId: string; handle: string }[]; summary: string;
};

/** Open Vista/Cruz checkouts in a window, one per email (latest), minus anyone who has ordered since. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export async function candidates(from: string, to: string): Promise<Checkout[] | null> {
  const rows: Raw[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const j = await gql(`query($c: String, $q: String!) { abandonedCheckouts(first: 250, after: $c, query: $q) {
      nodes { id createdAt completedAt abandonedCheckoutUrl customer { email firstName lastName } totalPriceSet { shopMoney { amount } }
        lineItems(first: 20) { nodes { title quantity variant { id product { handle } } } } }
      pageInfo { hasNextPage endCursor } } }`, { c: cursor, q: `created_at:>=${from} created_at:<=${to}` });
    const d = j?.data?.abandonedCheckouts;
    if (!d) return null;
    rows.push(...d.nodes);
    if (!d.pageInfo.hasNextPage) break;
    cursor = d.pageInfo.endCursor;
  }
  const bought = new Set<string>();
  let oc: string | null = null;
  for (let page = 0; page < 10; page++) {
    const j = await gql(`query($c: String, $q: String!) { orders(first: 250, after: $c, query: $q) { nodes { email } pageInfo { hasNextPage endCursor } } }`,
      { c: oc, q: `created_at:>=${from}` });
    const d = j?.data?.orders;
    if (!d) break;
    for (const o of d.nodes) if (o.email) bought.add(String(o.email).toLowerCase());
    if (!d.pageInfo.hasNextPage) break;
    oc = d.pageInfo.endCursor;
  }
  const byEmail = new Map<string, Checkout>();
  for (const x of rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (x.completedAt || !x.customer?.email) continue;
    const email = String(x.customer.email).toLowerCase();
    if (bought.has(email)) continue;
    const lines = (x.lineItems?.nodes || []).filter((l: Raw) => l.variant?.id).map((l: Raw) => ({
      title: String(l.title), qty: Number(l.quantity || 1), variantId: String(l.variant.id).split("/").pop()!, handle: String(l.variant.product?.handle || "") }));
    if (!lines.some((l: { handle: string; title: string }) => WINBACK.pramMatch(l.handle) && !WINBACK.runout(l.title))) continue;
    byEmail.set(email, {
      id: x.id, createdAt: x.createdAt, url: x.abandonedCheckoutUrl, email,
      firstName: String(x.customer.firstName || "").trim() || "there",
      name: [x.customer.firstName, x.customer.lastName].filter(Boolean).join(" ") || null,
      value: Number(x.totalPriceSet?.shopMoney?.amount || 0), lines,
      summary: lines.map((l: { title: string }) => l.title.replace(/^UPPAbaby /, "")).join(", ").slice(0, 200),
    });
  }
  return [...byEmail.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One-use code: all four accessories free with a Vista or Cruz in the cart. */
export async function createWinbackCode(code: string, expiresAt: Date, who: string) {
  const j = await gql(`mutation($d: DiscountCodeBxgyInput!) { discountCodeBxgyCreate(bxgyCodeDiscount: $d) {
    codeDiscountNode { id } userErrors { field message } } }`, { d: {
      title: `Win-back: four free accessories, ${who}`, code,
      startsAt: new Date().toISOString(), endsAt: expiresAt.toISOString(),
      usageLimit: 1, appliesOncePerCustomer: true, customerSelection: { all: true },
      customerBuys: { items: { collections: { add: WINBACK.buysCollections } }, value: { quantity: "1" } },
      customerGets: { items: { products: { productsToAdd: GETS_PRODUCTS } }, value: { discountOnQuantity: { quantity: "4", effect: { percentage: 1.0 } } } },
      combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true },
    } });
  const gid = j?.data?.discountCodeBxgyCreate?.codeDiscountNode?.id;
  if (gid) return { ok: true as const, gid };
  return { ok: false as const, error: String(j?.data?.discountCodeBxgyCreate?.userErrors?.[0]?.message || j?.errors?.[0]?.message || "discount create failed").slice(0, 200) };
}

export async function deactivateWinbackCode(gid: string) {
  await gql(`mutation($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`, { id: gid });
}

/* ---- the email ---- */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const FROM = "UPPAbaby Australia <noreply@uppababy.com.au>";
const REPLY_TO = "support@uppababy.com.au";
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "Australia/Melbourne" });

/** Cart permalink that rebuilds the bag, adds every gift and applies the code. */
export function permalink(c: Checkout, code: string) {
  const items = c.lines.map(l => `${l.variantId}:${l.qty}`).concat(GIFTS.map(g => `${g.variantId}:1`)).join(",");
  return `https://uppababy.com.au/cart/${items}?discount=${encodeURIComponent(code)}`;
}

export async function sendWinbackEmail(c: Checkout, code: string, expiresAt: Date) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://marketing.coolkidz.com.au";
  const pram = c.lines.find(l => WINBACK.pramMatch(l.handle));
  const pramName = pram ? (/vista/.test(pram.handle) ? "Vista V3" : "Cruz V3") : "pram";
  const gifts = GIFTS.map(g => `
    <tr><td style="padding:0 0 8px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E4E1DC;border-radius:12px;background:#FFFFFF">
        <tr>
          <td width="84" style="padding:10px"><img src="${g.img}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:8px;background:#F3F2F0"></td>
          <td style="padding:10px 6px 10px 0"><div style="font-size:15px;font-weight:600;color:#141C26">${esc(g.name)}</div><div style="font-size:12.5px;color:#5B6774;line-height:1.45;margin-top:2px">${esc(g.line)}</div></td>
          <td width="96" align="right" style="padding:10px 14px 10px 0;white-space:nowrap"><span style="font-size:12px;color:#98A2B0;text-decoration:line-through">$${g.price}</span> <span style="display:inline-block;font-size:12px;font-weight:700;color:#1F7A4D;background:#E7F5EC;padding:4px 9px;border-radius:999px;margin-left:4px">Free</span></td>
        </tr>
      </table>
    </td></tr>`).join("");
  const total = GIFTS.reduce((s, g) => s + Number(g.price), 0);
  const link = permalink(c, code);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F3F2F0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F2F0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#33404F">
  <tr><td align="center" style="background:#3B4C5E;padding:30px 24px;border-radius:14px 14px 0 0">
    <img src="${base}/email/uppababy-white.png" width="150" alt="UPPAbaby" style="display:block;width:150px;height:auto;border:0">
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:38px 40px 10px">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7A8798;font-weight:600">Still in your bag</div>
    <h1 style="font-size:28px;line-height:1.15;font-weight:400;letter-spacing:-.02em;color:#141C26;margin:12px 0 14px">Your ${esc(pramName)} is waiting, ${esc(c.firstName)}. We have added $${Math.round(total)} of accessories, free.</h1>
    <p style="font-size:15px;line-height:1.65;color:#5B6774;margin:0 0 8px">You left a ${esc(pramName)} at the checkout earlier this month. Finish the order and all four of these come with it at no charge. One click rebuilds your bag with the four in it and the code applied.</p>
    <p style="font-size:13px;line-height:1.6;color:#98A2B0;margin:0">In your bag: ${esc(c.summary)}</p>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:18px 40px 6px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${gifts}</table>
  </td></tr>
  <tr><td align="center" style="background:#FFFFFF;padding:14px 40px 26px">
    <a href="${link}" style="display:inline-block;background:#3B4C5E;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:15px 34px;border-radius:999px">Finish my order with the four gifts</a>
    <div style="font-size:12.5px;color:#98A2B0;margin-top:12px">Rebuilds your bag, adds all four and applies the code.</div>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:0 40px 34px;border-radius:0 0 14px 14px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="border:2px dashed #D9D5CE;border-radius:12px;background:#FAF9F7;padding:16px 18px">
      <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#7A8798;font-weight:600">Or use this code at checkout</div>
      <div style="font-size:24px;font-weight:700;letter-spacing:.12em;color:#141C26;margin:6px 0 6px;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace">${esc(code)}</div>
      <div style="font-size:12.5px;color:#5B6774;line-height:1.5">Add the pram and the four accessories to your bag, enter the code, and the accessories drop to $0.<br>Valid until ${fmtDate(expiresAt)}, one use.</div>
    </td></tr></table>
    <p style="font-size:13px;line-height:1.6;color:#5B6774;margin:20px 0 0">Prefer the bag exactly as you left it? <a href="${c.url}" style="color:#3B4C5E;font-weight:600">Return to your checkout</a> and add the accessories there. Questions about which pram, what fits or delivery: reply to this email and the UPPAbaby Australia team will help.</p>
    <p style="font-size:11.5px;line-height:1.6;color:#98A2B0;margin:18px 0 0">Free delivery over $99, a three year warranty and Lifetime Service Support on every pram. The free accessories apply to one Vista V3 or Cruz V3 order, cannot be exchanged for cash and are not available with other codes.</p>
  </td></tr>
  <tr><td align="center" style="padding:22px 20px 0">
    <p style="color:#98A2B0;font-size:11px;line-height:1.7;margin:0">You are receiving this because you started a checkout at uppababy.com.au. This is a one-off note about that bag.<br>UPPAbaby is distributed in Australia by Coolkidz Australia Pty Ltd, 1 Beyer Road, Braeside, Victoria 3195</p>
  </td></tr>
</table></td></tr></table></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [c.email], subject: `Your ${pramName} is still in your bag, ${c.firstName}. Four accessories on us.`, html }),
  }).catch(() => null);
  if (!res?.ok) return { ok: false, error: res ? (await res.text()).slice(0, 200) : "network" };
  return { ok: true };
}

/* ---- conversions ---- */
export type SendRow = {
  id: string; checkout_id: string; checkout_created_at: string | null; customer_email: string; customer_name: string | null;
  cart_value: number | null; cart_summary: string | null; campaign: string; code: string; discount_gid: string | null;
  expires_at: string | null; email_sent: boolean; status: string; error: string | null; recovered_at: string | null;
  recovered_order: string | null; recovered_value: number | null; sent_at: string;
};

export async function sweepRecoveries(rows: SendRow[]) {
  const open = rows.filter(r => r.status === "sent");
  if (!open.length) return rows;
  const since = open.reduce((m, r) => (r.sent_at < m ? r.sent_at : m), open[0].sent_at).slice(0, 10);
  const byCode = new Map(open.map(r => [r.code.toUpperCase(), r]));
  const byEmail = new Map(open.map(r => [r.customer_email.toLowerCase(), r]));
  const updates: Promise<unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const j = await gql(`query($c: String, $q: String!) { orders(first: 250, after: $c, query: $q) {
      nodes { name createdAt cancelledAt email discountCodes currentTotalPriceSet { shopMoney { amount } } } pageInfo { hasNextPage endCursor } } }`,
      { c: cursor, q: `created_at:>=${since}` });
    const d = j?.data?.orders;
    if (!d) break;
    for (const o of d.nodes) {
      if (o.cancelledAt) continue;
      // A code match is the proof; an order from the same email after the send
      // counts too, since some people re-open the original checkout instead.
      let row = (o.discountCodes || []).map((c: string) => byCode.get(c.toUpperCase())).find(Boolean) as SendRow | undefined;
      if (!row && o.email) { const r = byEmail.get(String(o.email).toLowerCase()); if (r && o.createdAt >= r.sent_at) row = r; }
      if (!row || row.status !== "sent") continue;
      row.status = "recovered"; row.recovered_at = o.createdAt; row.recovered_order = o.name;
      row.recovered_value = Number(o.currentTotalPriceSet?.shopMoney?.amount || 0);
      updates.push(rest(`winback_offers?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "recovered", recovered_at: row.recovered_at, recovered_order: row.recovered_order, recovered_value: row.recovered_value }) }));
    }
    if (!d.pageInfo.hasNextPage) break;
    cursor = d.pageInfo.endCursor;
  }
  const now = new Date().toISOString();
  for (const r of open) if (r.status === "sent" && r.expires_at && r.expires_at < now) {
    r.status = "expired";
    updates.push(rest(`winback_offers?id=eq.${r.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "expired" }) }));
  }
  await Promise.all(updates);
  return rows;
}
