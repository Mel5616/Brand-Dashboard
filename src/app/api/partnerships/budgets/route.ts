import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Brand × month partnerships/affiliates budgets (cost terms). Admin-only.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, budgets: [] }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "unauthorised", budgets: [] }, { status: 401 }); // read: any signed-in user
  const res = await fetch(`${sbUrl}/rest/v1/partnership_budgets?select=*`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), budgets: [] });
  return NextResponse.json({ ok: true, budgets: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.brand || !b.month_key) return NextResponse.json({ ok: false }, { status: 400 });
  const row = { brand: b.brand, month_key: b.month_key, budget: Number(b.budget) || 0 };
  const res = await fetch(`${sbUrl}/rest/v1/partnership_budgets?on_conflict=brand,month_key`, {
    method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
