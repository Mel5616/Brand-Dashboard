import { storeCreds, resolveToken } from "./shopifyMint";

// Per-brand Shopify Admin API access, factored out of the copy-pasted
// `JSON.parse(process.env.BRAND_SHOPIFY || "[]").find(s => s.id === brandId)`
// pattern repeated across booth-pos, weekly-brief, d2c-week-so-far etc.
// Mirrors klaviyoBrandKeys.ts's shape.
//
// Two overlapping env vars exist (BRAND_SHOPIFY has a static `token` per
// store; SHOPIFY_CLIENT_CREDS has client-credentials for a wider brand set,
// e.g. it covers smarTrike where BRAND_SHOPIFY doesn't) — merge them so
// every brand configured in either one resolves, preferring BRAND_SHOPIFY's
// entry (it already carries clientId/clientSecret too where migrated) and
// falling back to SHOPIFY_CLIENT_CREDS for anything missing there.
export type ShopifyBrandStore = { id: number; name: string; domain: string; token?: string; clientId?: string; clientSecret?: string };

export function shopifyBrandStores(): ShopifyBrandStore[] {
  let brandShopify: ShopifyBrandStore[] = [];
  try { brandShopify = JSON.parse(process.env.BRAND_SHOPIFY || "[]"); } catch { /* empty */ }
  const clientCreds = storeCreds();
  const merged = new Map<number, ShopifyBrandStore>();
  for (const c of clientCreds) merged.set(c.id, { id: c.id, name: c.name, domain: c.domain, clientId: c.clientId, clientSecret: c.clientSecret });
  for (const s of brandShopify) merged.set(s.id, { ...merged.get(s.id), ...s });
  return [...merged.values()];
}

export function shopifyStoreForBrand(brandId: number): ShopifyBrandStore | undefined {
  return shopifyBrandStores().find(s => s.id === brandId);
}

// Resolves a live Admin API token for a brand, or null if the brand has no
// configured store or the token mint failed.
export async function shopifyTokenForBrand(brandId: number): Promise<{ store: ShopifyBrandStore; token: string } | null> {
  const store = shopifyStoreForBrand(brandId);
  if (!store) return null;
  const token = await resolveToken(store);
  if (!token) return null;
  return { store, token };
}
