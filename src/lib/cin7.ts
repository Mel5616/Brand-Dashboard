// Cin7 Omni API auth — Basic auth over CIN7_USERNAME/CIN7_API_KEY, same
// credentials the read-only sync scripts (scripts/sync_cin7_costs.py etc)
// already use. Company-wide, not per-brand (unlike Shopify).
const CIN7_BASE = "https://api.cin7.com/api";

function auth(): string | null {
  const user = process.env.CIN7_USERNAME, key = process.env.CIN7_API_KEY;
  if (!user || !key) return null;
  return "Basic " + Buffer.from(`${user}:${key}`).toString("base64");
}

export async function cin7Fetch(path: string, init?: RequestInit): Promise<Response | null> {
  const a = auth();
  if (!a) return null;
  return fetch(`${CIN7_BASE}${path}`, { ...init, headers: { Authorization: a, "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" }).catch(() => null);
}

export const cin7Configured = () => !!(process.env.CIN7_USERNAME && process.env.CIN7_API_KEY);
