import { getAccess } from "@/lib/access";

// The /tuneup-checkin/[id] public page (sales team, on the day) works
// without a dashboard login — same shared-key pattern as /log-gift
// (giftKey.ts), /request (salesRequestKey.ts) and /catalogue-check
// (catalogueKey.ts): a signed-in session always works, or the shared key
// baked into the link.
export async function tuneupKeyOk(req: Request): Promise<boolean> {
  try { if ((await getAccess()).role) return true; } catch { /* not signed in */ }
  const expected = process.env.TUNEUP_KEY;
  if (!expected) return true; // key not configured yet — behave as before
  const got = req.headers.get("x-tuneup-key") || new URL(req.url).searchParams.get("k");
  return got === expected;
}
