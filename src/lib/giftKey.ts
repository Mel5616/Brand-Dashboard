import { getAccess } from "@/lib/access";

// The /log-gift team form works without a dashboard login, but its supporting
// endpoints are no longer open: callers need either a signed-in session (the
// dashboard) or the shared form key baked into the /log-gift link.
export async function giftOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.GIFT_FORM_KEY;
  if (!expected) return true; // key not configured yet — behave as before
  const got = req.headers.get("x-gift-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
