import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, shell } from "@/lib/releaseMail";

// PUBLIC endpoint the credit application form (/apply/<token>) POSTs to.
// Allowlisted in the auth proxy; gated by the send token — only a live "form"
// send token can submit. Stores the submission against the customer record and
// auto-emails the full application to marketing@ (+ whoever sent the link).
export const revalidate = 0;
const MARKETING = "marketing@coolkidz.com.au";
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const esc = (s: any) => String(s ?? "").replace(/</g, "&lt;");

const row = (k: string, v: any) => v ? `<tr><td style="padding:3px 12px 3px 0;color:#94a3b8;font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;color:#334155;font-size:13px">${esc(v)}</td></tr>` : "";
const section = (title: string, rows: string) => rows.trim() ? `<p style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin:18px 0 4px">${title}</p><table style="border-collapse:collapse">${rows}</table>` : "";
const addr = (a: any) => a ? [a.line, a.suburb, a.state, a.postcode].filter(Boolean).join(", ") : "";

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  let d: any; try { d = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!d || typeof d !== "object") return NextResponse.json({ ok: false }, { status: 400 });

  const sb = createAdminClient();
  if (!/^[0-9a-f-]{36}$/.test(token)) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const { data: send } = await sb.from("sales_sends").select("id,doc_kind,customer_id,created_by").eq("token", token).maybeSingle();
  if (!send || send.doc_kind !== "form") return NextResponse.json({ ok: false, error: "This form link is no longer valid." }, { status: 404 });

  const storeName = String(d.trading_name || d.legal_name || "").trim();
  const email = String(d.invoice_email || "").trim().toLowerCase();
  if (!storeName) return NextResponse.json({ ok: false, error: "Business name is required." }, { status: 400 });

  const { error } = await sb.from("customer_form_submissions").insert({
    send_id: send.id, customer_id: send.customer_id,
    store_name: storeName,
    contact_name: String(d.signatories?.[0]?.name || "").trim() || null,
    email: isEmail(email) ? email : null,
    phone: String(d.phone || d.mobile || "").trim() || null,
    abn: String(d.abn || "").trim() || null,
    data: d,
  });
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save your application — please try again." }, { status: 500 });

  // Full application straight to marketing@ (+ whoever sent the link).
  const to = [MARKETING];
  if (isEmail(send.created_by || "") && send.created_by !== MARKETING) to.push(send.created_by);
  const directors = (Array.isArray(d.directors) ? d.directors : []).filter((x: any) => x?.name);
  const refs = (Array.isArray(d.trade_references) ? d.trade_references : []).filter((x: any) => x?.name);
  const sigs = (Array.isArray(d.signatories) ? d.signatories : []).filter((x: any) => x?.name);
  const html = shell(`
    <p style="font-size:15px;color:#0f172a;margin:0 0 4px"><strong>${esc(storeName)}</strong> submitted a credit application.</p>
    <p style="font-size:12.5px;color:#94a3b8;margin:0 0 6px">Requested credit limit: <strong style="color:#0f172a">$${Number(d.credit_limit_aud || 0).toLocaleString()}</strong></p>
    ${section("Business", row("Legal name", d.legal_name) + row("Trading name", d.trading_name) + row("Structure", d.structure) + row("ABN", d.abn) + row("ACN", d.acn) + row("Trust name", d.trust_name) + row("Nature of business", d.nature) + row("Registered", d.registered_on))}
    ${section("Contact", row("Phone", d.phone) + row("Mobile", d.mobile) + row("Invoice email", d.invoice_email))}
    ${section("Addresses", row("Street", addr(d.street)) + row("Postal", d.postal?.same_as_street ? "Same as street" : addr(d.postal)))}
    ${section("Directors / Owners", directors.map((x: any) => row(x.name, [x.phone, addr({ line: x.address, suburb: x.suburb, state: x.state, postcode: x.postcode })].filter(Boolean).join(" · "))).join(""))}
    ${section("Accountant", row(d.accountant?.name || "", [d.accountant?.phone, d.accountant?.email, d.accountant?.address].filter(Boolean).join(" · ")))}
    ${section("Trade references", refs.map((x: any) => row(x.name, [x.phone, x.address, x.monthly ? `~$${Number(x.monthly).toLocaleString()}/mo` : null].filter(Boolean).join(" · "))).join(""))}
    ${section("Declarations", row("Trading terms", d.declarations?.terms ? "Agreed" : "NOT agreed") + row("Guarantee", d.declarations?.guarantee ? "Agreed" : "NOT agreed") + row("Truth", d.declarations?.truth ? "Agreed" : "NOT agreed"))}
    ${section("Signatories", sigs.map((x: any) => row(x.name, [x.position, x.signature ? "signed" : "no signature", x.date].filter(Boolean).join(" · "))).join(""))}
    <p style="font-size:12px;color:#94a3b8;margin-top:16px">Also saved in the dashboard under Retailer Hub → New Customer Forms${send.customer_id ? " and on the customer's record" : ""}.</p>`);
  sendMail({ to, subject: `Credit application — ${storeName}`, html }).catch(() => {});

  return NextResponse.json({ ok: true });
}
