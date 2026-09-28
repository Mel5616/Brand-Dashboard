import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createShopifyDraftOrder } from "@/lib/shopifyDraftOrder";

// Push an approved product request's line items to Shopify as a DRAFT
// order — admin-only, same gate as approving/rejecting. See
// shopifyDraftOrder.ts for why this is a draft, not a completed order.
export const revalidate = 0;
export const maxDuration = 30;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Only Mel can push to Shopify" }, { status: 403 });
  const { id } = await params;

  const getRes = await fetch(`${sbUrl}/rest/v1/product_requests?id=eq.${id}&select=*`, { headers: h(), cache: "no-store" });
  const rows = await getRes.json().catch(() => []);
  const row = rows?.[0];
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (row.status !== "approved") return NextResponse.json({ ok: false, error: "Approve the request before pushing to Shopify" }, { status: 400 });

  const note = [
    `Product request: ${row.reason}`,
    `Requested by ${row.requester_name} (${row.requester_email})`,
    row.ship_to_name || row.ship_to_address ? `Ship to: ${[row.ship_to_name, row.ship_to_address].filter(Boolean).join(" — ")}` : "No ship-to address given — check with the requester.",
    "Verify the shipping address before completing this order.",
  ].filter(Boolean).join("\n");

  const result = await createShopifyDraftOrder({
    brandId: row.brand_id, lineItems: row.line_items || [], note, tags: ["product-request", "dashboard"],
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  const fields = { shopify_draft_order_id: result.id, shopify_draft_order_url: result.url, shopify_pushed_at: new Date().toISOString(), shopify_pushed_by: acc.user?.email ?? null };
  const patchRes = await fetch(`${sbUrl}/rest/v1/product_requests?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const item = patchRes.ok ? (await patchRes.json())[0] : { ...row, ...fields };
  return NextResponse.json({ ok: true, item, draftOrderUrl: result.url });
}
