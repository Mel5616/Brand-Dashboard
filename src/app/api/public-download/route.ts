import { NextResponse } from "next/server";
import { klaviyoKeyForBrand } from "@/lib/klaviyoBrandKeys";
import { ensureProfile, setProfileProperties, subscribeToList } from "@/lib/klaviyo";

// Public, CORS-open: the signup form for a digital download, on a /download/<slug>
// page here or embedded on a brand's own site. Stores the signup, pushes the person
// to the brand's Klaviyo account (marketing subscription only if they ticked the
// box), emails the file, and returns the file link for the thank-you screen.
export const revalidate = 0;
export const maxDuration = 30;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: cors }); }
  if (String(b.company || "").trim()) return NextResponse.json({ ok: true }, { headers: cors }); // honeypot

  const slug = String(b.slug || "").trim();
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const firstName = String(b.first_name || "").trim().slice(0, 80) || null;
  const consent = b.consent === true;
  const source = b.src ? String(b.src).trim().slice(0, 60) : null;
  if (!emailRe.test(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400, headers: cors });

  const dres = await fetch(`${sbUrl}/rest/v1/digital_downloads?select=*&slug=eq.${encodeURIComponent(slug)}&active=eq.true`, { headers: h(), cache: "no-store" });
  const dl = (await dres.json().catch(() => []))[0];
  if (!dl) return NextResponse.json({ ok: false, error: "This download isn't available." }, { status: 404, headers: cors });
  const bres = await fetch(`${sbUrl}/rest/v1/brands?select=name&id=eq.${dl.brand_id}`, { headers: h(), cache: "no-store" });
  const brandName: string = (await bres.json().catch(() => []))[0]?.name ?? "Coolkidz Australia";

  // Store the signup; a repeat email keeps its earlier consent.
  const exRes = await fetch(`${sbUrl}/rest/v1/download_signups?select=id,consent&download_id=eq.${dl.id}&email=eq.${encodeURIComponent(email)}`, { headers: h(), cache: "no-store" });
  const existing = (await exRes.json().catch(() => []))[0];
  let klaviyoStatus = "skipped";
  const kKey = klaviyoKeyForBrand(dl.brand_id);
  if (kKey) {
    try {
      const pid = await ensureProfile(email, firstName ?? undefined, kKey);
      await setProfileProperties(pid, { [`Downloaded: ${dl.title}`]: new Date().toISOString() }, kKey);
      if ((consent || existing?.consent) && dl.klaviyo_list_id) await subscribeToList(dl.klaviyo_list_id, [{ id: pid, email }], kKey);
      klaviyoStatus = "ok";
    } catch (e: any) { klaviyoStatus = `error: ${String(e?.message || e).slice(0, 160)}`; }
  }
  const row = { download_id: dl.id, email, first_name: firstName, consent: consent || !!existing?.consent, source, klaviyo_status: klaviyoStatus };
  const save = existing
    ? await fetch(`${sbUrl}/rest/v1/download_signups?id=eq.${existing.id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ first_name: firstName, consent: row.consent, klaviyo_status: klaviyoStatus }) })
    : await fetch(`${sbUrl}/rest/v1/download_signups`, { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!save.ok) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500, headers: cors });

  // Email the file (best effort: the thank-you screen also shows the link).
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#333;line-height:1.55">
<p>Hi${firstName ? ` ${esc(firstName)}` : ""},</p>
<p>Here is your download from ${esc(brandName)}: <strong>${esc(dl.title)}</strong>.</p>
<p><a href="${esc(dl.file_url)}" style="display:inline-block;background:#222;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold">Download your copy</a></p>
<p style="color:#888;font-size:12px">If the button doesn't work, copy this link: ${esc(dl.file_url)}</p></div>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${brandName} <noreply@coolkidz.com.au>`, to: [email], subject: `Your download: ${dl.title}`, html }),
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, file_url: dl.file_url, title: dl.title }, { headers: cors });
}
