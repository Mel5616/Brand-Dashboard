import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Promotional calendar — sale periods per brand. Synced from the Monthly Promo
// Tracker; pricing/notes are edited here by admins. Auth enforced by the proxy.

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function isMissingTable(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/promotions?select=*&order=period_start.asc`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, items: [], needsSetup: isMissingTable(res.status, text) });
  return NextResponse.json({ ok: true, items: JSON.parse(text) });
}

// Edit pricing / note (admin). Optionally adjust channel/dates of a manual promo.
export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ["price", "note", "channel", "brand", "brand_id", "period_start", "period_end"]) if (b[k] !== undefined) fields[k] = b[k] === "" ? null : b[k];
  const res = await fetch(`${sbUrl}/rest/v1/promotions?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

// Add a manual promo (admin) — for one-offs not in the sheet.
export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.brand || !b.period_start || !b.period_end) return NextResponse.json({ ok: false, error: "Brand and dates required." }, { status: 400 });
  const row = {
    brand: b.brand, brand_id: b.brand_id ?? null, period_start: b.period_start, period_end: b.period_end,
    channel: b.channel || null, price: b.price || null, note: b.note || null, source: "manual",
  };
  const res = await fetch(`${sbUrl}/rest/v1/promotions`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/promotions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
