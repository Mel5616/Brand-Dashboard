import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-tradeshow expenses by category. GET lists all rows (any signed-in user).
// POST upserts one show-category amount (admin).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/tradeshow_expenses?select=tradeshow_id,category,amount`, { headers: hdr(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), rows: [] });
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.tradeshow_id || !b.category) return NextResponse.json({ ok: false, error: "tradeshow_id and category required" }, { status: 400 });
  const row = { tradeshow_id: String(b.tradeshow_id), category: String(b.category).slice(0, 60), amount: Math.max(0, Number(b.amount) || 0) };
  const res = await fetch(`${sbUrl}/rest/v1/tradeshow_expenses?on_conflict=tradeshow_id,category`, {
    method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
