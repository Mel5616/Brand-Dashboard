import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin/team view of submitted website change requests. Read: any signed-in
// user. Status/note updates: any signed-in user (matches Sales Hub — the
// whole team actions these, not just admins).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHANGE_TYPES = ["copy", "broken_link", "new_page", "image_banner", "product_info", "other"];

// Staff can log an issue straight from this tab, not just via the public
// /website-request share link — same table, same shape, just signed-in
// instead of key-gated, and no email notification (the team already has
// eyes on this tab).
export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = String(b.brand || "").trim().slice(0, 80);
  const description = String(b.description || "").trim().slice(0, 2000);
  if (!brand || !description) return NextResponse.json({ ok: false, error: "Brand and description are required" }, { status: 400 });
  const requesterEmail = String(b.requester_email || "").trim().toLowerCase();
  const row = {
    brand,
    page_url: b.page_url ? String(b.page_url).trim().slice(0, 500) : null,
    change_type: CHANGE_TYPES.includes(b.change_type) ? b.change_type : "other",
    description,
    requester_name: b.requester_name ? String(b.requester_name).trim().slice(0, 100) : (acc.user?.email ?? "Team"),
    requester_email: emailRe.test(requesterEmail) ? requesterEmail : (acc.user?.email ?? null),
    priority: ["low", "normal", "urgent"].includes(b.priority) ? b.priority : "normal",
    ...(b.campaign_id ? { campaign_id: String(b.campaign_id), campaign_name: b.campaign_name ? String(b.campaign_name).slice(0, 200) : null } : {}),
  };
  const res = await fetch(`${sbUrl}/rest/v1/website_requests`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  let q = `${sbUrl}/rest/v1/website_requests?select=*&order=created_at.desc&limit=500`;
  if (campaignId) q += `&campaign_id=eq.${encodeURIComponent(campaignId)}`;
  const res = await fetch(q, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function PATCH(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) fields.status = String(b.status).slice(0, 20);
  if (b.admin_note !== undefined) fields.admin_note = b.admin_note ? String(b.admin_note).slice(0, 1000) : null;
  if (b.priority !== undefined) fields.priority = String(b.priority).slice(0, 10);
  const res = await fetch(`${sbUrl}/rest/v1/website_requests?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/website_requests?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
