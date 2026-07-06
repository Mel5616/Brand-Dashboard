import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// On-demand day-level Google / Meta Ads data for the custom (daily) date-range view.
// Queried only when the user picks a range, so it never bloats the main page load.
// Rows come from google_ads_daily / meta_ads_daily (populated by the sync).

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}` });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") === "meta" ? "meta" : "google";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const brand = url.searchParams.get("brand"); // omitted / "all" → every brand
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ ok: false, error: "bad range" }, { status: 400 });

  const table = platform === "meta" ? "meta_ads_daily" : "google_ads_daily";
  const cols = platform === "meta"
    ? "brand_id,date,spend,impressions,clicks,purchases,revenue,reach"
    : "brand_id,date,spend,impressions,clicks,revenue";
  let q = `${sbUrl}/rest/v1/${table}?select=${cols}&date=gte.${from}&date=lte.${to}&order=date`;
  if (brand && brand !== "all" && /^\d+$/.test(brand)) q += `&brand_id=eq.${brand}`;

  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    if (missing(res.status, text)) return NextResponse.json({ ok: false, needsSetup: true, rows: [] });
    return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, platform, from, to, rows: JSON.parse(text || "[]") });
}
