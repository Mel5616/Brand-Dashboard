import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Read-only: top-performing Google Ads copy per brand, populated by
// scripts/sync.py's fetch_google_ads_creatives(). No write path here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, creatives: [] }, { status: 500 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  if (!brandId || !/^\d+$/.test(brandId)) return NextResponse.json({ ok: false, creatives: [] }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/google_ads_creatives?brand_id=eq.${brandId}&select=*&order=clicks.desc&limit=20`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), creatives: [] });
  return NextResponse.json({ ok: true, creatives: JSON.parse(text || "[]") });
}
