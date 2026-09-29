import { NextResponse } from "next/server";
import { productRequestOk } from "@/lib/productRequestKey";
import { sendMail, shell } from "@/lib/agreementMail";

// Public, no-login intake for free-product/sample requests — share the
// /product-request link (optionally with ?k=<PRODUCT_REQUEST_KEY>). Same
// table (product_requests) the admin Product Requests tab reads from.
// Every submission lands as status "proposed" — nothing ships until Mel
// approves it.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPROVER = "mel@coolkidz.com.au";

export async function GET(req: Request) {
  if (!(await productRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/brands?select=id,name&order=name.asc`, { headers: h() });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), brands: [] });
  return NextResponse.json({ ok: true, brands: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!(await productRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const requesterName = String(b.requester_name || "").trim().slice(0, 100);
  const requesterEmail = String(b.requester_email || "").trim().toLowerCase();
  const reason = String(b.reason || "").trim().slice(0, 500);
  const products = String(b.products || "").trim().slice(0, 1000);
  const brandId = b.brand_id !== "" && b.brand_id != null ? Number(b.brand_id) : null;
  if (!requesterName || !emailRe.test(requesterEmail) || !reason || !products || !brandId)
    return NextResponse.json({ ok: false, error: "Your name, a valid email, brand, reason and products are required" }, { status: 400 });

  const row: Record<string, unknown> = {
    brand_id: brandId, reason, products,
    gift_items: Array.isArray(b.gift_items) ? b.gift_items.slice(0, 50) : [],
    ship_to_name: b.ship_to_name ? String(b.ship_to_name).trim().slice(0, 150) : null,
    ship_to_address: b.ship_to_address ? String(b.ship_to_address).trim().slice(0, 500) : null,
    customer_name: b.customer_name ? String(b.customer_name).trim().slice(0, 150) : null,
    customer_email: b.customer_email ? String(b.customer_email).trim().toLowerCase().slice(0, 150) : null,
    customer_phone: b.customer_phone ? String(b.customer_phone).trim().slice(0, 40) : null,
    is_loan: !!b.is_loan,
    requester_name: requesterName, requester_email: requesterEmail,
  };

  const res = await fetch(`${sbUrl}/rest/v1/product_requests`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  const item = JSON.parse(text)[0];

  const mail = await sendMail({
    to: [APPROVER], subject: `Product request for approval — ${requesterName}`,
    html: shell(`
      <p style="font-size:15px;margin:0 0 14px">New free-product request from <strong>${requesterName}</strong> (${requesterEmail}) — needs your approval before anything is picked or shipped.</p>
      <p style="font-size:14px;margin:0 0 6px"><strong>Reason:</strong> ${reason}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px"><strong>Products:</strong> ${products.replace(/\n/g, "<br/>")}</p>
      ${row.ship_to_name || row.ship_to_address ? `<p style="font-size:14px;margin:0 0 6px"><strong>Ship to:</strong> ${[row.ship_to_name, row.ship_to_address].filter(Boolean).join(" — ")}</p>` : ""}
      ${row.customer_name || row.customer_email || row.customer_phone ? `<p style="font-size:14px;margin:0"><strong>Customer:</strong> ${[row.customer_name, row.customer_email, row.customer_phone].filter(Boolean).join(" — ")}</p>` : ""}
    `),
  }).catch(() => ({ ok: false }));

  return NextResponse.json({ ok: true, item, emailed: !!mail.ok });
}
