import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Own-website deals (Shopify sites). Read: any signed-in user. Create/edit:
// any signed-in user (the team runs these). Delete: admin.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/site_deals?select=*&order=period_start.desc&limit=300`, { headers: h(), cache: "no-store" });
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
    title: String(b.title || "").trim().slice(0, 160),
    period_start: b.period_start, period_end: b.period_end,
    price: b.price ? String(b.price).slice(0, 60) : null,
    note: b.note ? String(b.note).slice(0, 300) : null,
    created_by: (acc.user as any)?.email ?? null,
  };
  if (!row.brand || !row.title || !row.period_start || !row.period_end)
    return NextResponse.json({ ok: false, error: "Brand, deal and dates required" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/site_deals`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/site_deals?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
