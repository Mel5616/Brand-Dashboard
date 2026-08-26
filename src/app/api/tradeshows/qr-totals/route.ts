import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// QR-channel revenue per show — kept in its own table (tradeshow_qr) rather
// than tradeshow_sales, so it's folded in here rather than at the sync layer.
// Lightweight: one row per show, not the full live breakdown.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/tradeshow_qr?select=tradeshow_id,revenue,orders`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ ok: true, rows: [] });
  const rows = JSON.parse((await res.text()) || "[]");
  return NextResponse.json({ ok: true, rows });
}
