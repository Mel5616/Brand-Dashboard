import { getAccess } from "@/lib/access";

// The /product-request public form works without a dashboard login. Same
// pattern as /website-request and /giveaway-request: a signed-in session
// always works, or the shared key baked into the link.
export async function productRequestOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.PRODUCT_REQUEST_KEY;
  if (!expected) return true; // key not configured yet, behave as before
  const got = req.headers.get("x-product-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
