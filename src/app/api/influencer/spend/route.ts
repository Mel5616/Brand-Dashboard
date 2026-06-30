import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Influencer spend aggregated by brand × month, for the budget's "Influencer
// Marketing" channel actual (so it flows in automatically, like Google/Meta).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, rows: [] }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const [eRes, bRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/influencer_entries?select=brand,month_key,total_cost,gifting_cost,influencer_cost`, { headers: hdr, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?select=id,name`, { headers: hdr, cache: "no-store" }),
  ]);
  if (!eRes.ok || !bRes.ok) return NextResponse.json({ ok: true, rows: [] });
  const entries: any[] = await eRes.json();
  const brands: any[] = await bRes.json();
  const idByName = (name: string) => {
    const n = String(name || "").trim().toLowerCase();
    return brands.find(b => b.name.toLowerCase() === n)?.id
      ?? brands.find(b => b.name.toLowerCase().startsWith(n) || n.startsWith(b.name.toLowerCase()))?.id
      ?? null;
  };
  const map = new Map<string, number>();
  for (const e of entries) {
    const bid = idByName(e.brand);
    if (bid == null || !e.month_key) continue;
    const cost = Number(e.total_cost) || (Number(e.gifting_cost) || 0) + (Number(e.influencer_cost) || 0);
    const key = `${bid}|${e.month_key}`;
    map.set(key, (map.get(key) ?? 0) + cost);
  }
  const rows = [...map.entries()].map(([k, spend]) => { const [brand_id, month_key] = k.split("|"); return { brand_id: Number(brand_id), month_key, spend }; });
  return NextResponse.json({ ok: true, rows });
}
