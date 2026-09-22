import { NextResponse } from "next/server";

// Public, CORS-open: the enquiry form on uppababy.com.au/pages/partnership-enquiries.
// Media, retail and creator enquiries all land in one inbox with the route named in
// the subject, so Mel can filter rather than watch three addresses (22 Sep 2026).
// No table behind this: the email is the record, and Reply goes to the enquirer.
export const revalidate = 0;
const TO = "mel@uppababy.com.au";
const FROM = "UPPAbaby Australia <noreply@uppababy.com.au>";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROUTE_LABEL: Record<string, string> = { media: "Media and press", retail: "Retail and wholesale", creator: "Creators and partnerships" };
const FIELD_LABEL: Record<string, string> = {
  publication: "Publication or outlet", deadline: "Deadline", need: "What do you need?",
  business: "Business name", abn: "ABN", platform: "Primary platform", handle: "Handle", audience: "Audience size",
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  let b: Record<string, string>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: cors }); }

  // Honeypot: a real person never fills a field they cannot see.
  if (String(b.company || "").trim()) return NextResponse.json({ ok: true }, { headers: cors });

  const route = ROUTE_LABEL[b.route] ? b.route : "media";
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 160);
  const msg = String(b.msg || "").trim().slice(0, 4000);
  if (!name || !emailRe.test(email) || !msg)
    return NextResponse.json({ ok: false, error: "Please add your name, a valid email and your enquiry." }, { status: 400, headers: cors });
  if (!key) return NextResponse.json({ ok: false, error: "Email is not configured" }, { status: 500, headers: cors });

  const extras = Object.entries(b)
    .filter(([k, v]) => FIELD_LABEL[k] && String(v || "").trim())
    .map(([k, v]) => `<p style="font-size:14px;margin:0 0 6px"><strong>${esc(FIELD_LABEL[k])}:</strong> ${esc(String(v).slice(0, 300))}</p>`)
    .join("");

  const html = `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#33404F;max-width:600px">
    <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7A8798;font-weight:600;margin:0 0 10px">${esc(ROUTE_LABEL[route])}</p>
    <h1 style="font-size:20px;font-weight:600;color:#141C26;margin:0 0 16px">${esc(name)}</h1>
    <p style="font-size:14px;margin:0 0 6px"><strong>Email:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a></p>
    ${extras}
    <p style="font-size:15px;line-height:1.6;margin:16px 0 0;padding-top:16px;border-top:1px solid #E4E1DC;white-space:pre-wrap">${esc(msg)}</p>
    <p style="font-size:11.5px;color:#98A2B0;margin:22px 0 0">Sent from the partnership enquiries form on uppababy.com.au. Reply to this email and it goes back to the sender.</p>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: email, to: [TO], subject: `${ROUTE_LABEL[route]} enquiry from ${name}`, html }),
  }).catch(() => null);

  if (!res || !res.ok) return NextResponse.json({ ok: false, error: "We could not send that. Please email hello@uppababy.com.au." }, { status: 500, headers: cors });
  return NextResponse.json({ ok: true }, { headers: cors });
}
