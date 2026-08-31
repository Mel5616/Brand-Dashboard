import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Tune-Up Day events. GET is public (read-only, upcoming days only) and
// CORS-open — the customer-facing booking page runs as embedded HTML on
// the UPPAbaby Shopify storefront, a different origin, and fetches this
// directly. POST (create a new day) is admin-only, from the dashboard.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500, headers: cors });
  const url = new URL(req.url);
  const admin = url.searchParams.get("all") === "1";
  const acc = admin ? await getAccess() : null;
  const today = new Date().toISOString().slice(0, 10);
  const filter = admin && acc?.role === "admin" ? "" : `&status=eq.scheduled&event_date=gte.${today}`;
  const res = await rest(`tuneup_days?select=*${filter}&order=event_date.asc`);
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(text), days: [] }, { headers: cors });
  return NextResponse.json({ ok: true, days: JSON.parse(text || "[]") }, { headers: cors });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403, headers: cors });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500, headers: cors });
  let b: { state?: string; location?: string; event_date?: string; capacity?: number }; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: cors }); }
  if (!b.state || !b.event_date) return NextResponse.json({ ok: false, error: "State and date required" }, { status: 400, headers: cors });
  const row = { state: b.state, location: b.location || null, event_date: b.event_date, capacity: b.capacity || null, created_by: acc.user?.email ?? null };
  const ins = await rest("tuneup_days", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await ins.text();
  if (!ins.ok) return NextResponse.json({ ok: false, error: /PGRST205|does not exist/i.test(text) ? "Run add_tuneup_days.sql first" : "Couldn't create" }, { status: 500, headers: cors });
  return NextResponse.json({ ok: true, day: JSON.parse(text)[0] }, { headers: cors });
}
