import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { INFLUENCER_FY_KEYS, INFLUENCER_FY_LABEL } from "@/lib/influencerFy";

// Team-safe influencer view. Any logged-in user (incl. the social team) may read it.
// Budget pacing is returned as PERCENTAGES only — cost dollars never leave the server,
// so the team sees how much budget is left without seeing what gifts actually cost.
// Gift values are shown as RRP (retail), which is not derivable into cost.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}` });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const sb = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: headers(), cache: "no-store" });

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const [bRes, eRes] = await Promise.all([
    sb("influencer_budgets?select=brand,month_key,budget"),
    sb("influencer_entries?select=id,brand,month_key,total_cost,rrp,handle,platform,product_name,status,content_url,likes,reach,posted_at,content_type&order=month_key.desc"),
  ]);
  const bText = await bRes.text(), eText = await eRes.text();
  if (!bRes.ok || !eRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(bRes.status, bText) || missing(eRes.status, eText) });

  const fy = new Set(INFLUENCER_FY_KEYS);
  const budgets = (JSON.parse(bText || "[]") as any[]).filter(r => fy.has(r.month_key));
  const entries = (JSON.parse(eText || "[]") as any[]).filter(r => fy.has(r.month_key));

  const agg: Record<string, { budget: number; spend: number; rrp: number; gifts: number }> = {};
  const bucket = (b: string) => (agg[b] ??= { budget: 0, spend: 0, rrp: 0, gifts: 0 });
  for (const r of budgets) bucket(r.brand).budget += Number(r.budget) || 0;
  for (const e of entries) { const a = bucket(e.brand || "—"); a.spend += Number(e.total_cost) || 0; a.rrp += Number(e.rrp) || 0; a.gifts++; }

  const pct = (used: number, budget: number) => budget > 0 ? Math.round((used / budget) * 100) : (used > 0 ? 100 : 0);
  const brands = Object.entries(agg)
    .map(([brand, a]) => ({ brand, gifts: a.gifts, rrp_gifted: Math.round(a.rrp), used_pct: pct(a.spend, a.budget), left_pct: Math.max(0, 100 - pct(a.spend, a.budget)) }))
    .filter(b => b.gifts > 0 || b.rrp_gifted > 0 || agg[b.brand].budget > 0)
    .sort((x, y) => y.used_pct - x.used_pct);

  const totBudget = budgets.reduce((s, r) => s + (Number(r.budget) || 0), 0);
  const totSpend = entries.reduce((s, e) => s + (Number(e.total_cost) || 0), 0);
  const overall = { used_pct: pct(totSpend, totBudget), left_pct: Math.max(0, 100 - pct(totSpend, totBudget)) };

  const gifts = entries.slice(0, 120).map(e => ({
    id: e.id, month_key: e.month_key, handle: e.handle, platform: e.platform, brand: e.brand, product_name: e.product_name,
    rrp: e.rrp != null ? Math.round(Number(e.rrp)) : null,
    status: e.status ?? null, content_url: e.content_url ?? null, content_type: e.content_type ?? null,
    likes: e.likes != null ? Number(e.likes) : null, reach: e.reach != null ? Number(e.reach) : null,
    posted_at: e.posted_at ?? null,
  }));

  // Social performance totals (no cost involved — safe for the team).
  const posted = entries.filter(e => e.content_url);
  const social = {
    posts: posted.length,
    likes: posted.reduce((s, e) => s + (Number(e.likes) || 0), 0),
    reach: posted.reduce((s, e) => s + (Number(e.reach) || 0), 0),
  };

  return NextResponse.json({ ok: true, fyLabel: INFLUENCER_FY_LABEL, overall, brands, gifts, social });
}
