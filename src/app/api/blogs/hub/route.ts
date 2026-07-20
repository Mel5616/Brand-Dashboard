import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Blog hub data: the published-article library joined to GA4 pageviews and
// Search Console clicks/rankings per post (latest complete-ish month + totals).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : null));

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const [articles, ga4, gsc, landing, queries, sources, semrush] = await Promise.all([
    rest("blog_articles?select=brand_id,title,handle,path,url,blog_handle,author,tags,published_at&order=published_at.desc&limit=3000"),
    rest("blog_page_metrics?select=brand_id,month_key,path,pageviews,sessions&limit=20000"),
    rest("blog_gsc_pages?select=brand_id,month_key,page,clicks,impressions,ctr,position&limit=20000"),
    rest("blog_landing_metrics?select=brand_id,month_key,path,sessions,revenue,transactions&limit=20000"),
    rest("blog_gsc_queries?select=brand_id,month_key,page,query,clicks,impressions,position&limit=20000"),
    rest("blog_page_sources?select=brand_id,month_key,path,channel,sessions&limit=20000"),
    // Semrush keyword positions + AU search volumes for blog URLs only
    rest(`semrush_keywords?select=brand_id,month_key,phrase,position,search_volume,url&url=like.*${encodeURIComponent("/blogs/")}*&limit=10000`),
  ]);
  if (articles === null) return NextResponse.json({ ok: true, needsSetup: true, articles: [], ga4: [], gsc: [] });
  return NextResponse.json({ ok: true, articles: articles ?? [], ga4: ga4 ?? [], gsc: gsc ?? [],
    landing: landing ?? [], queries: queries ?? [], sources: sources ?? [], semrush: semrush ?? [] });
}
