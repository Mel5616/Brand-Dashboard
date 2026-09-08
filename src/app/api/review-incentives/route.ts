import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin CRUD for review-incentive links/QR sources. Public consumption of
// one incentive (for the /review/[slug] landing page) is a separate,
// unauthenticated route: /api/review-incentives/public.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

function slugify(brand: string, label: string) {
  const base = `${brand}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/review_incentives?select=*&order=created_at.desc`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = String(b.brand || "").trim().slice(0, 80);
  const label = String(b.label || "").trim().slice(0, 120);
  const reviewUrl = String(b.review_url || "").trim().slice(0, 500);
  const brandId = Number(b.brand_id);
  const discountValue = Number(b.discount_value);
  if (!brand || !label || !reviewUrl || !Number.isFinite(brandId) || !Number.isFinite(discountValue) || discountValue <= 0)
    return NextResponse.json({ ok: false, error: "Brand, label, review link and a discount value are required" }, { status: 400 });

  const row = {
    slug: slugify(brand, label),
    brand, brand_id: brandId, label, review_url: reviewUrl,
    discount_type: b.discount_type === "fixed_amount" ? "fixed_amount" : "percentage",
    discount_value: discountValue,
    min_spend: b.min_spend != null && b.min_spend !== "" ? Number(b.min_spend) : null,
    expiry_days: Number(b.expiry_days) > 0 ? Number(b.expiry_days) : 30,
    created_by: (acc.user as any)?.email ?? null,
  };
  const res = await fetch(`${sbUrl}/rest/v1/review_incentives`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.active !== undefined) fields.active = !!b.active;
  if (b.label !== undefined) fields.label = String(b.label).slice(0, 120);
  if (b.review_url !== undefined) fields.review_url = String(b.review_url).slice(0, 500);
  if (b.discount_value !== undefined) fields.discount_value = Number(b.discount_value);
  const res = await fetch(`${sbUrl}/rest/v1/review_incentives?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/review_incentives?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
