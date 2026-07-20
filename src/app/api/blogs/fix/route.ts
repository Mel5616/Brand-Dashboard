import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// AI change brief for one blog post: what to edit to lift rankings/CTR/traffic,
// grounded in the post's own GSC queries + Semrush keyword volumes. Admin-only.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brandId = Number(b.brand_id); const path = String(b.path || "");
  if (!path.startsWith("/blogs/")) return NextResponse.json({ ok: false, error: "Bad path" }, { status: 400 });

  const enc = encodeURIComponent;
  const [art, queries, gscPage, pv, sem, topPosts, brand] = await Promise.all([
    rest(`blog_articles?select=title,url,tags&brand_id=eq.${brandId}&path=eq.${enc(path)}&limit=1`),
    rest(`blog_gsc_queries?select=month_key,query,clicks,impressions,position&brand_id=eq.${brandId}&page=like.*${enc(path)}&order=impressions.desc&limit=25`),
    rest(`blog_gsc_pages?select=month_key,clicks,impressions,ctr,position&brand_id=eq.${brandId}&page=like.*${enc(path)}&order=month_key.desc&limit=4`),
    rest(`blog_page_metrics?select=month_key,pageviews&brand_id=eq.${brandId}&path=eq.${enc(path)}&order=month_key.desc&limit=6`),
    rest(`semrush_keywords?select=phrase,position,search_volume,url&brand_id=eq.${brandId}&url=like.*${enc(path)}&order=search_volume.desc&limit=20`),
    rest(`blog_page_metrics?select=path,pageviews&brand_id=eq.${brandId}&order=pageviews.desc&limit=8`),
    rest(`brands?select=name&id=eq.${brandId}&limit=1`),
  ]);
  const a = art[0];
  if (!a) return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });

  const userMsg = `You are the SEO editor for ${brand[0]?.name ?? "a Coolkidz"} (Australian baby brand). Write a CHANGE BRIEF for refreshing this existing blog post — concrete edits, not a rewrite.

POST: "${a.title}" — ${a.url}

ITS SEARCH QUERIES (Search Console, recent):
${queries.map((q: any) => `- "${q.query}" pos ${q.position} · ${q.clicks} clicks / ${q.impressions} impressions (${q.month_key})`).join("\n") || "(none)"}

PAGE TOTALS BY MONTH (GSC): ${gscPage.map((r: any) => `${r.month_key}: ${r.clicks}c/${r.impressions}i pos ${r.position} ctr ${r.ctr}%`).join(" · ") || "(none)"}
PAGEVIEWS BY MONTH (GA4): ${pv.map((r: any) => `${r.month_key}: ${r.pageviews}`).join(" · ") || "(none)"}

SEMRUSH KEYWORDS ON THIS URL (with monthly AU search volume):
${sem.map((k: any) => `- "${k.phrase}" pos ${k.position} · vol ${k.search_volume}/mo`).join("\n") || "(none)"}

OTHER TOP POSTS ON THIS BRAND'S BLOG (internal-link candidates): ${[...new Set(topPosts.map((t: any) => t.path))].filter((p2: any) => p2 !== path).slice(0, 6).join(", ") || "(none)"}

Write (AU English, under 250 words, markdown):
**Target query** — the single best query to optimise for and why (volume × achievable position).
**New meta title** and **New meta description** — ready to paste, ≤60 / ≤155 chars, question-led house style.
**Content changes** — 3-5 specific edits (sections/FAQs to add naming the query they capture, headings to change, freshness updates).
**Internal links** — 1-2 links to add from/to the listed posts.
No preamble.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, messages: [{ role: "user", content: userMsg }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) return NextResponse.json({ ok: false, error: `AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 200)}` }, { status: 502 });
  return NextResponse.json({ ok: true, brief: text });
}
