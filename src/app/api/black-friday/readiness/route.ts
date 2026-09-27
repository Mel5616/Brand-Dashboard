import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { REWARD_BRANDS } from "@/lib/reviewRewards";

// Black Friday readiness — per brand, three real steps: offer confirmed
// (site_deals.offer_confirmed — a deliberate click from Mel, separate from
// the deal's drafting text, which can say "Confirmed" before she's actually
// signed off), Shopify discount code live (shop_discount_codes, synced from
// each store), site deal approved (site_deals.approved_by). This reads only
// — nothing here creates a code or approves a deal.
//
// black_friday_plan (the earlier brand-by-brand planning table) is
// deliberately NOT used here: it was never updated once real offers were
// confirmed and site_deals rows were created, so every "offer" in it still
// reads "TBC" even for brands that are actually locked in. site_deals is the
// live source of truth for what was actually decided.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

const BF_START = "2026-11-20"; // wide net either side of the 27–30 Nov window, to catch early/late-scheduled codes
const BF_END = "2026-12-02";
const brandByName = (name: string) => REWARD_BRANDS.find(b => b.name.toLowerCase() === name.toLowerCase());

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const [dealsRes, codesRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/site_deals?select=id,brand,title,note,approved_by,offer_confirmed&period_start=lte.${BF_END}&period_end=gte.${BF_START}&order=id.asc`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/shop_discount_codes?select=brand_id,code,starts_at,ends_at,value_type,value&starts_at=lte.${BF_END}&ends_at=gte.${BF_START}`, { headers: h, cache: "no-store" }),
  ]);
  const dealsText = await dealsRes.text();
  if (!dealsRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(dealsRes.status, dealsText), rows: [] });
  const deals: { id: number; brand: string; title: string; note: string | null; approved_by: string | null; offer_confirmed: boolean }[] = JSON.parse(dealsText || "[]");
  const codes: { brand_id: number; code: string; starts_at: string | null; ends_at: string | null; value_type: string | null; value: number | null }[] = codesRes.ok ? JSON.parse((await codesRes.text()) || "[]") : [];

  const rows = deals.map(d => {
    const brand = brandByName(d.brand);
    const brandCodes = brand ? codes.filter(c => c.brand_id === brand.id) : [];
    return {
      dealId: d.id, brand: d.brand, offer: d.title.replace(/^Black Friday:\s*/i, ""), note: d.note,
      confirmed: d.offer_confirmed,
      codeLive: brandCodes.length > 0,
      codes: brandCodes.map(c => ({ code: c.code, value_type: c.value_type, value: c.value })),
      dealApproved: !!d.approved_by,
    };
  });

  return NextResponse.json({ ok: true, rows });
}
