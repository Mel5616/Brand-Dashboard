import { NextResponse } from "next/server";

// Read-only product list (name, brand, RRP — all public retail info, same
// fields /api/influencer/products already exposes to anyone with the gift
// form key) for the public /giveaway-request and /product-request forms,
// which have no dashboard login and no gift-form key of their own. No auth
// gate: nothing here is sensitive (never cost price, never anything not
// already visible on the brand's own website).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  const res = await fetch(`${sbUrl}/rest/v1/influencer_products?select=style_code,product_name,brand,rrp&order=product_name.asc`, {
    headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, products: [] });
  return NextResponse.json({ ok: true, products: JSON.parse(text || "[]") });
}
