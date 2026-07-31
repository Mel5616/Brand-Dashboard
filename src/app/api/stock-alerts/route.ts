import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Back-in-stock alerts for the dashboard pop-up. Only users who can see the
// Stock Report tab get them; dismissals are tracked per-browser client-side.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  const canSee = acc.role === "admin" || (acc.allowedTabs ?? []).includes("stock-report");
  if (!canSee) return NextResponse.json({ ok: true, alerts: [] });
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const res = await fetch(`${sbUrl}/rest/v1/stock_alerts?select=gid,name,section,detected_at&detected_at=gte.${since}&order=detected_at.desc&limit=30`, {
    headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, alerts: [] });
  return NextResponse.json({ ok: true, alerts: JSON.parse(text || "[]") });
}
