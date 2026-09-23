import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest, missingTable } from "@/lib/registry";
import { REWARD_BRANDS } from "@/lib/reviewRewards";

// Every brand's Klaviyo Reviews, from the klaviyo_reviews mirror that
// scripts/review_rewards.py refreshes hourly (GitHub Actions, all 13 brand
// keys). Reading the mirror rather than Klaviyo live means brands whose keys
// only live in stores.config.json still show up here.
export const revalidate = 0;

type Row = {
  id: string; brand_id: number; brand_name: string; rating: number | null; title: string | null; content: string | null;
  author: string | null; email: string | null; product_name: string | null; product_url: string | null; product_image: string | null;
  status: string | null; verified: boolean | null; review_type: string | null; smart_quote: string | null; public_reply: string | null;
  created: string | null; synced_at: string;
};

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  // PostgREST caps a single response at 1,000 rows (UPPAbaby alone has more),
  // so page through with Range headers until a short page comes back.
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await rest("klaviyo_reviews?select=*&order=created.desc", { headers: { Range: `${from}-${from + 999}` } });
    if (!res.ok) {
      const text = await res.text();
      if (from === 0) return NextResponse.json({ ok: true, needsSetup: missingTable(text), brands: [], lastSynced: null });
      break;
    }
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  // Klaviyo marks a published review that is pinned as "featured"; it is
  // still live on the site, so it counts as published here.
  const isLive = (r: Row) => r.status === "published" || r.status === "featured";
  const now = Date.now();
  const d30 = now - 30 * 864e5, d90 = now - 90 * 864e5;
  const lastSynced = rows.reduce<string | null>((m, r) => (!m || r.synced_at > m ? r.synced_at : m), null);

  // Nanit is moving to Yotpo rather than Klaviyo Reviews, so it is shown as
  // such instead of "no reviews yet" until Yotpo is wired in here.
  const PLATFORM: Record<number, string> = { 0: "yotpo" };
  const brands = REWARD_BRANDS.map(b => {
    const mine = rows.filter(r => r.brand_id === b.id && r.review_type !== "question");
    const published = mine.filter(isLive);
    const rated = published.filter(r => r.rating != null);
    const avg = rated.length ? rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length : null;
    return {
      id: b.id, brand: b.name, platform: PLATFORM[b.id] ?? "klaviyo",
      enabled: mine.length > 0,
      total: published.length,
      last30: published.filter(r => r.created && Date.parse(r.created) >= d30).length,
      last90: published.filter(r => r.created && Date.parse(r.created) >= d90).length,
      pending: mine.filter(r => r.status === "pending").length,
      avgRating: avg == null ? null : Math.round(avg * 10) / 10,
      reviews: mine.slice(0, 12).map(r => ({
        id: r.id, rating: r.rating, title: r.title, content: r.content, author: r.author, product: r.product_name,
        productUrl: r.product_url, created: r.created, verified: !!r.verified, status: r.status, reply: r.public_reply,
      })),
    };
  }).sort((a, b) => b.last90 - a.last90 || b.total - a.total);

  return NextResponse.json({ ok: true, needsSetup: false, brands, lastSynced });
}
