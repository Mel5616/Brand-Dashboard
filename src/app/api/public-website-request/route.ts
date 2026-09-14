import { NextResponse } from "next/server";
import { websiteRequestOk } from "@/lib/websiteRequestKey";
import { sendMail, shell } from "@/lib/agreementMail";
import { createClient } from "@/lib/supabase/server";

// Public, no-login intake for website change requests — share the
// /website-request link (optionally with ?k=<WEBSITE_REQUEST_KEY>). Same
// table (website_requests) the admin Website Requests tab reads from.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPROVER = "mel@coolkidz.com.au";
const BUCKET = "website-requests";

export async function GET(req: Request) {
  if (!(await websiteRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/brands?select=id,name&order=name.asc`, { headers: h() });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), brands: [] });
  return NextResponse.json({ ok: true, brands: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!(await websiteRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }

  const requesterName = String(form.get("requester_name") || "").trim().slice(0, 100);
  const requesterEmail = String(form.get("requester_email") || "").trim().toLowerCase();
  const description = String(form.get("description") || "").trim().slice(0, 2000);
  const brand = String(form.get("brand") || "").trim().slice(0, 80);
  const changeTypeRaw = String(form.get("change_type") || "");
  const priorityRaw = String(form.get("priority") || "");
  if (!requesterName || !emailRe.test(requesterEmail) || !description || !brand)
    return NextResponse.json({ ok: false, error: "Name, a valid email, brand and description are required" }, { status: 400 });

  const row: Record<string, unknown> = {
    brand, page_url: form.get("page_url") ? String(form.get("page_url")).trim().slice(0, 500) : null,
    change_type: ["copy", "broken_link", "new_page", "image_banner", "product_info", "other"].includes(changeTypeRaw) ? changeTypeRaw : "other",
    description, requester_name: requesterName, requester_email: requesterEmail,
    priority: ["low", "normal", "urgent"].includes(priorityRaw) ? priorityRaw : "normal",
  };

  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File is over 15MB" }, { status: 400 });
    try {
      const sb = await createClient();
      await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: true });
      if (error) throw new Error(error.message);
      row.attachment_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      row.attachment_name = file.name.slice(0, 200);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Attachment upload failed: ${String(e.message || e).slice(0, 150)}` }, { status: 500 });
    }
  }

  const res = await fetch(`${sbUrl}/rest/v1/website_requests`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  const item = JSON.parse(text)[0];

  const mail = await sendMail({
    to: [APPROVER], subject: `Website request — ${brand}${row.priority === "urgent" ? " (URGENT)" : ""}`,
    html: shell(`
      <p style="font-size:15px;margin:0 0 14px">New website change request from <strong>${requesterName}</strong> (${requesterEmail}).</p>
      <p style="font-size:14px;margin:0 0 6px"><strong>Brand:</strong> ${brand}</p>
      ${row.page_url ? `<p style="font-size:14px;margin:0 0 6px"><strong>Page:</strong> ${row.page_url}</p>` : ""}
      <p style="font-size:14px;margin:0 0 6px"><strong>Type:</strong> ${String(row.change_type).replace(/_/g, " ")}</p>
      <p style="font-size:14px;margin:0 0 14px"><strong>Priority:</strong> ${row.priority}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${description.replace(/\n/g, "<br/>")}</p>
      ${row.attachment_url ? `<p style="font-size:14px;margin:0"><a href="${row.attachment_url}">${row.attachment_name}</a></p>` : ""}
    `),
  }).catch(() => ({ ok: false }));

  return NextResponse.json({ ok: true, item, emailed: !!mail.ok });
}
