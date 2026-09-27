import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Social send timeline (Owned & Earned > Social) — every social draft across
// the portfolio, scheduled and recently posted, on one list. Mirrors the
// email send timeline exactly (api/klaviyo/send-timeline). Reads
// social_drafts directly — no live platform call, since nothing publishes
// automatically to any platform ("posted" is a manual status).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const [draftsRes, brandRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/social_drafts?select=id,brand_id,status,platform,format,caption,hashtags,scheduled_for,posted_at,campaign_name&or=(scheduled_for.gte.${since},posted_at.gte.${since})&order=scheduled_for.desc.nullslast`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?select=id,name,color,live`, { headers: h, cache: "no-store" }),
  ]);
  const draftText = await draftsRes.text();
  if (!draftsRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(draftsRes.status, draftText), items: [] });
  const brandText = await brandRes.text();
  const brands: any[] = brandRes.ok ? JSON.parse(brandText || "[]") : [];
  const brandById = new Map(brands.map(b => [b.id, b]));

  const rows = JSON.parse(draftText || "[]") as any[];
  const today = new Date().toISOString().slice(0, 10);
  const items = rows
    .filter(r => brandById.get(r.brand_id)?.live !== false && r.status !== "rejected")
    .map(r => {
      const when = r.scheduled_for || (r.posted_at ? r.posted_at.slice(0, 10) : null);
      const is_future = !!(r.scheduled_for && r.scheduled_for >= today && r.status !== "posted");
      return {
        id: r.id, brand_id: r.brand_id, brand_name: brandById.get(r.brand_id)?.name || `Brand ${r.brand_id}`,
        brand_color: brandById.get(r.brand_id)?.color || "#64748b",
        platform: r.platform, format: r.format, caption: r.caption, hashtags: r.hashtags,
        campaign_name: r.campaign_name, status: r.status, when, is_future,
      };
    })
    .filter(r => r.when)
    .sort((a, b) => (a.when < b.when ? 1 : -1));

  return NextResponse.json({ ok: true, items });
}
