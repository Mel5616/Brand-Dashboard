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

function signingEmail(r: { child_first_name: string; guardian_name: string; token: string; expires_at: string; brand: string }) {
  const expires = new Date(r.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
  return shell(`
    <p style="font-size:15px">Hi ${r.guardian_name.split(" ")[0]},</p>
    <p style="font-size:14px;line-height:1.6">Thanks for taking part in a ${r.brand} photo shoot with us. Before we can use any photos or video featuring <strong>${r.child_first_name}</strong>, we need your permission as parent or guardian. It takes about two minutes — read the terms and sign on screen.</p>
    <p style="text-align:center;margin:26px 0">
      <a href="${BASE}/sign/${r.token}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 34px;border-radius:10px">Review &amp; sign the release</a>
    </p>
    <p style="font-size:12.5px;color:#64748b">This link is unique to you, can be used once, and expires on ${expires}. A signed copy will be emailed to you for your records.</p>`);
}

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
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
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
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
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const get = await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: h(), cache: "no-store" });
  const r = (await get.json())[0];
  if (!r) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

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
