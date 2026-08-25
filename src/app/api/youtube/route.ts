import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Read-only: YouTube subscriber/view trend + top videos per brand, populated
// by scripts/sync_youtube.py (public YouTube Data API v3, no OAuth). No
// write path here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, organic: [], videos: [] }, { status: 500 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };

  let organicUrl = `${sbUrl}/rest/v1/youtube_organic?select=*&order=month_key.asc`;
  let videosUrl = `${sbUrl}/rest/v1/youtube_videos?select=*&order=view_count.desc&limit=12`;
  if (brandId && /^\d+$/.test(brandId)) {
    organicUrl += `&brand_id=eq.${brandId}`;
    videosUrl += `&brand_id=eq.${brandId}`;
  }

  const [oRes, vRes] = await Promise.all([
    fetch(organicUrl, { headers, cache: "no-store" }),
    fetch(videosUrl, { headers, cache: "no-store" }),
  ]);
  const oText = await oRes.text();
  if (!oRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(oRes.status, oText), organic: [], videos: [] });
  const videos = vRes.ok ? JSON.parse((await vRes.text()) || "[]") : [];
  return NextResponse.json({ ok: true, organic: JSON.parse(oText || "[]"), videos });
}
