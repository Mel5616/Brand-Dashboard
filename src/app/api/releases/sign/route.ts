import { NextResponse } from "next/server";
import { buildReleasePdf } from "@/lib/releasePdf";
import { sendMail, shell } from "@/lib/releaseMail";

// PUBLIC endpoint: guardian submits the signed release from /sign/[token].
// Token is validated server-side, single use, storage stays private.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, ...extra });

async function upload(path: string, body: Uint8Array, contentType: string) {
  const res = await fetch(`${sbUrl}/storage/v1/object/media-releases/${path}`, {
    method: "POST", headers: h({ "Content-Type": contentType, "x-upsert": "true" }), body: body as any,
  });
  return res.ok;
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const token = String(b.token || "");
  if (!/^[0-9a-f-]{36}$/.test(token)) return NextResponse.json({ ok: false, error: "Bad token" }, { status: 400 });

  const get = await fetch(`${sbUrl}/rest/v1/media_releases?token=eq.${token}&limit=1`, { headers: h(), cache: "no-store" });
  const r = (await get.json().catch(() => []))[0];
  if (!r) return NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 404 });
  if (r.status === "signed") return NextResponse.json({ ok: false, error: "This release has already been signed." }, { status: 409 });
  if (r.status !== "sent" || r.expires_at < new Date().toISOString())
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });

  const signed_name = String(b.signed_name || "").trim().slice(0, 120);
  const relationship = String(b.relationship || "").trim().slice(0, 80);
  const phone = String(b.phone || "").trim().slice(0, 40);
  const sig = String(b.signature || "");
  if (!signed_name) return NextResponse.json({ ok: false, error: "Type your full name" }, { status: 400 });
  if (!relationship) return NextResponse.json({ ok: false, error: "Relationship to the child is required" }, { status: 400 });
  if (!b.agreed) return NextResponse.json({ ok: false, error: "You must tick the agreement box" }, { status: 400 });
  if (!sig.startsWith("data:image/png;base64,")) return NextResponse.json({ ok: false, error: "Please draw your signature" }, { status: 400 });
  const sigBytes = Uint8Array.from(Buffer.from(sig.split(",")[1], "base64"));
  if (sigBytes.length < 500 || sigBytes.length > 500_000) return NextResponse.json({ ok: false, error: "Please draw your signature" }, { status: 400 });

  const signed_at = new Date().toISOString();
  const signed_ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const signed_user_agent = (req.headers.get("user-agent") || "unknown").slice(0, 300);

  const sigPath = `${r.id}/signature.png`;
  const pdfPath = `${r.id}/release.pdf`;
  if (!(await upload(sigPath, sigBytes, "image/png")))
    return NextResponse.json({ ok: false, error: "Couldn't save the signature — try again." }, { status: 500 });

  const full = {
    ...r, signed_name, signed_at, signed_ip, signed_user_agent,
    guardian_phone: phone || null, guardian_relationship: relationship,
    retail_partner_optin: !!b.retail_partner_optin,
  };
  const logo = await fetch("https://marketing.coolkidz.com.au/logos/coolkidz-logo.png")
    .then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? new Uint8Array(b) : null)).catch(() => null);
  let pdfBytes: Uint8Array | null = null;
  try {
    pdfBytes = await buildReleasePdf(full as any, sigBytes, logo);
    await upload(pdfPath, pdfBytes, "application/pdf");
  } catch { /* record still saves; PDF can be regenerated */ }

  const upd = {
    status: "signed", signed_name, signed_at, signed_ip, signed_user_agent,
    guardian_phone: phone || null, guardian_relationship: relationship,
    retail_partner_optin: !!b.retail_partner_optin,
    signature_image_path: sigPath, pdf_path: pdfBytes ? pdfPath : null,
    // burn the token: single use
    expires_at: signed_at,
  };
  const put = await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${r.id}&status=eq.sent`, {
    method: "PATCH", headers: h({ "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify(upd),
  });
  const updated = (await put.json().catch(() => []))[0];
  if (!put.ok || !updated) return NextResponse.json({ ok: false, error: "Couldn't save — try again." }, { status: 500 });

  const att = pdfBytes ? [{ filename: `Coolkidz-media-release-${r.child_first_name}.pdf`, content: Buffer.from(pdfBytes).toString("base64") }] : undefined;
  await sendMail({
    to: [r.guardian_email],
    subject: `Signed: photography release for ${r.child_first_name}`,
    html: shell(`
      <p style="font-size:15px">Hi ${r.guardian_name.split(" ")[0]},</p>
      <p style="font-size:14px;line-height:1.6">Thanks — your photography release for <strong>${r.child_first_name}</strong> (${r.brand}) was executed on <strong>${new Date(signed_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" })}</strong>. Your copy is attached for your records.</p>
      <p style="font-size:12.5px;color:#64748b;line-height:1.6">You can withdraw this permission at any time by emailing <a href="mailto:marketing@coolkidz.com.au">marketing@coolkidz.com.au</a> — we'll stop new uses and remove the content from our channels within 30 days.</p>`),
    attachments: att,
  });
  await sendMail({
    to: ["marketing@coolkidz.com.au"],
    subject: `✅ Media release signed — ${r.child_first_name} (${r.brand})`,
    html: shell(`<p style="font-size:14px;line-height:1.7"><strong>${r.guardian_name}</strong> signed the release for <strong>${r.child_first_name}</strong> · ${r.brand}${r.campaign ? ` · ${r.campaign}` : ""}.<br>Retail partner opt-in: <strong>${b.retail_partner_optin ? "yes" : "no"}</strong>. View it on the dashboard under Operations → Releases.</p>`),
  });

  return NextResponse.json({ ok: true });
}
