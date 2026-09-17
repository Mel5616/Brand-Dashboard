import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// UTM Tracking (Plan > UTM Tracking) — a shared link library replacing the
// "UTM - ALL BRANDS.xlsx" spreadsheet. Any signed-in team member with the tab
// can add a link; the dashboard builds the tracked final URL from the parts
// so nobody hand-assembles a query string wrong. Deletion is admin-only.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

function buildFinalUrl(landingPage: string, source: string, medium: string, campaign: string | null) {
  const u = new URL(landingPage);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  if (campaign) u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

export async function GET() {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/utm_links?select=*&order=created_at.desc&limit=2000`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const partner = String(b.partner || "").trim().slice(0, 200);
  const source = String(b.source || "").trim().slice(0, 100);
  const medium = String(b.medium || "").trim().slice(0, 100);
  const campaign = b.campaign ? String(b.campaign).trim().slice(0, 150) : null;
  const brand = b.brand ? String(b.brand).trim().slice(0, 80) : null;
  const landingPage = String(b.landing_page || "").trim();

  if (!partner) return NextResponse.json({ ok: false, error: "Partner / activity is required" }, { status: 400 });
  if (!source) return NextResponse.json({ ok: false, error: "Source is required" }, { status: 400 });
  if (!medium) return NextResponse.json({ ok: false, error: "Medium is required" }, { status: 400 });
  let finalUrl: string;
  try {
    if (!/^https?:\/\//i.test(landingPage)) throw new Error();
    finalUrl = buildFinalUrl(landingPage, source, medium, campaign);
  } catch {
    return NextResponse.json({ ok: false, error: "Landing page must be a full URL, e.g. https://uppababy.com.au/" }, { status: 400 });
  }

  const row = { brand, partner, source, medium, campaign, landing_page: landingPage, final_url: finalUrl, created_by: acc.user?.email ?? null };
  const res = await fetch(`${sbUrl}/rest/v1/utm_links`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
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
