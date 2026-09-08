import { NextResponse } from "next/server";
import { canManage } from "@/lib/access";
import { toggleShopifyDiscountCode } from "@/lib/shopifyDiscountToggle";

// Real on/off for a live Shopify discount code, used by the Discount Codes
// tab. See src/lib/shopifyDiscountToggle.ts for how the Shopify side works.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(req: Request) {
  if (!(await canManage("discount-codes"))) return NextResponse.json({ ok: false, error: "Not permitted" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brandId = Number(b.brand_id);
  const code = String(b.code || "").trim();
  const action = b.action === "activate" ? "activate" : b.action === "deactivate" ? "deactivate" : null;
  if (!Number.isFinite(brandId) || !code || !action) return NextResponse.json({ ok: false, error: "brand_id, code and action required" }, { status: 400 });

  const result = await toggleShopifyDiscountCode(brandId, code, action);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  await fetch(`${sbUrl}/rest/v1/shop_discount_codes?brand_id=eq.${brandId}&code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ manual_status: action === "deactivate" ? "deactivated" : null, updated_at: new Date().toISOString() }),
  });

  return NextResponse.json({ ok: true, status: action === "deactivate" ? "deactivated" : "active" });
}
