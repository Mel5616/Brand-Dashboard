import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Organic Pinterest data for the Pinterest tab: monthly engagement rollups
// (pinterest_organic) + the current top pins grid (pinterest_top_pins).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const [oRes, pRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/pinterest_organic?select=*&order=month_key.asc`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/pinterest_top_pins?select=*&order=rank.asc`, { headers: h, cache: "no-store" }),
  ]);
  const oText = await oRes.text();
  if (!oRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(oRes.status, oText), months: [], pins: [] });
  const pText = await pRes.text();
  return NextResponse.json({ ok: true, months: JSON.parse(oText || "[]"), pins: pRes.ok ? JSON.parse(pText || "[]") : [] });
}
