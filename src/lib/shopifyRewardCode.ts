import { mintToken, type StoreCred } from "@/lib/shopifyMint";

// Mints a single-use, one-per-customer discount code — the same shape as
// the win-back tool's createDiscountCode (src/app/api/winback/route.ts),
// generalised for percentage OR fixed-amount rewards with a configurable
// min spend and expiry. Used by the review-incentive flow to reward anyone
// who follows a QR code/link through to leave a review.
const API = "2024-10";

export function genRewardCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

export async function createRewardDiscountCode(
  cred: StoreCred,
  code: string,
  opts: { discountType: "percentage" | "fixed_amount"; value: number; minSpend?: number | null; expiryDays: number },
): Promise<{ nodeId: string; expiresAt: string }> {
  const token = await mintToken(cred);
  if (!token) throw new Error("Couldn't authenticate with Shopify");
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + opts.expiryDays * 24 * 60 * 60 * 1000);
  const value = opts.discountType === "percentage"
    ? { percentage: Math.min(1, Math.max(0, opts.value / 100)) }
    : { discountAmount: { amount: opts.value.toFixed(2), appliesOnEachItem: false } };
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
      customerGets: { value, items: { all: true } },
      ...(opts.minSpend ? { minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: opts.minSpend.toFixed(2) } } } : {}),
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
