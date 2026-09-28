import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin/team view of free-product requests submitted via the public
// /product-request form. Read: any signed-in user. Approving or rejecting
// is admin-only — that's the point of this tab, product was going out the
// door with no central sign-off. "Fulfilled" is left open to any signed-in
// user, since that's just marking it done once picked/shipped.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const STATUSES = ["proposed", "approved", "fulfilled", "rejected"];
const GATED_STATUSES = new Set(["approved", "rejected"]);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/product_requests?select=*&order=created_at.desc&limit=500`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

// Staff can log a request straight from this tab too, not just via the
// public share link — same table, same shape, just signed-in.
export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const reason = String(b.reason || "").trim().slice(0, 500);
  const products = String(b.products || "").trim().slice(0, 1000);
  const brandId = b.brand_id !== "" && b.brand_id != null ? Number(b.brand_id) : null;
  if (!reason || !products || !brandId) return NextResponse.json({ ok: false, error: "Brand, reason and products are required" }, { status: 400 });
  const row = {
    brand_id: brandId, reason, products,
    ship_to_name: b.ship_to_name ? String(b.ship_to_name).trim().slice(0, 150) : null,
    ship_to_address: b.ship_to_address ? String(b.ship_to_address).trim().slice(0, 500) : null,
    requester_name: b.requester_name ? String(b.requester_name).trim().slice(0, 100) : (acc.user?.email ?? "Team"),
    requester_email: b.requester_email ? String(b.requester_email).trim().toLowerCase() : (acc.user?.email ?? null),
  };
  const res = await fetch(`${sbUrl}/rest/v1/product_requests`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const fields: any = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ ok: false, error: "Bad status" }, { status: 400 });
    if (GATED_STATUSES.has(b.status) && acc.role !== "admin") return NextResponse.json({ ok: false, error: "Only Mel can approve or reject a product request" }, { status: 403 });
    fields.status = b.status;
    if (b.status === "approved") { fields.approved_by = acc.user?.email ?? null; fields.approved_at = new Date().toISOString(); }
    if (b.status === "fulfilled") fields.fulfilled_at = new Date().toISOString();
  }
  if (b.admin_note !== undefined) fields.admin_note = b.admin_note ? String(b.admin_note).slice(0, 1000) : null;
  if (!Object.keys(fields).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const res = await fetch(`${sbUrl}/rest/v1/product_requests?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/product_requests?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
