import { NextResponse } from "next/server";
import { websiteRequestOk } from "@/lib/websiteRequestKey";
import { sendMail, shell } from "@/lib/agreementMail";

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

export async function GET(req: Request) {
  if (!(await websiteRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/brands?select=id,name&order=name.asc`, { headers: h() });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), brands: [] });
  return NextResponse.json({ ok: true, brands: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!(await websiteRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const requesterName = String(b.requester_name || "").trim().slice(0, 100);
  const requesterEmail = String(b.requester_email || "").trim().toLowerCase();
  const description = String(b.description || "").trim().slice(0, 2000);
  const brand = String(b.brand || "").trim().slice(0, 80);
  if (!requesterName || !emailRe.test(requesterEmail) || !description || !brand)
    return NextResponse.json({ ok: false, error: "Name, a valid email, brand and description are required" }, { status: 400 });

  const row = {
    brand, page_url: b.page_url ? String(b.page_url).trim().slice(0, 500) : null,
    change_type: ["copy", "broken_link", "new_page", "image_banner", "product_info", "other"].includes(b.change_type) ? b.change_type : "other",
    description, requester_name: requesterName, requester_email: requesterEmail,
    priority: ["low", "normal", "urgent"].includes(b.priority) ? b.priority : "normal",
  };
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
      <p style="font-size:14px;margin:0 0 6px"><strong>Type:</strong> ${row.change_type.replace(/_/g, " ")}</p>
      <p style="font-size:14px;margin:0 0 14px"><strong>Priority:</strong> ${row.priority}</p>
      <p style="font-size:14px;line-height:1.6;margin:0">${description.replace(/\n/g, "<br/>")}</p>
    `),
  }).catch(() => ({ ok: false }));

  return NextResponse.json({ ok: true, item, emailed: !!mail.ok });
}
