import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Manually-maintained competitor notes for the Activations report. Any
// signed-in user can view; only admins add/edit/remove.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, competitors: [] }, { status: 500 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  let q = `${sbUrl}/rest/v1/brand_competitors?select=*&order=name.asc`;
  if (brandId && /^\d+$/.test(brandId)) q += `&brand_id=eq.${brandId}`;
  const res = await fetch(q, { headers: hdr(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), competitors: [] });
  return NextResponse.json({ ok: true, competitors: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const name = String(b.name ?? "").trim();
  if (!b.brand_id || !name) return NextResponse.json({ ok: false, error: "brand_id and name required" }, { status: 400 });
  const row = { brand_id: Number(b.brand_id), name, notes: b.notes ?? null, updated_by: acc.user!.email, updated_at: new Date().toISOString() };
  const res = await fetch(`${sbUrl}/rest/v1/brand_competitors`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, competitor: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, any> = { updated_by: acc.user!.email, updated_at: new Date().toISOString() };
  if (b.name !== undefined) fields.name = String(b.name).trim();
  if (b.notes !== undefined) fields.notes = b.notes;
  const res = await fetch(`${sbUrl}/rest/v1/brand_competitors?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/brand_competitors?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
