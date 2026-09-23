import { NextResponse } from "next/server";

// Public short-link redirect for UTM Tracking QR codes (/l is allowlisted in
// src/proxy.ts — reachable with no session, since a QR code gets scanned by
// a customer, not a logged-in staff member). Looks up final_url fresh from
// Supabase on every request, so editing a link's destination in the UTM
// Tracking tab changes where an already-printed QR code sends people —
// nothing about the destination is baked into the QR image itself, only
// this stable /l/<code>.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey || "", Authorization: `Bearer ${sbKey || ""}` };

const notFound = () => new NextResponse(
  `<!doctype html><meta charset=utf-8><title>Link not found</title><body style='font-family:sans-serif;padding:3rem;text-align:center;color:#475569'>This link isn't valid anymore.</body>`,
  { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
);

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!sbUrl || !sbKey || !code) return notFound();
  const res = await fetch(`${sbUrl}/rest/v1/utm_links?short_code=eq.${encodeURIComponent(code)}&select=final_url&limit=1`, { headers: h, cache: "no-store" });
  if (!res.ok) return notFound();
  const item = (await res.json().catch(() => []))[0];
  if (!item?.final_url) return notFound();
  return NextResponse.redirect(item.final_url, { status: 302 });
}
