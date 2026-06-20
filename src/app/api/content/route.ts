import { NextResponse } from "next/server";

// Content planner CRUD — reads/writes the content_items table in the main
// Supabase project via the service role. Resilient to the table not existing
// yet (returns needsSetup so the UI can show the one-time SQL).

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}

// PostgREST returns PGRST205 / 404 when the table is missing
function isMissingTable(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/content_items?select=*&order=scheduled_date.asc.nullslast`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    if (isMissingTable(res.status, text)) return NextResponse.json({ ok: false, needsSetup: true, items: [] });
    return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (b.brand_id == null || !b.title) return NextResponse.json({ ok: false }, { status: 400 });
  const row = {
    brand_id: b.brand_id, channel: b.channel || "Instagram", title: b.title,
    scheduled_date: b.scheduled_date || null, status: b.status || "idea", notes: b.notes || null,
    draft: b.draft || null,
  };
  const res = await fetch(`${sbUrl}/rest/v1/content_items`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const { id, ...fields } = b;
  fields.updated_at = new Date().toISOString();
  const res = await fetch(`${sbUrl}/rest/v1/content_items?id=eq.${id}`, { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/content_items?id=eq.${id}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
