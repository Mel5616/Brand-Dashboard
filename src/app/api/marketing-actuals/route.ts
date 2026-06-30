import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Marketing expenses (actuals) — manual non-ad spend per brand × channel × month.
// Google/Meta spend is live from the ad tables and is NOT stored here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/marketing_actuals?select=*&order=month_key.desc`, { headers: hdr(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: true, rows: [] });
  return NextResponse.json({ ok: true, rows: await res.json() });
}

// Bulk import: { rows: [{ brand_id, month_key, channel, spend, note }] }
export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows = (Array.isArray(b.rows) ? b.rows : [])
    .filter((r: any) => r && r.brand_id != null && r.month_key && r.channel)
    .map((r: any) => ({ brand_id: Number(r.brand_id), month_key: String(r.month_key), channel: String(r.channel), spend: Number(r.spend) || 0, note: r.note ? String(r.note).slice(0, 300) : "" }));
  if (!rows.length) return NextResponse.json({ ok: false, error: "No valid rows (need brand, month, channel)" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/marketing_actuals?on_conflict=brand_id,month_key,channel`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows) });
  const text = await res.text();
  return NextResponse.json({ ok: res.ok, count: rows.length, error: res.ok ? undefined : text.slice(0, 200) }, { status: res.ok ? 200 : 500 });
}

// Delete one expense line: ?brand_id=&month_key=&channel=
export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const u = new URL(req.url);
  const brand_id = u.searchParams.get("brand_id"), month_key = u.searchParams.get("month_key"), channel = u.searchParams.get("channel");
  if (!brand_id || !month_key || !channel) return NextResponse.json({ ok: false }, { status: 400 });
  const q = `brand_id=eq.${encodeURIComponent(brand_id)}&month_key=eq.${encodeURIComponent(month_key)}&channel=eq.${encodeURIComponent(channel)}`;
  const res = await fetch(`${sbUrl}/rest/v1/marketing_actuals?${q}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
