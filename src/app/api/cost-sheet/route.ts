import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Live cost sheet (synced from SharePoint via Microsoft Graph). Read-only —
// the sheet itself is the source of truth, edited in SharePoint, not here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const [items, meta] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/cost_sheet_items?select=*&order=brand,category,product_name`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/cost_sheet_meta?select=*`, { headers: h, cache: "no-store" }),
  ]);
  const itemsText = await items.text();
  if (!items.ok) return NextResponse.json({ ok: true, needsSetup: items.status === 404 || /PGRST205|does not exist/i.test(itemsText), items: [], meta: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(itemsText || "[]"), meta: meta.ok ? JSON.parse((await meta.text()) || "[]") : [] });
}
