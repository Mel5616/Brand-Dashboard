import { NextResponse } from "next/server";
import { canManage } from "@/lib/access";
import { mintToken, storeCreds } from "@/lib/shopifyMint";

// Real on/off for a live Shopify discount code — not a display flag. Looks
// the code up live via codeDiscountNodeByCode (works whether the code was
// originally created via the legacy Price Rules REST API or the newer
// Discounts GraphQL API, since Shopify unifies both under CodeDiscountNode),
// then calls discountCodeActivate/Deactivate. Reversible: deactivating
// doesn't delete or change dates, it just flips Shopify's own status.
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

  const store = storeCreds().find(s => s.id === brandId);
  if (!store) return NextResponse.json({ ok: false, error: "No Shopify credentials for this brand" }, { status: 400 });
  const token = await mintToken(store);
  if (!token) return NextResponse.json({ ok: false, error: "Couldn't authenticate with Shopify" }, { status: 500 });

  const gql = async (query: string, variables: Record<string, unknown>) => {
    const res = await fetch(`https://${store.domain}/admin/api/2024-10/graphql.json`, {
      method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message || `Shopify ${res.status}`);
    return json.data;
  };

  try {
    const lookup = await gql(`query($code: String!) { codeDiscountNodeByCode(code: $code) { id } }`, { code });
    const nodeId = lookup?.codeDiscountNodeByCode?.id;
    if (!nodeId) return NextResponse.json({ ok: false, error: "Code not found in Shopify" }, { status: 404 });

    const mutationName = action === "activate" ? "discountCodeActivate" : "discountCodeDeactivate";
    const result = await gql(
      `mutation($id: ID!) { ${mutationName}(id: $id) { userErrors { field message } } }`,
      { id: nodeId },
    );
    const userErrors = result?.[mutationName]?.userErrors;
    if (userErrors?.length) return NextResponse.json({ ok: false, error: userErrors.map((e: any) => e.message).join("; ") }, { status: 400 });

    await fetch(`${sbUrl}/rest/v1/shop_discount_codes?brand_id=eq.${brandId}&code=eq.${encodeURIComponent(code)}`, {
      method: "PATCH", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ manual_status: action === "deactivate" ? "deactivated" : null, updated_at: new Date().toISOString() }),
    });

    return NextResponse.json({ ok: true, status: action === "deactivate" ? "deactivated" : "active" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
