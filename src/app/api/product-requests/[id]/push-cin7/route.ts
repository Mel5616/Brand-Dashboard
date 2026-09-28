import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createCin7SalesOrder } from "@/lib/cin7SalesOrder";

// Push an approved product request's line items to Cin7 as a SalesOrder at
// stage "New" — admin-only, same gate as approving/rejecting. See
// cin7SalesOrder.ts for why nothing ships automatically.
export const revalidate = 0;
export const maxDuration = 30;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Only Mel can push to Cin7" }, { status: 403 });
  const { id } = await params;

  const getRes = await fetch(`${sbUrl}/rest/v1/product_requests?id=eq.${id}&select=*`, { headers: h(), cache: "no-store" });
  const rows = await getRes.json().catch(() => []);
  const row = rows?.[0];
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (row.status !== "approved") return NextResponse.json({ ok: false, error: "Approve the request before pushing to Cin7" }, { status: 400 });

  const result = await createCin7SalesOrder({
    lineItems: row.cin7_line_items || [],
    recipientName: row.ship_to_name || row.requester_name,
    shipToText: [`Product request: ${row.reason}`, row.ship_to_address ? `Ship to: ${row.ship_to_address}` : "No ship-to address given — check with the requester.", `Requested by ${row.requester_name} (${row.requester_email})`].join("\n"),
    customerOrderNo: `Product request — ${row.reason}`.slice(0, 100),
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  const fields = { cin7_sales_order_id: String(result.id), cin7_sales_order_ref: result.reference, cin7_pushed_at: new Date().toISOString(), cin7_pushed_by: acc.user?.email ?? null };
  const patchRes = await fetch(`${sbUrl}/rest/v1/product_requests?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const item = patchRes.ok ? (await patchRes.json())[0] : { ...row, ...fields };
  return NextResponse.json({ ok: true, item });
}
