import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// UPPAbaby monthly sell-through (channel × year × month). Admin-only writes.
// A POST replaces the whole dataset (the upload is the full report each month).

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/uppababy_sales?select=*`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), rows: [] });
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows: any[] = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, message: "No rows parsed" }, { status: 400 });

  // Replace the whole dataset (delete-all then insert).
  const del = await fetch(`${sbUrl}/rest/v1/uppababy_sales?channel=neq.__none__`, { method: "DELETE", headers: headers() });
  if (!del.ok) { const t = await del.text(); return NextResponse.json({ ok: false, needsSetup: missing(del.status, t), message: "Delete failed" }, { status: 500 }); }
  const ins = await fetch(`${sbUrl}/rest/v1/uppababy_sales`, { method: "POST", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(rows) });
  if (!ins.ok) { const t = await ins.text(); return NextResponse.json({ ok: false, needsSetup: missing(ins.status, t), message: t.slice(0, 200) }, { status: 500 }); }
  return NextResponse.json({ ok: true, inserted: rows.length });
}
