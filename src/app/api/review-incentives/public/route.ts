import { NextResponse } from "next/server";

// Public, unauthenticated — the /review/[slug] landing page reads the
// incentive's public-facing fields only (no ids/secrets) before a customer
// requests their code.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/review_incentives?slug=eq.${encodeURIComponent(slug)}&select=brand,label,review_url,discount_type,discount_value,min_spend,active&limit=1`, { headers: h, cache: "no-store" });
  const rows = res.ok ? JSON.parse(await res.text() || "[]") : [];
  const item = rows[0];
  if (!item || !item.active) return NextResponse.json({ ok: false, error: "This link isn't active." }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}
