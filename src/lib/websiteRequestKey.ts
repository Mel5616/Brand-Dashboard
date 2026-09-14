import { getAccess } from "@/lib/access";

// The /website-request public form works without a dashboard login. Same
// pattern as /request (src/lib/salesRequestKey.ts) and /log-gift
// (src/lib/giftKey.ts): a signed-in session always works, or the shared
// key baked into the link.
export async function websiteRequestOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.WEBSITE_REQUEST_KEY;
  if (!expected) return true; // key not configured yet, behave as before
  const got = req.headers.get("x-website-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
