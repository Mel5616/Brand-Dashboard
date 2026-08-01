import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Panel data for the new Shopify-scope features: abandoned checkouts, live
// stock (low/OOS actives), and discount-code usage.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const [a, s, c] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/abandoned_checkouts?select=*&order=month_key.asc`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/product_stock?select=*&order=total_qty.asc&limit=500`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/shop_discount_codes?select=*&usage_count=gt.0&order=usage_count.desc&limit=500`, { headers: h, cache: "no-store" }),
  ]);
  const aText = await a.text();
  if (!a.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(aText) || a.status === 404, abandoned: [], stock: [], codes: [] });
  return NextResponse.json({
    ok: true,
    abandoned: JSON.parse(aText || "[]"),
    stock: s.ok ? JSON.parse((await s.text()) || "[]") : [],
    codes: c.ok ? JSON.parse((await c.text()) || "[]") : [],
  });
}
