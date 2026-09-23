import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest, missingTable } from "@/lib/registry";

// Weekly subscribes/unsubscribes per Klaviyo list per brand, last 12 weeks
// (klaviyo_list_growth, synced every 3 hours): what is actually growing
// each brand's database and through which door.
export const revalidate = 0;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await rest("klaviyo_list_growth?select=brand_id,week_start,list_name,subscribes,unsubscribes&order=week_start.asc&limit=5000");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missingTable(text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}
