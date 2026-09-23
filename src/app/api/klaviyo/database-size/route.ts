import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Combined Klaviyo database size, portfolio-wide (Lifecycle Flows tab).
// klaviyo_metrics.list_size is each brand's "Active Subscribers" segment
// count, already synced monthly by scripts/sync_klaviyo.py from that
// brand's own Klaviyo account (most brands share the Coolkidz account;
// UPPAbaby and smarTrike have their own — see klaviyoBrandKeys.ts). This
// route just reads the latest synced number per brand and adds them up —
// no live Klaviyo call, so it loads instantly.
//
// "Combined" here means summed list sizes, not deduplicated unique people:
// someone subscribed to two brands' lists is counted once per brand. Real
// duplication across 12 brand-specific segments is expected to be small,
// but it's not nothing, so the UI says "combined" rather than "unique".
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });

  const [metricsRes, brandsRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/klaviyo_metrics?select=brand_id,month_key,list_size&order=month_key.desc`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?select=id,name,live`, { headers: h, cache: "no-store" }),
  ]);
  const metricsText = await metricsRes.text();
  if (!metricsRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(metricsRes.status, metricsText), total: 0, brands: [] });
  const metrics = JSON.parse(metricsText || "[]") as { brand_id: number; month_key: string; list_size: number }[];
  const brands = brandsRes.ok ? await brandsRes.json().catch(() => []) : [];
  const brandName = new Map<number, { name: string; live: boolean }>(brands.map((b: any) => [b.id, { name: b.name, live: b.live !== false }]));

  // Most recent month_key per brand that actually has a list_size on it —
  // a brand can have rows with list_size 0 while Klaviyo metrics were still
  // being backfilled, so prefer the latest row that's actually nonzero,
  // falling back to the latest row of any size if every row is 0.
  const latestAny = new Map<number, { month_key: string; list_size: number }>();
  const latestNonzero = new Map<number, { month_key: string; list_size: number }>();
  for (const m of metrics) {
    if (!latestAny.has(m.brand_id)) latestAny.set(m.brand_id, m);
    if (m.list_size > 0 && !latestNonzero.has(m.brand_id)) latestNonzero.set(m.brand_id, m);
  }

  const rows = Array.from(latestAny.keys()).map(brandId => {
    const chosen = latestNonzero.get(brandId) || latestAny.get(brandId)!;
    const b = brandName.get(brandId);
    return { brand_id: brandId, name: b?.name ?? `Brand ${brandId}`, live: b?.live ?? true, list_size: chosen.list_size, month_key: chosen.month_key };
  }).sort((a, b) => b.list_size - a.list_size);

  const total = rows.reduce((sum, r) => sum + r.list_size, 0);
  return NextResponse.json({ ok: true, total, brands: rows });
}
