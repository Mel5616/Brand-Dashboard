import { NextResponse } from "next/server";
import { getAccess, ALL_TABS } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin-only team management. Invite by email (creates the auth user + sends an
// invite link), then store role + allowed_tabs in profiles. Financial tabs are
// stripped — members never get budget/influencer regardless of selection.
export const revalidate = 0;
const FINANCIAL = ["budget", "influencer"];
const cleanTabs = (t: any) => Array.isArray(t) ? t.filter((x: string) => (ALL_TABS as readonly string[]).includes(x) && !FINANCIAL.includes(x)) : [];
async function guard() { return (await getAccess()).role === "admin"; }

export async function GET() {
  if (!(await guard())) return NextResponse.json({ ok: false, members: [] }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id,email,role,allowed_tabs").order("email");
  if (error) return NextResponse.json({ ok: false, members: [], needsSetup: /does not exist|schema cache|PGRST205/i.test(error.message) });
  return NextResponse.json({ ok: true, members: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await guard())) return NextResponse.json({ ok: false }, { status: 403 });
  const b = await req.json().catch(() => null);
  const email = (b?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  const admin = createAdminClient();
  const origin = new URL(req.url).origin;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/callback` });
  let userId = data?.user?.id;
  if (error || !userId) {
    // already invited/registered — find their id so we can still set access
    const list = await admin.auth.admin.listUsers();
    userId = list.data?.users?.find((u: any) => (u.email || "").toLowerCase() === email)?.id;
    if (!userId) return NextResponse.json({ ok: false, error: error?.message || "could not invite" }, { status: 500 });
  }
  const role = b.role === "admin" ? "admin" : "member";
  const { error: upErr } = await admin.from("profiles").upsert(
    { id: userId, email, role, allowed_tabs: role === "admin" ? [] : cleanTabs(b.allowed_tabs) },
    { onConflict: "id" },
  );
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!(await guard())) return NextResponse.json({ ok: false }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.role) fields.role = b.role === "admin" ? "admin" : "member";
  if (Array.isArray(b.allowed_tabs)) fields.allowed_tabs = cleanTabs(b.allowed_tabs);
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(fields).eq("id", b.id);
  return NextResponse.json({ ok: !error });
}

export async function DELETE(req: Request) {
  if (!(await guard())) return NextResponse.json({ ok: false }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("profiles").delete().eq("id", id);
  try { await admin.auth.admin.deleteUser(id); } catch { /* keep going if auth delete fails */ }
  return NextResponse.json({ ok: true });
}
