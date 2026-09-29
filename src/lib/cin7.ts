// Cin7 Omni API auth — Basic auth over CIN7_USERNAME/CIN7_API_KEY, same
// credentials the read-only sync scripts (scripts/sync_cin7_costs.py etc)
// already use. Company-wide, not per-brand (unlike Shopify).
const CIN7_BASE = "https://api.cin7.com/api";

function auth(): string | null {
  const user = process.env.CIN7_USERNAME, key = process.env.CIN7_API_KEY;
  if (!user || !key) return null;
  return "Basic " + Buffer.from(`${user}:${key}`).toString("base64");
}

// Retries on a network failure or a transient status (429/5xx) — Cin7's API
// occasionally hiccups, and without this a single blip silently reads back
// as "SKU not found" to a caller like resolveCin7Sku, which is a very
// different (and misleading) thing to tell someone about to push an order.
// Mirrors the retry the read-only python sync scripts already do.
async function cin7FetchOnce(url: string, init: RequestInit): Promise<Response | null> {
  return fetch(url, init).catch(() => null);
}

export async function cin7Fetch(path: string, init?: RequestInit): Promise<Response | null> {
  const a = auth();
  if (!a) return null;
  const url = `${CIN7_BASE}${path}`;
  const reqInit: RequestInit = { ...init, headers: { Authorization: a, "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" };
  let res: Response | null = null;
  for (let i = 0; i < 3; i++) {
    res = await cin7FetchOnce(url, reqInit);
    if (res && res.ok) return res;
    if (res && res.status >= 400 && res.status < 429) return res; // real client error — not worth retrying
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  return res;
}

export const cin7Configured = () => !!(process.env.CIN7_USERNAME && process.env.CIN7_API_KEY);
