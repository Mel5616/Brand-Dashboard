import { getAccess } from "@/lib/access";

// The /catalogue-check public upload form works without a dashboard login,
// same pattern as /log-gift (giftKey.ts) and /request (salesRequestKey.ts):
// a signed-in session always works, or the shared key baked into the link.
export async function catalogueKeyOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.CATALOGUE_UPLOAD_KEY;
  if (!expected) return true; // key not configured yet — behave as before
  const got = req.headers.get("x-catalogue-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
