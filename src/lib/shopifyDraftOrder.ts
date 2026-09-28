import { shopifyTokenForBrand } from "./shopifyBrandKeys";

// Creates a Shopify DRAFT order — deliberately not a real/completed order.
// A draft sits in Shopify Admin (Orders > Drafts) until someone opens it,
// checks the shipping address, and completes it — nothing ships, nothing
// is charged, and no inventory is held until that happens. Same "reviewed
// handoff" principle as the existing influencer gifting flow
// (giftOrderSheet.ts), just with the tedious SKU entry done for you.
//
// The shipping address is passed as free text inside the draft's note,
// not Shopify's structured shippingAddress fields — parsing a free-text
// address into address1/city/province/zip reliably isn't safe to guess,
// and a wrong SKU is an embarrassment while a wrong shipping address loses
// real product. Whoever completes the draft in Shopify enters/verifies it
// from the note.
export type DraftLineItem = { variant_id: number; title: string; variant_title?: string | null; sku?: string | null; quantity: number };

type Result = { ok: true; id: string; name: string; url: string } | { ok: false; error: string };

export async function createShopifyDraftOrder(opts: {
  brandId: number; lineItems: DraftLineItem[]; note: string; tags: string[];
}): Promise<Result> {
  if (!opts.lineItems.length) return { ok: false, error: "No products selected — search and add at least one before pushing." };
  const resolved = await shopifyTokenForBrand(opts.brandId);
  if (!resolved) return { ok: false, error: "This brand has no Shopify store configured (BRAND_SHOPIFY / SHOPIFY_CLIENT_CREDS)." };
  const { store, token } = resolved;

  const mutation = `mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id name invoiceUrl }
      userErrors { field message }
    }
  }`;
  const input = {
    lineItems: opts.lineItems.map(li => ({ variantId: `gid://shopify/ProductVariant/${li.variant_id}`, quantity: Math.max(1, Math.floor(li.quantity) || 1) })),
    note: opts.note.slice(0, 5000),
    tags: opts.tags,
  };

  const res = await fetch(`https://${store.domain}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: mutation, variables: { input } }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { ok: false, error: `Shopify request failed (${res?.status ?? "network error"})` };
  const json = await res.json().catch(() => ({}));
  const errors = json?.data?.draftOrderCreate?.userErrors;
  if (errors?.length) return { ok: false, error: errors.map((e: any) => e.message).join("; ") };
  const draft = json?.data?.draftOrderCreate?.draftOrder;
  if (!draft) return { ok: false, error: json?.errors?.[0]?.message || "Shopify returned no draft order" };

  // draft.id is a GID (gid://shopify/DraftOrder/123) — the numeric id is what
  // the admin URL needs.
  const numericId = String(draft.id).split("/").pop();
  return { ok: true, id: draft.id, name: draft.name, url: `https://${store.domain}/admin/draft_orders/${numericId}` };
}
