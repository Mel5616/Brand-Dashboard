import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// D2C promo plan — mirror retailer promos onto the D2C store. Status tracked here.
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/d2c_promos?select=*&order=period_start.asc`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    const missing = res.status === 404 || /PGRST205|does not exist|schema cache/i.test(text);
    return NextResponse.json({ ok: false, items: [], needsSetup: missing });
  }
  return NextResponse.json({ ok: true, items: JSON.parse(text) });
}

const STATUSES = ["todo", "planned", "live", "done", "skip"];

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, any> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined && STATUSES.includes(b.status)) fields.status = b.status;
  if (b.note !== undefined) fields.note = b.note || null;
  const res = await fetch(`${sbUrl}/rest/v1/d2c_promos?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
