import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin view of issued review-reward codes, for the Reviews tab.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/review_requests?select=*&order=created_at.desc&limit=500`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}
