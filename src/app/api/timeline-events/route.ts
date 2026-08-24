import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Portfolio-wide "what's landing and when" timeline — stock arrivals,
// product launches, coming-soon teasers. Any signed-in user can view;
// only admins add/edit/remove.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

const FIELDS = ["brand_id", "event_type", "title", "date", "end_date", "product_name", "quantity", "status", "note", "image_url"];
function clean(b: any) {
  const row: Record<string, any> = {};
  for (const f of FIELDS) if (b[f] !== undefined) row[f] = (f === "end_date" && b[f] === "") ? null : b[f];
  return row;
}

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, events: [] }, { status: 500 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  let q = `${sbUrl}/rest/v1/timeline_events?select=*&order=date.asc`;
  if (brandId && /^\d+$/.test(brandId)) q += `&brand_id=eq.${brandId}`;
  const res = await fetch(q, { headers: hdr(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), events: [] });
  return NextResponse.json({ ok: true, events: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const title = String(b.title ?? "").trim();
  if (!b.brand_id || !title || !b.date) return NextResponse.json({ ok: false, error: "brand_id, title and date required" }, { status: 400 });
  const row = { ...clean(b), title, created_by: acc.user!.email };
  const res = await fetch(`${sbUrl}/rest/v1/timeline_events`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, event: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields = { ...clean(b), updated_at: new Date().toISOString() };
  const res = await fetch(`${sbUrl}/rest/v1/timeline_events?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/timeline_events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
