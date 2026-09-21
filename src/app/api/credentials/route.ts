import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { encryptPassword, decryptPassword, canEncrypt } from "@/lib/credentialsCrypto";

// Passwords vault (Operations > Passwords). Hard admin-only — unlike every
// other tab in this dashboard, this is never grantable to a member, checked
// here on every request regardless of what the client sends or what's in
// allowedTabs (that's enforced separately in the nav, but this is the real
// boundary). Passwords are encrypted at rest; the list endpoint never
// returns a decrypted or even encrypted password, only "reveal" does, one
// entry at a time.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

async function requireAdmin() {
  const acc = await getAccess();
  if (acc.role !== "admin") return null;
  return acc;
}

export async function GET() {
  const acc = await requireAdmin();
  if (!acc) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/credentials?select=id,name,url,username,notes,created_by,updated_by,created_at,updated_at&order=name.asc`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]"), keyConfigured: canEncrypt() });
}

export async function POST(req: Request) {
  const acc = await requireAdmin();
  if (!acc) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!canEncrypt()) return NextResponse.json({ ok: false, error: "CREDENTIALS_ENCRYPTION_KEY not configured" }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const name = String(b.name || "").trim();
  const password = String(b.password || "");
  if (!name || !password) return NextResponse.json({ ok: false, error: "Name and password are required" }, { status: 400 });

  const row = {
    name: name.slice(0, 200),
    url: b.url ? String(b.url).slice(0, 500) : null,
    username: b.username ? String(b.username).slice(0, 200) : null,
    password_encrypted: encryptPassword(password),
    notes: b.notes ? String(b.notes).slice(0, 1000) : null,
    created_by: acc.user?.email ?? null,
    updated_by: acc.user?.email ?? null,
  };
  const res = await fetch(`${sbUrl}/rest/v1/credentials`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  const [item] = JSON.parse(text);
  delete item.password_encrypted;
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: Request) {
  const acc = await requireAdmin();
  if (!acc) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const action = String(b.action || "edit");

  if (action === "reveal") {
    const res = await fetch(`${sbUrl}/rest/v1/credentials?id=eq.${id}&select=password_encrypted`, { headers: h(), cache: "no-store" });
    const rows = await res.json().catch(() => []);
    const enc = rows[0]?.password_encrypted;
    if (!enc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try {
      return NextResponse.json({ ok: true, password: decryptPassword(enc) });
    } catch {
      return NextResponse.json({ ok: false, error: "Couldn't decrypt — the encryption key may have changed" }, { status: 500 });
    }
  }

  if (action === "edit") {
    if (!canEncrypt()) return NextResponse.json({ ok: false, error: "CREDENTIALS_ENCRYPTION_KEY not configured" }, { status: 500 });
    const fields: any = { updated_at: new Date().toISOString(), updated_by: acc.user?.email ?? null };
    if (b.name !== undefined) fields.name = String(b.name).slice(0, 200);
    if (b.url !== undefined) fields.url = b.url ? String(b.url).slice(0, 500) : null;
    if (b.username !== undefined) fields.username = b.username ? String(b.username).slice(0, 200) : null;
    if (b.notes !== undefined) fields.notes = b.notes ? String(b.notes).slice(0, 1000) : null;
    if (b.password) fields.password_encrypted = encryptPassword(String(b.password));
    const res = await fetch(`${sbUrl}/rest/v1/credentials?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
    return NextResponse.json({ ok: res.ok });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const acc = await requireAdmin();
  if (!acc) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/credentials?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
