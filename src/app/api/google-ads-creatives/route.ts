import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Read-only: top-performing Google Ads copy + live creative images per
// brand, populated by scripts/sync.py's fetch_google_ads_creatives() and
// fetch_google_ads_images(). No write path here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, creatives: [], images: [] }, { status: 500 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  if (!brandId || !/^\d+$/.test(brandId)) return NextResponse.json({ ok: false, creatives: [], images: [] }, { status: 400 });
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
  const [cRes, iRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/google_ads_creatives?brand_id=eq.${brandId}&select=*&order=clicks.desc&limit=20`, { headers, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/google_ads_images?brand_id=eq.${brandId}&select=*&order=impressions.desc.nullslast,id.asc&limit=10`, { headers, cache: "no-store" }),
  ]);
  const cText = await cRes.text();
  if (!cRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(cRes.status, cText), creatives: [], images: [] });
  const images = iRes.ok ? JSON.parse((await iRes.text()) || "[]") : [];
  return NextResponse.json({ ok: true, creatives: JSON.parse(cText || "[]"), images });
}
