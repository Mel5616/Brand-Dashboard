import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// D2C weekly reports (generated Sunday 7pm by scripts/weekly_d2c_report.py).
// GET returns the most recent reports, newest first.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/d2c_weekly_reports?select=week_start,payload&order=week_start.desc&limit=26`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: res.status === 404 || /PGRST205|does not exist/i.test(text), reports: [] });
  return NextResponse.json({ ok: true, reports: JSON.parse(text || "[]") });
}
