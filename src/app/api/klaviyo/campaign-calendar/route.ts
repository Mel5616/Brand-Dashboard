import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Portfolio send calendar (Email Planner tab): every scheduled or recently
// sent Klaviyo campaign across every brand's account, from klaviyo_campaigns
// (synced nightly). Lets two brands see they're about to hit the same shared
// customers on the same day before it happens.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const res = await fetch(`${sbUrl}/rest/v1/klaviyo_campaigns?select=brand_id,campaign_id,name,status,send_time,sent_at,subject,audiences,recipients,open_rate,click_rate,revenue&or=(send_time.gte.${since},sent_at.gte.${since})&order=send_time.asc.nullslast`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /column|does not exist/i.test(text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}
