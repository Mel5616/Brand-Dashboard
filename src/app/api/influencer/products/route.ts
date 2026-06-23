import { NextResponse } from "next/server";

// Team-facing product list for the gift entry form. Returns ONLY name, style
// code, brand and RRP — never the cost price. The cost lives in Supabase and is
// only ever read server-side (entries route) to compute gifting cost.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function missing(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, products: [] }, { status: 500 });
  // NB: cost_price / cost_ratio deliberately excluded from the select
  const res = await fetch(`${sbUrl}/rest/v1/influencer_products?select=style_code,product_name,brand,rrp&order=product_name.asc`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), products: [] });
  return NextResponse.json({ ok: true, products: JSON.parse(text || "[]") });
}
