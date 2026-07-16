import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Tradeshow door attendance per day. GET lists all rows (any signed-in user).
// POST upserts one show-day count (admin).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  // staff column may not be migrated yet — fall back to attendance-only.
  let res = await fetch(`${sbUrl}/rest/v1/tradeshow_attendance?select=tradeshow_id,day,attendance,staff&order=day`, { headers: hdr(), cache: "no-store" });
  let text = await res.text();
  if (!res.ok && /staff/i.test(text)) {
    res = await fetch(`${sbUrl}/rest/v1/tradeshow_attendance?select=tradeshow_id,day,attendance&order=day`, { headers: hdr(), cache: "no-store" });
    text = await res.text();
  }
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), rows: [] });
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.tradeshow_id || !b.day) return NextResponse.json({ ok: false, error: "tradeshow_id and day required" }, { status: 400 });
  // Upsert only the metric provided (merge-duplicates updates payload columns
  // only), so saving staff never clobbers attendance and vice versa.
  const row: any = { tradeshow_id: String(b.tradeshow_id), day: String(b.day) };
  if (b.attendance !== undefined) row.attendance = Math.max(0, Math.round(Number(b.attendance) || 0));
  if (b.staff !== undefined) row.staff = Math.max(0, Math.round(Number(b.staff) || 0));
  if (row.attendance === undefined && row.staff === undefined) return NextResponse.json({ ok: false, error: "attendance or staff required" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/tradeshow_attendance?on_conflict=tradeshow_id,day`, {
    method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
