import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import crypto from "crypto";

// Retailer Kits — per-brand, shareable "everything a new retailer needs"
// pack (overview, products, price list, order info, training quiz). List
// is admin-only (this is the builder view); the public side lives at
// /kit/[token] and reads directly via the service-role client.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
const newToken = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, kits: [] }, { status: 500 });

  const [kitsRes, attemptsRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/retailer_kits?select=*&order=updated_at.desc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/retailer_kit_quiz_attempts?select=kit_id,score,total`, { headers: hdr(), cache: "no-store" }),
  ]);
  const text = await kitsRes.text();
  if (!kitsRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(kitsRes.status, text), kits: [] });
  const attempts = attemptsRes.ok ? JSON.parse((await attemptsRes.text()) || "[]") : [];
  return NextResponse.json({ ok: true, kits: JSON.parse(text || "[]"), attempts });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const title = String(b.title ?? "").trim();
  if (!b.brand_id || !title) return NextResponse.json({ ok: false, error: "brand_id and title required" }, { status: 400 });
  const row = { brand_id: Number(b.brand_id), title, share_token: newToken(), created_by: (await getAccess()).user?.email ?? null };
  const res = await fetch(`${sbUrl}/rest/v1/retailer_kits`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, kit: JSON.parse(text)[0] });
}

const FIELDS = ["title", "tagline", "hero_image_url", "overview", "order_info", "status"];
export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (b[f] !== undefined) fields[f] = b[f];
  const res = await fetch(`${sbUrl}/rest/v1/retailer_kits?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/retailer_kits?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
