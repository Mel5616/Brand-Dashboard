import { NextResponse } from "next/server";

// Product-level promo pricing (from Promo Details). Read-only; auth via proxy.
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/promo_lines?select=*&order=start_date.asc`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const missing = res.status === 404 || /PGRST205|does not exist|schema cache/i.test(text);
    return NextResponse.json({ ok: false, items: [], needsSetup: missing });
  }
  return NextResponse.json({ ok: true, items: JSON.parse(text) });
}
