import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Amazon Ads results (spend + attributed sales) per brand × month. No live
// API — filled by uploading Amazon Ads console's "Advertised product" report,
// parsed client-side (see AmazonAdsCard.tsx) and rolled up by brand here.
// Deliberately its own table, not marketing_actuals: this is a paid channel
// with its own results to judge (like Google/Meta/Pinterest), not a planned
// budget line — see MerCard.tsx for how it feeds the blended cost figure.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (t: string) => /PGRST205|does not exist|schema cache/i.test(t || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/amazon_ads?select=*&order=month_key.desc`, { headers: hdr(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(text), rows: [] });
  return NextResponse.json({ ok: true, rows: JSON.parse(text) });
}

// Bulk import: { rows: [{ brand_id, month_key, spend, sales, impressions, clicks, note }] }
export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows = (Array.isArray(b.rows) ? b.rows : [])
    .filter((r: any) => r && r.brand_id != null && r.month_key)
    .map((r: any) => ({
      brand_id: Number(r.brand_id), month_key: String(r.month_key),
      spend: Number(r.spend) || 0, sales: Number(r.sales) || 0,
      impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0,
      note: r.note ? String(r.note).slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return NextResponse.json({ ok: false, error: "No valid rows (need brand + month)" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/amazon_ads?on_conflict=brand_id,month_key`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows) });
  const text = await res.text();
  return NextResponse.json({ ok: res.ok, count: rows.length, needsSetup: missing(text), error: res.ok ? undefined : text.slice(0, 200) }, { status: res.ok ? 200 : 500 });
}

// Delete one line: ?brand_id=&month_key=
export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const u = new URL(req.url);
  const brand_id = u.searchParams.get("brand_id"), month_key = u.searchParams.get("month_key");
  if (!brand_id || !month_key) return NextResponse.json({ ok: false }, { status: 400 });
  const q = `brand_id=eq.${encodeURIComponent(brand_id)}&month_key=eq.${encodeURIComponent(month_key)}`;
  const res = await fetch(`${sbUrl}/rest/v1/amazon_ads?${q}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
