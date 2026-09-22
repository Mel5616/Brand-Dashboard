import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin view of "Spin for a sleep-in" entries (src/app/api/zazu-wheel) —
// read-only, the wheel itself writes every row. Websites > Zazu Spin Wheel.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/zazu_wheel_spins?select=*&order=created_at.desc&limit=500`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  const items = JSON.parse(text || "[]");

  const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
  const lousThisMonth = items.filter((r: any) => r.prize_key === "lou" && new Date(r.created_at) >= from).length;

  return NextResponse.json({ ok: true, items, lousThisMonth });
}
