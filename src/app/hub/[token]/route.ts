import { NextResponse } from "next/server";

// PUBLIC Retailer Hub link viewer. /hub/<token> resolves a sales_sends row, logs
// the open (best-effort, mirrors /s/<token>), then serves the document: the
// stored self-contained HTML inline when there is one, otherwise the PDF.
// Form links redirect to the /apply/<token> application form.
// (Reachable without a session — "/hub" is allowlisted in the auth proxy.)
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = { apikey: sbKey || "", Authorization: `Bearer ${sbKey || ""}`, "Content-Type": "application/json" };

const page = (msg: string, status: number) => new NextResponse(`<!doctype html><meta charset=utf-8><title>Coolkidz Australia</title><body style='font-family:sans-serif;padding:3rem;text-align:center;color:#475569'>${msg}</body>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const notFound = () => page("This link is no longer available. Please contact the Coolkidz Australia team for a fresh one.", 404);

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!sbUrl || !sbKey || !/^[0-9a-f-]{36}$/.test(token || "")) return notFound();

  const rows = await fetch(`${sbUrl}/rest/v1/sales_sends?token=eq.${token}&select=id,doc_kind,doc_id,doc_title,open_count,first_opened_at&limit=1`, { headers: hdr, cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []);
  const send = rows?.[0];
  if (!send) return notFound();

  // Log the open (never blocks serving).
  try {
    const now = new Date().toISOString();
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 300);
    await fetch(`${sbUrl}/rest/v1/sales_sends?id=eq.${send.id}`, {
      method: "PATCH", headers: { ...hdr, Prefer: "return=minimal" },
      body: JSON.stringify({ open_count: (send.open_count || 0) + 1, first_opened_at: send.first_opened_at || now, last_opened_at: now, last_ip: ip, last_ua: ua }),
    });
  } catch { /* ignore */ }

  if (send.doc_kind === "form") return NextResponse.redirect(new URL(`/apply/${token}`, req.url), 302);

  const table = send.doc_kind === "fact_sheet" ? "product_fact_sheets" : "sales_documents";
  const docs = send.doc_id
    ? await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${send.doc_id}&select=html_url,pdf_url&limit=1`, { headers: hdr, cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => [])
    : [];
  const doc = docs?.[0];
  if (!doc) return notFound();

  if (doc.html_url) {
    // Serve small HTML inline (clean URL); big documents (image-heavy brand
    // overviews) get redirected to the stored file instead — Vercel caps
    // function response bodies well below their size. Open is already logged.
    const head = await fetch(doc.html_url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    const size = Number(head?.headers.get("content-length") || 0);
    if (head?.ok && size > 3_500_000) return NextResponse.redirect(doc.html_url, 302);
    const html = await fetch(doc.html_url, { cache: "no-store" }).then(r => r.ok ? r.text() : null).catch(() => null);
    if (html) return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (doc.pdf_url) return NextResponse.redirect(doc.pdf_url, 302);
  return notFound();
}
