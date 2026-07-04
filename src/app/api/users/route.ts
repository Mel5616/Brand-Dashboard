import { NextResponse } from "next/server";
import { getAccess, ALL_TABS } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mel@coolkidz.com.au")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function cleanTabs(t: unknown): string[] {
  if (!Array.isArray(t)) return [];
  return t.filter(x => (ALL_TABS as readonly string[]).includes(x));
}

// List all users (auth account + profile role/tabs), newest first.
export async function GET() {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const { data: profiles } = await admin.from("profiles").select("id, role, allowed_tabs, name, disabled");
  const pById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const rows = data.users.map(u => {
    const p: any = pById.get(u.id) || {};
    const envAdmin = ADMIN_EMAILS.includes((u.email || "").toLowerCase());
    return {
      id: u.id, email: u.email, name: p.name ?? "",
      role: envAdmin || p.role === "admin" ? "admin" : "member",
      allowed_tabs: p.allowed_tabs ?? [],
      disabled: !!p.disabled,
      envAdmin,
      last_sign_in_at: u.last_sign_in_at, created_at: u.created_at,
    };
  }).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return NextResponse.json({ ok: true, rows, allTabs: ALL_TABS });
}

// Create a user with email + password, plus role / tab access.
export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const email = String(b.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  const role = b.role === "admin" ? "admin" : "member";
  const allowed_tabs = role === "admin" ? [...ALL_TABS] : cleanTabs(b.allowed_tabs);
  const admin = createAdminClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://marketing.coolkidz.com.au";

  let userId: string;
  if (b.invite) {
    // Invite: Supabase emails a link; the user sets their own password on /auth/set-password.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/callback?next=/auth/set-password` });
    if (error || !data.user) return NextResponse.json({ ok: false, error: error?.message || "Could not send the invite (is email set up in Supabase?)." }, { status: 400 });
    userId = data.user.id;
  } else {
    const password = String(b.password || "");
    if (password.length < 8) return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return NextResponse.json({ ok: false, error: error?.message || "Could not create user." }, { status: 400 });
    userId = data.user.id;
  }
  await admin.from("profiles").upsert({ id: userId, role, allowed_tabs, name: b.name ? String(b.name).slice(0, 80) : null, disabled: false });
  await logActivity({ userId: access.user!.id, email: access.user!.email, action: "create", target: "users", detail: { created: email, role, invited: !!b.invite } });
  return NextResponse.json({ ok: true });
}

// Update role / tabs / name, reset password, or enable/disable an account.
export async function PATCH(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();

  if (b.password !== undefined) {
    if (String(b.password).length < 8) return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(id, { password: String(b.password) });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logActivity({ userId: access.user!.id, email: access.user!.email, action: "update", target: "users", detail: { reset_password_for: id } });
  }

  // Send password reset: email the user a link to set a new password themselves.
  if (b.send_reset) {
    const { data: got } = await admin.auth.admin.getUserById(id);
    const email = got?.user?.email;
    if (!email) return NextResponse.json({ ok: false, error: "User not found." }, { status: 400 });
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://marketing.coolkidz.com.au";
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=/auth/set-password` });
    if (error) return NextResponse.json({ ok: false, error: error.message || "Couldn't send the reset email (is email set up in Supabase?)." }, { status: 400 });
    await logActivity({ userId: access.user!.id, email: access.user!.email, action: "update", target: "users", detail: { sent_password_reset_to: email } });
    return NextResponse.json({ ok: true, message: `Password reset link sent to ${email}.` });
  }

  // Reset 2FA: remove the user's enrolled authenticator factors so they re-enrol.
  if (b.reset_mfa) {
    try {
      const { data: f } = await (admin.auth.admin as any).mfa.listFactors({ userId: id });
      for (const factor of (f?.factors ?? [])) await (admin.auth.admin as any).mfa.deleteFactor({ id: factor.id, userId: id });
      await logActivity({ userId: access.user!.id, email: access.user!.email, action: "update", target: "users", detail: { reset_2fa_for: id } });
    } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message || "Couldn't reset 2FA." }, { status: 400 }); }
  }

  const prof: any = {};
  if (b.role !== undefined) prof.role = b.role === "admin" ? "admin" : "member";
  if (b.name !== undefined) prof.name = b.name ? String(b.name).slice(0, 80) : null;
  if (b.disabled !== undefined) prof.disabled = !!b.disabled;
  if (b.allowed_tabs !== undefined) prof.allowed_tabs = cleanTabs(b.allowed_tabs);
  if (prof.role === "admin") prof.allowed_tabs = [...ALL_TABS];
  if (Object.keys(prof).length) {
    await admin.from("profiles").upsert({ id, ...prof });
    await logActivity({ userId: access.user!.id, email: access.user!.email, action: "update", target: "users", detail: { updated: id, ...prof } });
  }
  return NextResponse.json({ ok: true });
}

// Delete a user account entirely.
export async function DELETE(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  if (id === access.user!.id) return NextResponse.json({ ok: false, error: "You can't delete your own account." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  await admin.from("profiles").delete().eq("id", id);
  await logActivity({ userId: access.user!.id, email: access.user!.email, action: "delete", target: "users", detail: { deleted: id } });
  return NextResponse.json({ ok: true });
}
