import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Send timeline (Email Marketing > Performance) — every real Klaviyo send
// across the whole portfolio, past and scheduled, on one list. Reads
// klaviyo_campaigns (status/send_time/subject, synced nightly by
// scripts/sync_klaviyo.py's sync_campaign_calendar). No live Klaviyo call.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [campRes, brandRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/klaviyo_campaigns?select=brand_id,campaign_id,name,status,send_time,sent_at,subject,audiences,recipients,open_rate,click_rate,revenue&or=(send_time.gte.${since},sent_at.gte.${since})&order=send_time.desc.nullslast`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?select=id,name,color,live`, { headers: h, cache: "no-store" }),
  ]);
  const campText = await campRes.text();
  if (!campRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(campRes.status, campText), items: [] });
  const brandText = await brandRes.text();
  const brands: any[] = brandRes.ok ? JSON.parse(brandText || "[]") : [];
  const brandById = new Map(brands.map(b => [b.id, b]));

  const rows = JSON.parse(campText || "[]") as any[];
  const now = Date.now();
  const items = rows
    .filter(r => brandById.get(r.brand_id)?.live !== false)
    .map(r => {
      const when = r.send_time || r.sent_at;
      return {
        id: r.campaign_id, brand_id: r.brand_id, brand_name: brandById.get(r.brand_id)?.name || `Brand ${r.brand_id}`,
        brand_color: brandById.get(r.brand_id)?.color || "#64748b",
        name: r.name, subject: r.subject, audiences: r.audiences, status: r.status,
        when, is_future: when ? new Date(when).getTime() > now : false,
        recipients: r.recipients, open_rate: r.open_rate, click_rate: r.click_rate, revenue: r.revenue,
      };
    })
    .filter(r => r.when)
    .sort((a, b) => (a.when < b.when ? 1 : -1));

  return NextResponse.json({ ok: true, items });
}
