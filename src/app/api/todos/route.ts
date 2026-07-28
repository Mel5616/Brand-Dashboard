import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Personal to-dos — strictly scoped to the logged-in user's email.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

async function me() {
  const acc = await getAccess();
  return acc.role ? (acc.user as any)?.email ?? null : null;
}

export async function GET() {
  const email = await me();
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/todos?user_email=eq.${encodeURIComponent(email)}&order=done.asc,created_at.desc&limit=200`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const email = await me();
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const text = String(b.text || "").trim().slice(0, 500);
  if (!text) return NextResponse.json({ ok: false, error: "Empty" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/todos`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify({ user_email: email, text }) });
  const t = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, t) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(t)[0] });
}

export async function PATCH(req: Request) {
  const email = await me();
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = Number(b.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.done !== undefined) { fields.done = !!b.done; fields.done_at = b.done ? new Date().toISOString() : null; }
  if (b.text !== undefined) fields.text = String(b.text).trim().slice(0, 500);
  const res = await fetch(`${sbUrl}/rest/v1/todos?id=eq.${id}&user_email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok });
}

export async function DELETE(req: Request) {
  const email = await me();
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  if (u.searchParams.get("clearDone")) {
    const res = await fetch(`${sbUrl}/rest/v1/todos?user_email=eq.${encodeURIComponent(email)}&done=eq.true`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
    return NextResponse.json({ ok: res.ok });
  }
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/todos?id=eq.${id}&user_email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
