import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// LTV cohort rows for the Customer Value panel (Shopify tab).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/ltv_cohorts?select=*&order=cohort_month.asc`, {
    headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: res.status === 404 || /PGRST205|does not exist/i.test(text), rows: [] });
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}
