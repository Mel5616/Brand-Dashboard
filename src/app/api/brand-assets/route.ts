import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Brand asset links directory. GET: all links. POST: save / delete (admin).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/brand_asset_links?select=*&order=brand.asc,sort_order.asc,created_at.asc`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), links: [] });
  return NextResponse.json({ ok: true, links: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (b.action === "delete") {
    if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
    const res = await fetch(`${sbUrl}/rest/v1/brand_asset_links?id=eq.${encodeURIComponent(String(b.id))}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
    return NextResponse.json({ ok: res.ok });
  }

  const brand = String(b.brand || "").trim().slice(0, 80);
  const label = String(b.label || "").trim().slice(0, 120);
  let url = String(b.url || "").trim().slice(0, 800);
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!brand || !label || !url) return NextResponse.json({ ok: false, error: "Brand, label and link required" }, { status: 400 });
  const row: any = { brand, label, url, notes: String(b.notes || "").slice(0, 400) || null, added_by: access.user?.email ?? null };
  const path = b.id ? `brand_asset_links?id=eq.${encodeURIComponent(String(b.id))}` : "brand_asset_links";
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, { method: b.id ? "PATCH" : "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text) }, { status: 500 });
  const out = JSON.parse(text);
  return NextResponse.json({ ok: true, item: Array.isArray(out) ? out[0] : out });
}
