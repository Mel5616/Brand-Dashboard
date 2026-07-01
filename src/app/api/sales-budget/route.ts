import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Channel sales budget. GET = list (any signed-in user). POST = upsert rows,
// admin only, with optional replace (clear the whole table first).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "unauthorised", rows: [] }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/sales_budget?select=*`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, rows: [] });
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, error: "no rows" }, { status: 400 });

  if (b.replace) {
    await fetch(`${sbUrl}/rest/v1/sales_budget?brand_id=gte.0`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) }).catch(() => {});
  }
  // Upsert in chunks
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r: any) => ({ brand_id: Number(r.brand_id), channel: String(r.channel), month_key: String(r.month_key), target: Number(r.target) || 0, fy26_actual: Number(r.fy26_actual) || 0 }));
    const res = await fetch(`${sbUrl}/rest/v1/sales_budget?on_conflict=brand_id,channel,month_key`, { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(chunk) });
    if (!res.ok) return NextResponse.json({ ok: false, error: (await res.text()).slice(0, 300) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length });
}
