import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-brand, per-month commentary for the Monthly Snapshot report. Admin-only writes.

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = (extra: Record<string, string> = {}) => ({
  apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra,
});
const isMissingTable = (status: number, body: string) =>
  status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, content: "" }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand"), month = searchParams.get("month");
  if (!brand || !month) return NextResponse.json({ ok: false, content: "" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/snapshot_notes?brand_id=eq.${brand}&month_key=eq.${month}&select=content`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    if (isMissingTable(res.status, text)) return NextResponse.json({ ok: true, needsSetup: true, content: "" });
    return NextResponse.json({ ok: false, content: "" }, { status: 500 });
  }
  const rows = JSON.parse(text || "[]");
  return NextResponse.json({ ok: true, content: rows[0]?.content ?? "" });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const { brand_id, month_key, content } = b;
  if (brand_id == null || !month_key) return NextResponse.json({ ok: false, message: "brand_id and month_key required" }, { status: 400 });
  const row = { brand_id, month_key, content: String(content ?? ""), updated_at: new Date().toISOString() };
  const res = await fetch(`${sbUrl}/rest/v1/snapshot_notes`, { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates" }), body: JSON.stringify(row) });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, t), message: t.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
