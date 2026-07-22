import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { TERMS_VERSION } from "@/lib/releaseTerms";
import { sendMail, shell } from "@/lib/releaseMail";

// Media releases — admin CRUD. Guardians sign via the public /sign/[token] page.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const BASE = "https://marketing.coolkidz.com.au";

const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
// Staff with the Media Releases tab granted can run the flow; withdraw stays admin-only.
const canUse = (acc: { role: string | null; allowedTabs: string[] }) => acc.role === "admin" || (!!acc.role && acc.allowedTabs.includes("releases"));

function signingEmail(r: { child_first_name: string; guardian_name: string; token: string; expires_at: string; brand: string; campaign?: string | null; shoot_date?: string | null; shoot_location?: string | null }) {
  const expires = new Date(r.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
  const shoot = [
    r.shoot_date ? new Date(r.shoot_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null,
    r.shoot_location,
  ].filter(Boolean).join(" · ");
  return shell(`
    <p style="font-size:15px">Hi ${r.guardian_name.split(" ")[0]},</p>
    <p style="font-size:14px;line-height:1.7">Thank you for your interest in participating in an upcoming photoshoot for Coolkidz Australia — we're delighted to have <strong>${r.child_first_name}</strong> involved${r.campaign ? ` in our <strong>${r.brand}</strong> "${r.campaign}" campaign` : ` with <strong>${r.brand}</strong>`}.</p>
    ${shoot ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin:14px 0"><p style="margin:0;font-size:13px;color:#64748b"><strong style="color:#334155">📸 Shoot details:</strong> ${shoot}</p></div>` : ""}
    <p style="font-size:14px;line-height:1.7">Before the shoot, we need your permission as ${r.child_first_name}'s parent or legal guardian to capture and use photos and video from the day. The release takes about two minutes to complete — it explains exactly how the content may be used, how ${r.child_first_name}'s privacy is protected (we only ever use a first name, or no name at all), and how you can withdraw your permission at any time.</p>
    <p style="text-align:center;margin:26px 0">
      <a href="${BASE}/sign/${r.token}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 34px;border-radius:10px">Review &amp; sign the release</a>
    </p>
    <p style="font-size:14px;line-height:1.7">Once you've signed, a copy will be emailed to you straight away for your records. If you have any questions before signing, just reply to this email — we're happy to help.</p>
    <p style="font-size:14px;line-height:1.7;margin-bottom:4px">Warm regards,<br><strong>The Coolkidz Australia Marketing Team</strong></p>
    <p style="font-size:12.5px;color:#64748b;margin-top:18px">This link is unique to you, can be used once, and expires on ${expires}.</p>`);
}

export async function GET() {
  if (!canUse(await getAccess())) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/media_releases?select=*&order=created_at.desc&limit=1000`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), releases: [] });
  // Surface expiry without a cron: sent links past their expiry show as expired.
  const now = new Date().toISOString();
  const releases = JSON.parse(text || "[]").map((r: any) => (r.status === "sent" && r.expires_at < now ? { ...r, status: "expired" } : r));
  return NextResponse.json({ ok: true, releases });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const need = ["child_first_name", "guardian_name", "guardian_email", "brand"];
  for (const k of need) if (!String(b[k] || "").trim()) return NextResponse.json({ ok: false, error: `${k.replace(/_/g, " ")} required` }, { status: 400 });
  const row = {
    child_first_name: String(b.child_first_name).trim().split(" ")[0].slice(0, 60), // first name only — never store more
    guardian_name: String(b.guardian_name).trim().slice(0, 120),
    guardian_email: String(b.guardian_email).trim().slice(0, 200),
    brand: String(b.brand).trim().slice(0, 80),
    campaign: b.campaign ? String(b.campaign).slice(0, 160) : null,
    shoot_date: b.shoot_date || null,
    shoot_location: b.shoot_location ? String(b.shoot_location).slice(0, 200) : null,
    note: b.note ? String(b.note).slice(0, 500) : null,
    terms_version: TERMS_VERSION,
    status: b.draft ? "draft" : "sent",
    created_by: (acc.user as any)?.email ?? null,
  };
  const res = await fetch(`${sbUrl}/rest/v1/media_releases`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  const created = JSON.parse(text)[0];
  if (b.draft) return NextResponse.json({ ok: true, release: created, emailed: false });
  const mail = await sendMail({
    to: [created.guardian_email],
    subject: `Photography release for ${created.child_first_name} — action needed`,
    html: signingEmail(created),
  });
  return NextResponse.json({ ok: true, release: created, emailed: mail.ok, emailError: mail.ok ? undefined : mail.error });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (b.action === "withdraw" && acc.role !== "admin") return NextResponse.json({ ok: false, error: "Withdrawals are admin-only" }, { status: 403 });
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const get = await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: h(), cache: "no-store" });
  const r = (await get.json())[0];
  if (!r) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (b.action === "edit") {
    // Details are editable until the release is signed.
    if (r.status === "signed" || r.status === "withdrawn") return NextResponse.json({ ok: false, error: "Already signed — details are locked" }, { status: 400 });
    const fields: any = {};
    if (b.child_first_name) fields.child_first_name = String(b.child_first_name).trim().split(" ")[0].slice(0, 60);
    if (b.guardian_name) fields.guardian_name = String(b.guardian_name).trim().slice(0, 120);
    if (b.guardian_email) fields.guardian_email = String(b.guardian_email).trim().slice(0, 200);
    if (b.brand) fields.brand = String(b.brand).trim().slice(0, 80);
    for (const [k, max] of [["campaign", 160], ["shoot_location", 200], ["note", 500]] as const)
      if (b[k] !== undefined) fields[k] = b[k] ? String(b[k]).slice(0, max) : null;
    if (b.shoot_date !== undefined) fields.shoot_date = b.shoot_date || null;
    const res2 = await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
    return NextResponse.json({ ok: res2.ok });
  }
  if (b.action === "resend") {
    // Also used to send a draft for the first time.
    if (r.status === "signed") return NextResponse.json({ ok: false, error: "Already signed" }, { status: 400 });
    // Fresh single-use token + 14-day window on every resend.
    const upd = { token: crypto.randomUUID(), status: "sent", expires_at: new Date(Date.now() + 14 * 86400_000).toISOString() };
    await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(upd) });
    const mail = await sendMail({
      to: [r.guardian_email],
      subject: `Photography release for ${r.child_first_name} — action needed`,
      html: signingEmail({ ...r, ...upd }),
    });
    return NextResponse.json({ ok: true, emailed: mail.ok });
  }
  if (b.action === "void") {
    if (r.status === "signed") return NextResponse.json({ ok: false, error: "Already signed — use withdraw" }, { status: 400 });
    await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "expired", expires_at: new Date().toISOString() }) });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "withdraw") {
    // Withdrawal is a status + timestamp; the signed record stays intact forever.
    await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "withdrawn", withdrawn_at: new Date().toISOString() }) });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
