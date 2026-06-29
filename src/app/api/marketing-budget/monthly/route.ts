import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Monthly marketing budget + actuals per brand × channel (admin). Cost terms.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden", rows: [] }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/marketing_monthly?select=brand_id,month_key,channel,kind,value`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const missing = res.status === 404 || /PGRST205|does not exist|schema cache/i.test(text);
    return NextResponse.json({ ok: false, needsSetup: missing, rows: [] });
  }
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}
