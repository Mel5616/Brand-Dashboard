import { getAccess } from "@/lib/access";

// The /request public form works without a dashboard login. Same pattern as
// the /log-gift team form (src/lib/giftKey.ts): a signed-in session always
// works, or the shared key baked into the link.
export async function salesRequestOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.SALES_REQUEST_KEY;
  if (!expected) return true; // key not configured yet, behave as before
  const got = req.headers.get("x-sales-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
