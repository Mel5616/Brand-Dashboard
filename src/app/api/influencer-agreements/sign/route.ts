import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { sendMail, shell } from "@/lib/agreementMail";

// PUBLIC endpoint: influencer submits the signed agreement from
// /agreement/[token]. Token is validated server-side; single use, enforced
// by the same status=eq.sent race guard as the media releases sign route.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, ...extra });

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const token = String(b.token || "");
  if (!/^[0-9a-f-]{36}$/.test(token)) return NextResponse.json({ ok: false, error: "Bad token" }, { status: 400 });

  const get = await fetch(`${sbUrl}/rest/v1/influencer_agreements?token=eq.${token}&select=*,brands(name),influencers:agreement_influencers(*)&limit=1`, { headers: h(), cache: "no-store" });
  const a = (await get.json().catch(() => []))[0];
  if (!a) return NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 404 });
  if (a.status === "signed") return NextResponse.json({ ok: false, error: "This agreement has already been signed." }, { status: 409 });
  if (a.status !== "sent") return NextResponse.json({ ok: false, error: "This link isn't active." }, { status: 410 });

  const signed_name = String(b.signed_name || "").trim().slice(0, 120);
  const sig = String(b.signature || "");
  if (!signed_name) return NextResponse.json({ ok: false, error: "Type your full name" }, { status: 400 });
  if (!b.agreed) return NextResponse.json({ ok: false, error: "You must tick the agreement box" }, { status: 400 });
  if (!sig.startsWith("data:image/png;base64,")) return NextResponse.json({ ok: false, error: "Please draw your signature" }, { status: 400 });
  const sigBytes = Buffer.from(sig.split(",")[1], "base64");
  if (sigBytes.length < 500 || sigBytes.length > 500_000) return NextResponse.json({ ok: false, error: "Please draw your signature" }, { status: 400 });

  const signed_at = new Date().toISOString();
  const signed_ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const signed_user_agent = (req.headers.get("user-agent") || "unknown").slice(0, 300);
  const document_hash = createHash("sha256").update(a.rendered_html || "").digest("hex");

  const upd = { status: "signed", signed_at, signed_name, signature_data_url: sig, signed_ip, signed_user_agent, document_hash };
  const put = await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${a.id}&status=eq.sent`, {
    method: "PATCH", headers: h({ "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify(upd),
  });
  const updated = (await put.json().catch(() => []))[0];
  if (!put.ok || !updated) return NextResponse.json({ ok: false, error: "Couldn't save — try again." }, { status: 500 });

  const signedHtml = `${a.rendered_html}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
      <p>Signed by <strong>${signed_name}</strong> on ${new Date(signed_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" })}.</p>
      <img src="${sig}" alt="Signature" style="height:60px;border-bottom:1px solid #cbd5e1" />
      <p style="margin-top:8px;font-family:monospace;font-size:10px">Document hash (sha256): ${document_hash}</p>
    </div>`;
  const i = a.influencers;
  await sendMail({
    to: [i.email],
    subject: `Signed: ${a.brands.name} collaboration agreement — ${a.reference}`,
    html: shell(`
      <p style="font-size:15px">Hi ${i.full_name.split(" ")[0]},</p>
      <p style="font-size:14px;line-height:1.6">Thanks — your collaboration agreement with <strong>${a.brands.name}</strong> (${a.reference}) was signed on <strong>${new Date(signed_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" })}</strong>. A copy is attached for your records.</p>
      <p style="font-size:12.5px;color:#64748b;line-height:1.6">Questions any time — just reply to this email.</p>`),
    attachments: [{ filename: `Coolkidz-${a.reference}.html`, content: Buffer.from(signedHtml).toString("base64") }],
  });
  await sendMail({
    to: ["partnerships@coolkidz.com.au"],
    subject: `✅ Agreement signed — ${a.reference} (${i.full_name} · ${a.brands.name})`,
    html: shell(`<p style="font-size:14px;line-height:1.7"><strong>${i.full_name}</strong> signed <strong>${a.reference}</strong> · ${a.brands.name}. View it on the dashboard under Influencers → Agreements.</p>`),
  });

  return NextResponse.json({ ok: true });
}
