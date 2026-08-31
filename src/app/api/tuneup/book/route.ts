import { NextResponse } from "next/server";
import { storeCreds } from "@/lib/shopifyMint";
import { cartPermalink } from "@/lib/tuneupShopify";

// Public, CORS-open — called from the booking HTML embedded on the UPPAbaby
// storefront. Creates a pending_payment row, then hands back the Shopify
// cart permalink to actually collect the $20; /api/tuneup/sync confirms it
// once the order exists (see tuneupShopify.ts for why — no webhooks here).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const UPPABABY_BRAND_ID = 5;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500, headers: cors });
  const variantId = process.env.TUNEUP_VARIANT_ID;
  if (!variantId) return NextResponse.json({ ok: false, error: "Booking isn't set up yet — ask Mel to finish Tune-Up Day setup" }, { status: 500, headers: cors });
  const cred = storeCreds().find(s => s.id === UPPABABY_BRAND_ID);
  if (!cred) return NextResponse.json({ ok: false, error: "Store not configured" }, { status: 500, headers: cors });

  let b: { tuneup_day_id?: string; name?: string; email?: string; phone?: string }; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: cors }); }
  if (!b.tuneup_day_id || !b.name || !b.email) return NextResponse.json({ ok: false, error: "Name, email and a day are required" }, { status: 400, headers: cors });

  const dayRes = await rest(`tuneup_days?id=eq.${encodeURIComponent(b.tuneup_day_id)}&select=*`);
  const day = (await dayRes.json().catch(() => []))?.[0];
  if (!day) return NextResponse.json({ ok: false, error: "That Tune-Up Day couldn't be found" }, { status: 400, headers: cors });

  const row = { tuneup_day_id: b.tuneup_day_id, name: b.name.slice(0, 200), email: b.email.slice(0, 200), phone: (b.phone || "").slice(0, 50) || null, amount: day.booking_fee };
  const ins = await rest("tuneup_bookings", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await ins.text();
  if (!ins.ok) return NextResponse.json({ ok: false, error: /PGRST205|does not exist/i.test(text) ? "Run add_tuneup_bookings.sql first" : "Couldn't save your booking" }, { status: 500, headers: cors });
  const booking = JSON.parse(text)[0];

  const dayLabel = `${day.state} — ${day.event_date}`;
  const url = cartPermalink(cred.domain, variantId, booking.id, dayLabel);
  return NextResponse.json({ ok: true, checkoutUrl: url }, { headers: cors });
}
