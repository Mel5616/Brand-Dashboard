import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, shell } from "@/lib/releaseMail";

// PUBLIC endpoint for the new-customer application form (/apply/<token>).
// Allowlisted in the auth proxy; gated by the send token itself — only a live
// "form" send token can read the form config or submit an application.
// GET  ?token= → { brands, prefill } to render the form.
// POST { token, data } → store the submission + notify the sender.
export const revalidate = 0;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function resolveSend(sb: any, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(token || "")) return null;
  const { data } = await sb.from("sales_sends").select("id,doc_kind,customer_id,created_by,recipient_name,recipient_email").eq("token", token).maybeSingle();
  return data?.doc_kind === "form" ? data : null;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const sb = createAdminClient();
  const send = await resolveSend(sb, token);
  if (!send) return NextResponse.json({ ok: false }, { status: 404 });
  const { data: brands } = await sb.from("brands").select("name,live").order("id");
  let prefill: any = { contact_name: send.recipient_name, email: send.recipient_email };
  if (send.customer_id) {
    const { data: c } = await sb.from("sales_customers").select("store_name,contact_name,email,phone,abn,address,state,postcode,website").eq("id", send.customer_id).maybeSingle();
    if (c) prefill = { ...c, contact_name: c.contact_name || send.recipient_name, email: c.email || send.recipient_email };
  }
  return NextResponse.json({ ok: true, brands: (brands || []).filter((b: any) => b.live !== false).map((b: any) => b.name), prefill });
}

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sb = createAdminClient();
  const send = await resolveSend(sb, String(b.token || ""));
  if (!send) return NextResponse.json({ ok: false, error: "This form link is no longer valid." }, { status: 404 });

  const d = typeof b.data === "object" && b.data ? b.data : {};
  const storeName = String(d.store_name || "").trim();
  const email = String(d.email || "").trim().toLowerCase();
  if (!storeName) return NextResponse.json({ ok: false, error: "Store / business name is required." }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });

  const { error } = await sb.from("customer_form_submissions").insert({
    send_id: send.id, customer_id: send.customer_id,
    store_name: storeName, contact_name: String(d.contact_name || "").trim() || null,
    email, phone: String(d.phone || "").trim() || null, abn: String(d.abn || "").trim() || null,
    data: d,
  });
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save your application — please try again." }, { status: 500 });

  // Notify the sender (best-effort).
  const to = isEmail(send.created_by || "") ? send.created_by : "mel@coolkidz.com.au";
  sendMail({
    to: [to],
    subject: `New customer application — ${storeName}`,
    html: shell(`
      <p style="font-size:15px;color:#0f172a;margin:0 0 12px"><strong>${storeName.replace(/</g, "&lt;")}</strong> just submitted a new customer application.</p>
      <p style="font-size:13.5px;color:#334155;line-height:1.8;margin:0 0 14px">
        Contact: ${String(d.contact_name || "—").replace(/</g, "&lt;")}<br/>
        Email: ${email}<br/>Phone: ${String(d.phone || "—").replace(/</g, "&lt;")}<br/>
        ABN: ${String(d.abn || "—").replace(/</g, "&lt;")}<br/>
        Brands: ${(Array.isArray(d.brands) ? d.brands.join(", ") : "—").replace(/</g, "&lt;")}
      </p>
      <p style="font-size:13px;color:#64748b">Full details are in the dashboard under Retailer Hub → New Customer Forms.</p>`),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
