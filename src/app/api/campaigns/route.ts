import { NextResponse } from "next/server";

// Campaign Calendar CRUD — reads/writes the campaigns table in the main Supabase
// project via the service role (auth is enforced by the app middleware, so any
// logged-in team member can edit). Resilient to the table not existing yet.

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}

function isMissingTable(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

const FIELDS = ["horizon", "campaign", "brand", "tier", "owner", "channel", "status", "key_date", "end_date", "note", "sort_order", "brief"];
function clean(b: any) {
  const row: Record<string, any> = {};
  for (const f of FIELDS) if (b[f] !== undefined) row[f] = b[f];
  return row;
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/campaigns?select=*&order=sort_order.asc`, { headers: headers(), cache: "no-store" });
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
  const row = clean(b);
  if (!row.horizon) return NextResponse.json({ ok: false, message: "Missing horizon" }, { status: 400 });
  if (row.owner === undefined) row.owner = "TBC";
  const res = await fetch(`${sbUrl}/rest/v1/campaigns`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields = clean(b);
  fields.updated_at = new Date().toISOString();
  const res = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${b.id}`, { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${b.id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
