import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { storeCreds } from "@/lib/shopifyMint";
import { configured, rest } from "@/lib/registry";
import { VOUCHER, brandByName, voucherCode, createBrandCode, sendVoucherEmail, tagSourceOrder } from "@/lib/vouchers";

// Shopify "orders/paid" webhook from the UPPAbaby store. Spend $500 or more
// and a $20 voucher for the brand chosen in the cart is created on that
// brand's store, recorded, and emailed. See src/lib/vouchers.ts.
//
// Always answers 200 once the payload is authentic: Shopify retries anything
// else for 48 hours, and a retry of an order we have already handled (or
// deliberately skipped) is just noise. Real failures are recorded as a
// 'failed' row so they show on the Vouchers card rather than vanishing.
export const revalidate = 0;
export const maxDuration = 60;

function authentic(raw: string, sig: string | null) {
  const cred = storeCreds().find(c => c.id === VOUCHER.sourceBrandId);
  if (!cred || !sig) return false;
  const digest = createHmac("sha256", cred.clientSecret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(digest), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Line = { title?: string; price?: string; quantity?: number; properties?: { name: string; value: string }[] | Record<string, string> };

function prop(l: Line, name: string): string | null {
  const p = l.properties;
  if (!p) return null;
  if (Array.isArray(p)) return p.find(x => x.name === name)?.value ?? null;
  return (p as Record<string, string>)[name] ?? null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!authentic(raw, req.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }
  if (!configured()) return NextResponse.json({ ok: false, error: "no database" }, { status: 200 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let o: any;
  try { o = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 200 }); }

  const orderId = Number(o.id);
  const orderName = String(o.name || `#${o.order_number || orderId}`);
  const gid = o.admin_graphql_api_id || `gid://shopify/Order/${orderId}`;
  if (!orderId) return NextResponse.json({ ok: false }, { status: 200 });

  // What qualified: the lines after discounts, before shipping. Shopify's
  // subtotal already excludes the $0 voucher line, so it cannot inflate itself.
  const subtotal = Number(o.current_subtotal_price ?? o.subtotal_price ?? 0);
  if (!(subtotal >= VOUCHER.threshold)) return NextResponse.json({ ok: true, skipped: "under threshold", subtotal }, { status: 200 });
  if (o.cancelled_at) return NextResponse.json({ ok: true, skipped: "cancelled" }, { status: 200 });

  const email = String(o.email || o.customer?.email || o.contact_email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true, skipped: "no email" }, { status: 200 });

  // Already handled? Shopify re-sends on any retry and orders can be paid twice
  // (a partial then a balance), so the order id is the key.
  const dup = await rest(`issued_vouchers?source_order_id=eq.${orderId}&select=id,status`);
  // No table yet (add_issued_vouchers.sql not run) or Supabase down: do not
  // issue anything we cannot record. A non-2xx makes Shopify retry for two
  // days, which covers running the SQL.
  if (!dup.ok) return NextResponse.json({ ok: false, error: "issued_vouchers unavailable" }, { status: 503 });
  const dupRows = await dup.json().catch(() => []);
  if (Array.isArray(dupRows) && dupRows.length && dupRows[0].status !== "failed") {
    return NextResponse.json({ ok: true, skipped: "already issued" }, { status: 200 });
  }

  const lines: Line[] = Array.isArray(o.line_items) ? o.line_items : [];
  const voucherLine = lines.find(l => prop(l, "_ub_voucher") != null);
  const brand = brandByName(voucherLine ? prop(voucherLine, "Brand") : null);
  const first = String(o.customer?.first_name || o.shipping_address?.first_name || o.billing_address?.first_name || "there").trim() || "there";
  const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.shipping_address?.name || null;

  const code = voucherCode();
  const expiresAt = new Date(Date.now() + VOUCHER.days * 86400000);
  expiresAt.setUTCHours(13, 59, 59, 0); // end of that day in Melbourne

  const base = {
    source_brand_id: VOUCHER.sourceBrandId, source_order_id: orderId, source_order_name: orderName,
    order_subtotal: subtotal, customer_email: email, customer_name: name,
    brand_id: brand.id, brand_name: brand.name, code, value: VOUCHER.value, min_spend: VOUCHER.minSpend,
    expires_at: expiresAt.toISOString(),
  };

  const made = await createBrandCode(brand, code, expiresAt, orderName);
  if (!made.ok) {
    await rest("issued_vouchers?on_conflict=source_order_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...base, status: "failed", error: made.error }) });
    return NextResponse.json({ ok: false, error: made.error }, { status: 200 });
  }

  const mail = await sendVoucherEmail({ to: email, firstName: first, brand, code, expiresAt, orderName });
  await rest("issued_vouchers?on_conflict=source_order_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...base, discount_gid: made.gid, email_sent: !!mail.ok, status: "issued", error: mail.ok ? null : `email: ${mail.error}` }) });
  await tagSourceOrder(gid, code);

  return NextResponse.json({ ok: true, code, brand: brand.name, emailed: !!mail.ok }, { status: 200 });
}
