import { NextResponse } from "next/server";
import { tuneupKeyOk } from "@/lib/tuneupKey";

// Backs the public /tuneup-checkin/[dayId] page sales teams use on the day —
// no dashboard login, shared-key gated (tuneupKeyOk). GET lists this day's
// paid bookings; PATCH marks one checked in.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });

export async function GET(req: Request) {
  if (!(await tuneupKeyOk(req))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const dayId = new URL(req.url).searchParams.get("day_id");
  if (!dayId) return NextResponse.json({ ok: false, error: "Missing day_id" }, { status: 400 });
  const [dayRes, bookingsRes] = await Promise.all([
    rest(`tuneup_days?id=eq.${encodeURIComponent(dayId)}&select=*`),
    rest(`tuneup_bookings?tuneup_day_id=eq.${encodeURIComponent(dayId)}&status=in.(booked,checked_in)&select=*&order=name.asc`),
  ]);
  const day = (await dayRes.json().catch(() => []))?.[0];
  if (!day) return NextResponse.json({ ok: false, error: "Tune-Up Day not found" }, { status: 404 });
  const bookings = await bookingsRes.json().catch(() => []);
  return NextResponse.json({ ok: true, day, bookings });
}

export async function PATCH(req: Request) {
  if (!(await tuneupKeyOk(req))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: { booking_id?: string; checked_in?: boolean }; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.booking_id) return NextResponse.json({ ok: false, error: "Missing booking_id" }, { status: 400 });
  const body = b.checked_in === false ? { status: "booked", checked_in_at: null } : { status: "checked_in", checked_in_at: new Date().toISOString() };
  await rest(`tuneup_bookings?id=eq.${encodeURIComponent(b.booking_id)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(body) });
  return NextResponse.json({ ok: true });
}
