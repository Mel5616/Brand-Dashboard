import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Partnerships & Affiliates budget pulled from the marketing budget sheet
// (the "Partnerships & Affiliates" channel), by brand × month, for the program FY.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const CHANNEL = "Partnerships & Affiliates";

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, rows: [] }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const ch = encodeURIComponent(CHANNEL);
  const [tRes, bRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/budget_topups?channel=eq.${ch}&select=brand_id,month_key,amount`, { headers: hdr, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?select=id,name`, { headers: hdr, cache: "no-store" }),
  ]);
  if (!tRes.ok || !bRes.ok) return NextResponse.json({ ok: true, rows: [] });
  const topups: any[] = await tRes.json();
  const nameById = new Map((await bRes.json()).map((b: any) => [b.id, b.name]));
  const rows = topups
    .filter(t => nameById.has(t.brand_id))
    .map(t => ({ brand: nameById.get(t.brand_id), month_key: t.month_key, budget: Number(t.amount) || 0 }));
  return NextResponse.json({ ok: true, rows });
}
