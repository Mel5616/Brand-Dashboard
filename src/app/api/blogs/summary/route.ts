import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// AI monthly blog summary — a short read of what's working, decaying and worth
// doing next, from the hub's own data. Admin-only.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

export async function POST() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  const [articles, ga4, landing, gsc, brands] = await Promise.all([
    rest("blog_articles?select=brand_id,title,path,published_at&limit=2000"),
    rest("blog_page_metrics?select=brand_id,month_key,path,pageviews&limit=20000"),
    rest("blog_landing_metrics?select=brand_id,month_key,path,revenue,transactions&limit=20000"),
    rest("blog_gsc_pages?select=brand_id,month_key,page,clicks,impressions,position&limit=20000"),
    rest("brands?select=id,name"),
  ]);
  const nameById = new Map<number, string>(brands.map((b: any) => [b.id, b.name]));
  const months = [...new Set(ga4.map((r: any) => r.month_key as string))].sort();
  const latest = months[months.length - 1];
  const titleFor = (bid: number, path: string) => articles.find((a: any) => a.brand_id === bid && a.path === path)?.title ?? path;
  const compact = {
    latestMonth: latest,
    topByViews: ga4.filter((r: any) => r.month_key === latest).sort((a: any, b: any) => b.pageviews - a.pageviews).slice(0, 12)
      .map((r: any) => ({ brand: nameById.get(r.brand_id), title: titleFor(r.brand_id, r.path), pageviews: r.pageviews })),
    topByRevenue: landing.filter((r: any) => r.month_key === latest && r.revenue > 0).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 10)
      .map((r: any) => ({ brand: nameById.get(r.brand_id), title: titleFor(r.brand_id, r.path), revenue: Math.round(r.revenue), orders: r.transactions })),
    prevVsLatestByBrand: brands.map((b: any) => {
      const cur = ga4.filter((r: any) => r.brand_id === b.id && r.month_key === latest).reduce((s: number, r: any) => s + r.pageviews, 0);
      const prev = ga4.filter((r: any) => r.brand_id === b.id && r.month_key === months[months.length - 2]).reduce((s: number, r: any) => s + r.pageviews, 0);
      return cur || prev ? { brand: b.name, latest: cur, prev } : null;
    }).filter(Boolean),
    gscTop: gsc.filter((r: any) => r.month_key === latest).sort((a: any, b: any) => b.clicks - a.clicks).slice(0, 10)
      .map((r: any) => ({ brand: nameById.get(r.brand_id), page: r.page, clicks: r.clicks, position: r.position })),
  };
  const userMsg = `You are the content strategist for Coolkidz Australia's brand blogs. Write a punchy monthly blog performance summary for the Marketing Director from this data (AU English):

${JSON.stringify(compact, null, 1)}

Structure: **The headline** (1-2 sentences), **Working** (3 bullets naming posts/brands), **Watch** (2-3 bullets: decay, gaps, brands with no output), **Do next** (3 concrete actions). Under 200 words. Markdown, no preamble.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: userMsg }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) return NextResponse.json({ ok: false, error: `AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 200)}` }, { status: 502 });
  return NextResponse.json({ ok: true, summary: text });
}
