import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Recurring (year-less) promotion windows shown as background bands on the
// Timeline. Any signed-in user can view; only admins add/edit/remove.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/product_seasonality?select=*&order=brand_id.asc`, { headers: hdr(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const brandId = Number(b.brand_id);
  const product = String(b.product ?? "").trim().slice(0, 150);
  const startMonth = Number(b.start_month), endMonth = Number(b.end_month);
  if (!brandId || !product) return NextResponse.json({ ok: false, error: "Brand and product are required" }, { status: 400 });
  if (!(startMonth >= 1 && startMonth <= 12) || !(endMonth >= 1 && endMonth <= 12)) {
    return NextResponse.json({ ok: false, error: "Pick a start and end month" }, { status: 400 });
  }
  const row = { brand_id: brandId, product, start_month: startMonth, end_month: endMonth, note: b.note ? String(b.note).trim().slice(0, 300) : null, created_by: acc.user!.email };
  const res = await fetch(`${sbUrl}/rest/v1/product_seasonality`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/product_seasonality?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
