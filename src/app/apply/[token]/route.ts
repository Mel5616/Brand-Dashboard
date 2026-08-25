import { NextResponse } from "next/server";

// PUBLIC new-customer credit application. A "form" send token lands here
// (via /hub/<token>); we serve the current credit application document from
// the sales-hub library with its submit endpoint pointed at
// /api/credit-application?token=<token>, so the submission is tied back to
// the send (and its customer record). Allowlisted in the auth proxy.
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = { apikey: sbKey || "", Authorization: `Bearer ${sbKey || ""}` };

const page = (msg: string, status: number) => new NextResponse(`<!doctype html><meta charset=utf-8><title>Coolkidz Australia</title><body style='font-family:sans-serif;padding:3rem;text-align:center;color:#475569'>${msg}</body>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const notFound = () => page("This application link is no longer available. Please contact the Coolkidz Australia team for a fresh one.", 404);

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!sbUrl || !sbKey || !/^[0-9a-f-]{36}$/.test(token || "")) return notFound();

  const sends = await fetch(`${sbUrl}/rest/v1/sales_sends?token=eq.${token}&doc_kind=eq.form&select=id&limit=1`, { headers: hdr, cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []);
  if (!sends?.[0]) return notFound();

  const docs = await fetch(`${sbUrl}/rest/v1/sales_documents?category=eq.credit_form&status=eq.current&select=html_url&order=created_at.desc&limit=1`, { headers: hdr, cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []);
  const htmlUrl = docs?.[0]?.html_url;
  if (!htmlUrl) return page("The application form isn't available right now — please contact the Coolkidz Australia team.", 503);

  let html = await fetch(htmlUrl, { cache: "no-store" }).then(r => r.ok ? r.text() : null).catch(() => null);
  if (!html) return notFound();
  // Point the form's demo-mode CONFIG at the real endpoint, carrying the token.
  html = html.replace('endpoint: ""', `endpoint: ${JSON.stringify(`/api/credit-application?token=${token}`)}`);
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
