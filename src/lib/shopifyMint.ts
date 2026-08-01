// Mint a 24h Shopify Admin token from a store's client credentials
// (SHOPIFY_CLIENT_CREDS env: [{id, name, domain, clientId, clientSecret}]).
// Used by server routes that need the expanded scopes (e.g. write_discounts).

export type StoreCred = { id: number; name: string; domain: string; clientId: string; clientSecret: string };

export function storeCreds(): StoreCred[] {
  try { return JSON.parse(process.env.SHOPIFY_CLIENT_CREDS || "[]"); } catch { return []; }
}

const cache = new Map<string, { token: string; at: number }>();

export async function mintToken(cred: StoreCred): Promise<string | null> {
  const hit = cache.get(cred.domain);
  if (hit && Date.now() - hit.at < 20 * 60 * 60 * 1000) return hit.token;
  const res = await fetch(`https://${cred.domain}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cred.clientId, client_secret: cred.clientSecret, grant_type: "client_credentials" }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const token = (await res.json().catch(() => ({})))?.access_token ?? null;
  if (token) cache.set(cred.domain, { token, at: Date.now() });
  return token;
}

// Resolve a working token for a BRAND_SHOPIFY-style store entry: mint via
// client-credentials if the store has them, else fall back to its static
// token (older, unmigrated stores).
export async function resolveToken(store: { domain: string; token?: string; clientId?: string; clientSecret?: string }): Promise<string | null> {
  if (store.clientId && store.clientSecret) {
    const t = await mintToken({ id: 0, name: "", domain: store.domain, clientId: store.clientId, clientSecret: store.clientSecret });
    if (t) return t;
  }
  return store.token || null;
}
