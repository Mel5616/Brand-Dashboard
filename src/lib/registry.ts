import { randomBytes } from "crypto";

// Shared bits for the UPPAbaby registry and wishlist API. Public and
// CORS-open, called from the Shopify theme on uppababy.com.au, so it uses the
// Supabase REST endpoint with the service role key exactly like
// /api/tuneup/book rather than the cookie-authed dashboard client.

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const configured = () => Boolean(sbUrl && sbKey);

export const h = (extra: Record<string, string> = {}) => ({
  apikey: sbKey!,
  Authorization: `Bearer ${sbKey}`,
  "Content-Type": "application/json",
  ...extra,
});

export const rest = (p: string, init?: RequestInit) =>
  fetch(`${sbUrl}/rest/v1/${p}`, {
    ...init,
    headers: h((init?.headers as Record<string, string>) || {}),
    cache: "no-store",
  });

/** Supabase says a table is missing with PGRST205. Say so plainly rather than
 *  handing the storefront a generic 500 nobody can act on. */
export const missingTable = (text: string) => /PGRST205|does not exist/i.test(text);

/* ---- stores ----
   One registry engine, one store per registry. UPPAbaby's was first; the
   Coolkidz Gift Registry (every brand in one list) shares the same tables,
   told apart by `registries.store`. A registry only ever opens on the site it
   was made on, so a Coolkidz share link can't be read through uppababy.com.au. */
export type StoreKey = "uppababy" | "coolkidz";

export const STORES: Record<StoreKey, {
  brandId: number; brand: string; site: string; page: string; from: string; origins: string[];
}> = {
  uppababy: {
    brandId: 5, brand: "UPPAbaby", site: "https://uppababy.com.au", page: "/pages/registry",
    from: "UPPAbaby Australia <registry@uppababy.com.au>",
    origins: ["https://uppababy.com.au", "https://www.uppababy.com.au", "https://6d6483.myshopify.com"],
  },
  coolkidz: {
    brandId: 9, brand: "Coolkidz", site: "https://coolkidz.com.au", page: "/pages/gift-registry",
    from: "Coolkidz Gift Registry <registry@coolkidz.com.au>",
    origins: ["https://coolkidz.com.au", "https://www.coolkidz.com.au", "https://ee807f-3c.myshopify.com"],
  },
};

const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const ORIGINS = new Set([...Object.values(STORES).flatMap(s => s.origins), ...DEV_ORIGINS]);

/** Which store a storefront call belongs to. The browser's Origin decides when
 *  it names a known site; otherwise an explicit `store` hint (query or body),
 *  and UPPAbaby by default so its existing theme needs no change. */
export function storeOf(req: Request, hint?: unknown): StoreKey {
  const origin = req.headers.get("origin");
  for (const [k, s] of Object.entries(STORES) as [StoreKey, (typeof STORES)[StoreKey]][]) {
    if (origin && s.origins.includes(origin)) return k;
  }
  return hint === "coolkidz" ? "coolkidz" : "uppababy";
}

export const cors = (origin: string | null, methods = "GET, POST, OPTIONS") => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://uppababy.com.au",
  "Access-Control-Allow-Methods": methods,
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

/* ---- tokens ----
   The share token is typed and read aloud by people, so it avoids the
   characters that look like each other. The manage token is only ever
   copied, so it can be longer and denser. */
const SHARE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function shareToken(len = 10) {
  const b = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += SHARE_ALPHABET[b[i] % SHARE_ALPHABET.length];
  return out;
}
export const manageToken = () => randomBytes(24).toString("base64url");

/* ---- rate limiting ----
   Per IP, in memory. The instance is short lived so this is a speed bump
   against a script hammering create, not a security control. */
const hits = new Map<string, number[]>();
export function limited(ip: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => t > now - windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export const ipOf = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";

export const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/* ---- shaping ----
   A guest sees what is still needed and nothing about the family: no email,
   no street address, and no record of who bought what. The owner, holding the
   manage token, sees the lot. */
export type ItemRow = {
  id: string;
  variant_id: string;
  handle: string;
  title: string;
  variant_title: string | null;
  image_url: string | null;
  price_cents: number | null;
  wanted: number;
  purchased: number;
  note: string | null;
  position: number;
};

export function publicItem(row: ItemRow, held: number) {
  const remaining = Math.max(0, row.wanted - row.purchased - held);
  return {
    id: row.id,
    variantId: row.variant_id,
    handle: row.handle,
    title: row.title,
    variantTitle: row.variant_title,
    image: row.image_url,
    priceCents: row.price_cents,
    wanted: row.wanted,
    purchased: row.purchased,
    reserved: held,
    remaining,
    note: row.note,
    position: row.position,
  };
}
