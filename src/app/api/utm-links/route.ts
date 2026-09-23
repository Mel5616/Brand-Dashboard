import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { brandMatch } from "@/lib/channels";

// UTM Tracking (Plan > UTM Tracking) — a shared link library replacing the
// "UTM - ALL BRANDS.xlsx" spreadsheet. Any signed-in team member with the tab
// can add a link; the dashboard builds the tracked final URL from the parts
// so nobody hand-assembles a query string wrong. Deletion is admin-only.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

function buildFinalUrl(landingPage: string, source: string, medium: string, campaign: string) {
  const u = new URL(landingPage);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

// A short code a QR/short-link can point to forever, independent of the
// destination — see src/app/l/[code]/route.ts. Collision odds at 36^8 are
// negligible, but check anyway since it's one cheap query.
async function newShortCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = Math.random().toString(36).slice(2, 10);
    const res = await fetch(`${sbUrl}/rest/v1/utm_links?short_code=eq.${code}&select=id`, { headers: h() });
    const rows = await res.json().catch(() => []);
    if (!rows?.length) return code;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function GET() {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  const [linksRes, brandsRes, statsRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/utm_links?select=*&order=created_at.desc&limit=2000`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brands?select=id,name`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/utm_link_stats?select=*`, { headers: h(), cache: "no-store" }),
  ]);
  const text = await linksRes.text();
  if (!linksRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(linksRes.status, text), items: [] });
  const items = JSON.parse(text || "[]");

  // Backfill short_code on any link created before it existed — a one-time
  // cost per row, so "Copy short link" and the QR code are always ready.
  const missingCode = items.filter((i: any) => "short_code" in i && !i.short_code);
  if (missingCode.length) {
    await Promise.all(missingCode.map(async (i: any) => {
      const code = await newShortCode();
      i.short_code = code;
      await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${i.id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ short_code: code }) }).catch(() => {});
    }));
  }

  // GA4 traffic per link (scripts/sync_utm_stats.py), matched by brand name →
  // brand_id and case-insensitive source/medium/campaign. Stats are optional —
  // a link with none synced yet just has no stats attached.
  if (brandsRes.ok && statsRes.ok) {
    const brands = await brandsRes.json().catch(() => []);
    const stats = await statsRes.json().catch(() => []);
    const statKey = (bid: number, source: string, medium: string, campaign: string) => `${bid}|${source.toLowerCase()}|${medium.toLowerCase()}|${campaign.toLowerCase()}`;
    const statMap = new Map(stats.map((s: any) => [statKey(s.brand_id, s.source, s.medium, s.campaign || ""), s]));
    for (const item of items) {
      const b = item.brand ? brands.find((x: any) => brandMatch(x.name, item.brand)) : null;
      item.stats = b ? statMap.get(statKey(b.id, item.source, item.medium, item.campaign || "")) ?? null : null;
    }
  }
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const partner = String(b.partner || "").trim().slice(0, 200);
  const source = String(b.source || "").trim().slice(0, 100);
  const medium = String(b.medium || "").trim().slice(0, 100);
  const campaign = String(b.campaign || "").trim().slice(0, 150);
  const brand = b.brand ? String(b.brand).trim().slice(0, 80) : null;
  const description = b.description ? String(b.description).trim().slice(0, 500) : null;
  const landingPage = String(b.landing_page || "").trim();

  if (!partner) return NextResponse.json({ ok: false, error: "Partner / activity is required" }, { status: 400 });
  if (!source) return NextResponse.json({ ok: false, error: "Source is required" }, { status: 400 });
  if (!medium) return NextResponse.json({ ok: false, error: "Medium is required" }, { status: 400 });
  // Campaign isn't optional — the site's own promo/offer detection reads
  // source + campaign off the URL, so a link without one won't trigger it.
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign is required" }, { status: 400 });
  let finalUrl: string;
  try {
    if (!/^https?:\/\//i.test(landingPage)) throw new Error();
    finalUrl = buildFinalUrl(landingPage, source, medium, campaign);
  } catch {
    return NextResponse.json({ ok: false, error: "Landing page must be a full URL, e.g. https://uppababy.com.au/" }, { status: 400 });
  }

  const shortCode = await newShortCode();
  const row = { brand, partner, source, medium, campaign, description, landing_page: landingPage, final_url: finalUrl, short_code: shortCode, created_by: acc.user?.email ?? null };
  const res = await fetch(`${sbUrl}/rest/v1/utm_links`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

// Edit in place — id and short_code never change, so any QR code already
// printed for this link keeps working and just starts resolving to the
// updated destination on its next scan.
export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const existingRes = await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: h(), cache: "no-store" });
  const existing = (await existingRes.json().catch(() => []))[0];
  if (!existing) return NextResponse.json({ ok: false, error: "Link not found" }, { status: 404 });

  const partner = b.partner !== undefined ? String(b.partner).trim().slice(0, 200) : existing.partner;
  const source = b.source !== undefined ? String(b.source).trim().slice(0, 100) : existing.source;
  const medium = b.medium !== undefined ? String(b.medium).trim().slice(0, 100) : existing.medium;
  const campaign = b.campaign !== undefined ? String(b.campaign).trim().slice(0, 150) : existing.campaign;
  const brand = b.brand !== undefined ? (String(b.brand).trim().slice(0, 80) || null) : existing.brand;
  const description = b.description !== undefined ? (String(b.description).trim().slice(0, 500) || null) : existing.description;
  const landingPage = b.landing_page !== undefined ? String(b.landing_page).trim() : existing.landing_page;

  if (!partner || !source || !medium || !campaign) return NextResponse.json({ ok: false, error: "Partner/activity, source, medium and campaign are required" }, { status: 400 });
  let finalUrl: string;
  try {
    if (!/^https?:\/\//i.test(landingPage)) throw new Error();
    finalUrl = buildFinalUrl(landingPage, source, medium, campaign);
  } catch {
    return NextResponse.json({ ok: false, error: "Landing page must be a full URL, e.g. https://uppababy.com.au/" }, { status: 400 });
  }

  const fields = { partner, source, medium, campaign, brand, description, landing_page: landingPage, final_url: finalUrl };
  const res = await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
