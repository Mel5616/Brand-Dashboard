import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Real Shopify performance for every partnership_entries affiliate code —
// mirrors /api/influencer/entries' "tracked" pattern. influencer_sales is
// shared between influencer gifts and partnership codes (populated by
// scripts/sync_influencer_sales.py, keyed brand_id+code+month_key).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const [entriesRes, salesRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/partnership_entries?select=id,company,brand,affiliate_code,kind,status,created_at&affiliate_code=not.is.null&order=created_at.desc`, { headers: h, cache: "no-store" }),
    // brand_id is required here (not just code) — the same code can now span
    // multiple brands (e.g. MM15 on UPPAbaby, MiaMily and Matchstick Monkey
    // all at once), so aggregating by code alone would show every brand's
    // row the same combined total.
    fetch(`${sbUrl}/rest/v1/influencer_sales?select=brand_id,code,month_key,orders,revenue&limit=5000`, { headers: h, cache: "no-store" }),
  ]);
  const text = await entriesRes.text();
  if (!entriesRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(entriesRes.status, text), entries: [], sales: [] });
  const sales = salesRes.ok ? JSON.parse((await salesRes.text()) || "[]") : [];
  return NextResponse.json({ ok: true, entries: JSON.parse(text || "[]"), sales });
}
