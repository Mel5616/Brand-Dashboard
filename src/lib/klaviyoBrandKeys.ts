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

// Sends from a brand's own dedicated Klaviyo account need a matching "from"
// identity — sending "Coolkidz Australia" out of UPPAbaby's account reads as
// wrong to the recipient even though it'd technically deliver.
const SENDERS: Record<number, { fromEmail: string; fromLabel: string }> = {
  // email.uppababy.com.au is the verified marketing-sending domain on
  // UPPAbaby's Klaviyo account — the bare uppababy.com.au isn't authenticated
  // there, so sending from it would silently fail deliverability.
  5: { fromEmail: "support@email.uppababy.com.au", fromLabel: "UPPAbaby Australia" },
};

export function klaviyoSenderForBrand(brandId?: number | null): { fromEmail: string; fromLabel: string } {
  if (brandId != null && SENDERS[brandId]) return SENDERS[brandId];
  return { fromEmail: "hello@coolkidz.com.au", fromLabel: "Coolkidz Australia" };
}
