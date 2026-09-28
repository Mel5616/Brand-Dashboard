import { getAccess } from "@/lib/access";

// The /giveaway-request public form works without a dashboard login. Same
// pattern as /website-request (src/lib/websiteRequestKey.ts): a signed-in
// session always works, or the shared key baked into the link.
export async function giveawayRequestOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.GIVEAWAY_REQUEST_KEY;
  if (!expected) return true; // key not configured yet, behave as before
  const got = req.headers.get("x-giveaway-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
