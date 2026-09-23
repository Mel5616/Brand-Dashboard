import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-flow performance (Lifecycle Flows tab). Reads klaviyo_flow_metrics,
// synced nightly by scripts/sync_klaviyo.py (current + previous month per
// flow, per brand). No live Klaviyo call.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/klaviyo_flow_metrics?select=*&order=month_key.desc,revenue.desc`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [], months: [] });
  const items = JSON.parse(text || "[]");
  const months = [...new Set(items.map((r: any) => r.month_key))].sort().reverse();
  return NextResponse.json({ ok: true, items, months });
}
