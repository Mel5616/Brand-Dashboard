// Some brands (currently UPPAbaby) have their OWN Klaviyo account, separate
// from the shared Coolkidz Australia account most sends (e.g. the OOS
// Report) use. KLAVIYO_BRAND_KEYS (env, JSON array of {id, name, apiKey})
// mirrors SHOPIFY_CLIENT_CREDS's shape. Falls back to the shared
// KLAVIYO_API_KEY when a brand has no dedicated account, so every existing
// caller keeps working unchanged.
export type KlaviyoBrandKey = { id: number; name: string; apiKey: string };

export function klaviyoBrandKeys(): KlaviyoBrandKey[] {
  try { return JSON.parse(process.env.KLAVIYO_BRAND_KEYS || "[]"); } catch { return []; }
}

export function klaviyoKeyForBrand(brandId?: number | null): string | undefined {
  if (brandId != null) {
    const found = klaviyoBrandKeys().find(b => b.id === brandId);
    if (found) return found.apiKey;
  }
  return process.env.KLAVIYO_API_KEY;
}
