import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";

// Brand × month influencer budgets (cost terms). Admin-only (dashboard).

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function missing(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, budgets: [] }, { status: 500 });
  // Read: admin, or a member granted the Influencer Budget section (view-only).
  if (!(await canManage("influencer"))) return NextResponse.json({ ok: false, error: "forbidden", budgets: [] }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/influencer_budgets?select=*`, { headers: headers(), cache: "no-store" });
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
  const res = await fetch(`${sbUrl}/rest/v1/influencer_budgets?on_conflict=brand,month_key`, {
    method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
