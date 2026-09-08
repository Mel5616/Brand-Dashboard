import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { toggleShopifyDiscountCode } from "@/lib/shopifyDiscountToggle";

// Curated "what's actually live on each site" list — built up manually as
// each new site relaunches (Mel: "let's just pick these up as I build the
// new sites"), instead of surfacing every synced Shopify code. Read: any
// signed-in user. Write: any signed-in user (matches site_deals — the team
// runs these, not just admins).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/site_promotions?select=*&order=created_at.desc`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const row = {
    brand: String(b.brand || "").trim().slice(0, 80),
    brand_id: b.brand_id != null && b.brand_id !== "" ? Number(b.brand_id) : null,
    title: String(b.title || "").trim().slice(0, 160),
    mechanic: b.mechanic ? String(b.mechanic).trim().slice(0, 300) : null,
    shopify_code: b.shopify_code ? String(b.shopify_code).trim().toUpperCase().slice(0, 40) : null,
    created_by: (acc.user as any)?.email ?? null,
  };
  if (!row.brand || !row.title) return NextResponse.json({ ok: false, error: "Brand and title required" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/site_promotions`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  if (b.active !== undefined) {
    const getRes = await fetch(`${sbUrl}/rest/v1/site_promotions?id=eq.${id}&select=*`, { headers: h() });
    const [row] = getRes.ok ? JSON.parse(await getRes.text() || "[]") : [];
    if (row?.shopify_code && row?.brand_id != null) {
      const result = await toggleShopifyDiscountCode(row.brand_id, row.shopify_code, b.active ? "activate" : "deactivate");
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
  }

  const fields: any = {};
  if (b.title !== undefined) fields.title = String(b.title).trim().slice(0, 160);
  if (b.mechanic !== undefined) fields.mechanic = b.mechanic ? String(b.mechanic).slice(0, 300) : null;
  if (b.shopify_code !== undefined) fields.shopify_code = b.shopify_code ? String(b.shopify_code).toUpperCase().slice(0, 40) : null;
  if (b.active !== undefined) fields.active = !!b.active;
  const res = await fetch(`${sbUrl}/rest/v1/site_promotions?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/site_promotions?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
