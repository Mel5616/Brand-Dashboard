import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest, missingTable } from "@/lib/registry";
import { REWARD_BRANDS } from "@/lib/reviewRewards";

// Every brand's Klaviyo Reviews, from the klaviyo_reviews mirror that
// scripts/review_rewards.py refreshes hourly (GitHub Actions, all brand keys).
// Also builds the "needs you" queue (pending + low ratings), and the per-brand
// funnel: review-request emails sent → reviews written → $5 codes → revenue.
export const revalidate = 0;

type Row = {
  id: string; brand_id: number; brand_name: string; rating: number | null; title: string | null; content: string | null;
  author: string | null; email: string | null; product_name: string | null; product_url: string | null; product_image: string | null;
  status: string | null; verified: boolean | null; review_type: string | null; smart_quote: string | null; public_reply: string | null;
  created: string | null; synced_at: string;
};
type FlowRow = { brand_id: number; flow_id: string; month_key: string; flow_name: string; status: string | null; recipients: number; opens: number; clicks: number };
type RewardRow = { source_brand_id: number; status: string; issued_at: string; redeemed_order_total: number | null; redeemed_brand_name: string | null };

// Nanit is moving to Yotpo rather than Klaviyo Reviews.
const PLATFORM: Record<number, string> = { 0: "yotpo" };
const isLive = (r: Row) => r.status === "published" || r.status === "featured";
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

async function allRows<T>(path: string): Promise<{ rows: T[]; error?: string }> {
  // PostgREST caps a single response at 1,000 rows; page with Range headers.
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await rest(path, { headers: { Range: `${from}-${from + 999}` } });
    if (!res.ok) return { rows, error: await res.text() };
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return { rows };
}

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const [reviews, flows, rewards] = await Promise.all([
    allRows<Row>("klaviyo_reviews?select=*&order=created.desc"),
    rest("klaviyo_flow_metrics?select=brand_id,flow_id,month_key,flow_name,status,recipients,opens,clicks&flow_name=ilike.*review*").then(r => r.ok ? r.json() : []).catch(() => []) as Promise<FlowRow[]>,
    rest("review_rewards?select=source_brand_id,status,issued_at,redeemed_order_total,redeemed_brand_name").then(r => r.ok ? r.json() : []).catch(() => []) as Promise<RewardRow[]>,
  ]);
  if (reviews.error && reviews.rows.length === 0) return NextResponse.json({ ok: true, needsSetup: missingTable(reviews.error), brands: [], lastSynced: null, queue: { pending: [], low: [] }, funnel: [] });

  const rows = reviews.rows.filter(r => r.review_type !== "question");
  const now = Date.now();
  const d7 = now - 7 * 864e5, d30 = now - 30 * 864e5, d90 = now - 90 * 864e5;
  const lastSynced = rows.reduce<string | null>((m, r) => (!m || r.synced_at > m ? r.synced_at : m), null);
  const thisMonth = monthKey(new Date()), lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));

  const brands = REWARD_BRANDS.map(b => {
    const mine = rows.filter(r => r.brand_id === b.id);
    const published = mine.filter(isLive);
    const rated = published.filter(r => r.rating != null);
    const avg = rated.length ? rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length : null;
    const dist = [1, 2, 3, 4, 5].map(n => rated.filter(r => r.rating === n).length);
    return {
      id: b.id, brand: b.name, host: b.host, colour: b.colour, platform: PLATFORM[b.id] ?? "klaviyo",
      enabled: mine.length > 0,
      total: published.length,
      last30: published.filter(r => r.created && Date.parse(r.created) >= d30).length,
      last90: published.filter(r => r.created && Date.parse(r.created) >= d90).length,
      pending: mine.filter(r => r.status === "pending").length,
      avgRating: avg == null ? null : Math.round(avg * 10) / 10,
      dist,
      reviews: mine.slice(0, 12).map(r => ({
        id: r.id, rating: r.rating, title: r.title, content: r.content, author: r.author, product: r.product_name,
        productUrl: r.product_url, created: r.created, verified: !!r.verified, status: r.status, reply: r.public_reply,
      })),
    };
  }).sort((a, b) => b.last90 - a.last90 || b.total - a.total);

  // Needs-you queue: everything awaiting moderation, and anything 1–2 stars
  // in the last 7 days (reply before it sits on the product page).
  const brief = (r: Row) => ({ id: r.id, brand: r.brand_name, brandId: r.brand_id, rating: r.rating, author: r.author, email: r.email, product: r.product_name, productUrl: r.product_url, content: r.content, created: r.created, status: r.status, replied: !!r.public_reply });
  const queue = {
    pending: rows.filter(r => r.status === "pending").slice(0, 60).map(brief),
    low: rows.filter(r => r.rating != null && (r.rating as number) <= 2 && r.created && Date.parse(r.created) >= d7).map(brief),
  };

  // Funnel per brand, this month + last month: review-request flow emails
  // sent (Klaviyo flow metrics, flows named *review*), reviews published,
  // $5 codes issued/redeemed and the revenue those redemptions carried.
  const funnel = REWARD_BRANDS.map(b => {
    const f = flows.filter(x => x.brand_id === b.id && (x.month_key === thisMonth || x.month_key === lastMonth));
    const sent = f.reduce((s, x) => s + (x.recipients || 0), 0);
    const clicks = f.reduce((s, x) => s + (x.clicks || 0), 0);
    const flowStatus = f.length ? f[0].status : null;
    const since = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
    const written = rows.filter(r => r.brand_id === b.id && isLive(r) && r.created && Date.parse(r.created) >= since).length;
    const rw = rewards.filter(r => r.source_brand_id === b.id && Date.parse(r.issued_at) >= since);
    const redeemed = rw.filter(r => r.status === "redeemed");
    return {
      id: b.id, brand: b.name, platform: PLATFORM[b.id] ?? "klaviyo", flowStatus, sent, clicks, written,
      rate: sent > 0 ? Math.round((written / sent) * 1000) / 10 : null,
      issued: rw.length, redeemed: redeemed.length, revenue: redeemed.reduce((s, r) => s + (r.redeemed_order_total || 0), 0),
    };
  }).sort((a, b) => b.written - a.written || b.sent - a.sent);

  return NextResponse.json({ ok: true, needsSetup: false, brands, lastSynced, queue, funnel, months: [lastMonth, thisMonth] });
}
