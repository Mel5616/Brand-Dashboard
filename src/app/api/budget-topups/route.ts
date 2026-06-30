import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-month budget top-ups (admin). Extra budget added to a specific
// brand × month × channel, on top of the annual ÷ 12 figure.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, topups: [] }, { status: 401 }); // read: any signed-in user
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, topups: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/budget_topups?select=*`, { headers: hdr(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: true, topups: [] }); // table not set up yet → no top-ups
  return NextResponse.json({ ok: true, topups: await res.json() });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // Bulk import (monthly budget upload): { rows: [{ brand_id, month_key, channel, amount }] }
  if (Array.isArray(b.rows)) {
    const rows = b.rows
      .filter((r: any) => r && r.brand_id != null && r.month_key && r.channel)
      .map((r: any) => ({ brand_id: Number(r.brand_id), month_key: String(r.month_key), channel: String(r.channel), amount: Number(r.amount) || 0 }));
    if (!rows.length) return NextResponse.json({ ok: false, error: "No valid rows" }, { status: 400 });
    const res = await fetch(`${sbUrl}/rest/v1/budget_topups?on_conflict=brand_id,month_key,channel`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows) });
    return NextResponse.json({ ok: res.ok, count: rows.length }, { status: res.ok ? 200 : 500 });
  }

  if (b.brand_id == null || !b.month_key || !b.channel) return NextResponse.json({ ok: false }, { status: 400 });
  const row = { brand_id: b.brand_id, month_key: b.month_key, channel: b.channel, amount: Number(b.amount) || 0 };
  const res = await fetch(`${sbUrl}/rest/v1/budget_topups?on_conflict=brand_id,month_key,channel`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
