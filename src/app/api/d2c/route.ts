import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// D2C promo plan — mirror retailer promos onto the D2C store. Status tracked here.
// Rows normally arrive from scripts/load_promotions.py (the Monthly Promo
// Tracker sheet), but a retailer promo brought in some other way (e.g. a
// one-off calendar someone emails/shares) needs the same edit/add path a
// human would use, not just a status dropdown.
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function missing(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/d2c_promos?select=*&order=period_start.asc`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, items: [], needsSetup: missing(res.status, text) });
  return NextResponse.json({ ok: true, items: JSON.parse(text) });
}

const STATUSES = ["todo", "planned", "live", "done", "skip"];
// Every editable column besides status/note — id, source, created_at,
// updated_at stay server-managed.
const EDIT_FIELDS = ["brand", "brand_id", "sku", "product", "period_start", "period_end", "tier", "rrp", "promo_price", "discount_rrp", "retailers"];
const NUMERIC_FIELDS = new Set(["brand_id", "tier", "rrp", "promo_price", "discount_rrp"]);

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.brand || !b.period_start || !b.period_end) return NextResponse.json({ ok: false, error: "Brand and both dates are required." }, { status: 400 });
  const row: Record<string, any> = { status: "todo", source: "manual" };
  for (const f of EDIT_FIELDS) if (b[f] !== undefined) row[f] = (b[f] === "" ? null : (NUMERIC_FIELDS.has(f) ? Number(b[f]) : b[f]));
  const res = await fetch(`${sbUrl}/rest/v1/d2c_promos`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, any> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined && STATUSES.includes(b.status)) fields.status = b.status;
  if (b.note !== undefined) fields.note = b.note || null;
  for (const f of EDIT_FIELDS) if (b[f] !== undefined) fields[f] = (b[f] === "" ? null : (NUMERIC_FIELDS.has(f) ? Number(b[f]) : b[f]));
  const res = await fetch(`${sbUrl}/rest/v1/d2c_promos?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/d2c_promos?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
