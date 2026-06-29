import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAccess } from "@/lib/access";

// Create + list open-tracked snapshot share links. Admin only. The public
// /s/<token> route serves the stored HTML and logs each open.
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function isMissingTable(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

// List links for a brand + month (no HTML, just stats).
export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand_id");
  const month = searchParams.get("month_key");
  const parts = ["select=id,token,label,recipient,created_at,open_count,first_opened_at,last_opened_at,expires_at", "order=created_at.desc"];
  if (brand && /^\d+$/.test(brand)) parts.push(`brand_id=eq.${brand}`);
  if (month && /^\d{4}-\d{2}$/.test(month)) parts.push(`month_key=eq.${month}`);
  const res = await fetch(`${sbUrl}/rest/v1/snapshot_shares?${parts.join("&")}`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, items: [], needsSetup: isMissingTable(res.status, text) });
  return NextResponse.json({ ok: true, items: JSON.parse(text) });
}

// Create a share link (stores a frozen copy of the rendered HTML).
export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.html) return NextResponse.json({ ok: false, error: "Missing snapshot." }, { status: 400 });
  const token = randomUUID().replace(/-/g, "").slice(0, 20);
  const days = Number(b.expiryDays) > 0 ? Number(b.expiryDays) : 5; // default 5 days
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();
  const row = {
    token, brand_id: b.brand_id ?? null, brand: b.brand ?? null, month_key: b.month_key ?? null,
    label: b.label ?? null, recipient: b.recipient ?? null, html: String(b.html), created_by: access.user!.email, expires_at,
  };
  const res = await fetch(`${sbUrl}/rest/v1/snapshot_shares`, { method: "POST", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, text), error: "Could not create link." }, { status: 500 });
  return NextResponse.json({ ok: true, token });
}

// Extend (renew) a link's expiry by N days from now (default 5). Admin.
export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const days = Number(b.expiryDays) > 0 ? Number(b.expiryDays) : 5;
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();
  const res = await fetch(`${sbUrl}/rest/v1/snapshot_shares?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify({ expires_at }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

// Delete a link (admin).
export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/snapshot_shares?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
