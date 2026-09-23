import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Staff time off (Operations > Staff) — read-only mirror of Connecteam's
// approved time-off/unavailability, synced by scripts/sync_connecteam.py.
// Editing happens in Connecteam, not here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const from = params.get("from"); // YYYY-MM-DD, inclusive window start
  const to = params.get("to");     // YYYY-MM-DD, inclusive window end
  let q = `${sbUrl}/rest/v1/staff_time_off?select=*&order=start_date.asc`;
  // Overlap with [from, to]: starts before the window ends, and ends after the window starts.
  if (from) q += `&end_date=gte.${encodeURIComponent(from)}`;
  if (to) q += `&start_date=lte.${encodeURIComponent(to)}`;
  const res = await fetch(q, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}
