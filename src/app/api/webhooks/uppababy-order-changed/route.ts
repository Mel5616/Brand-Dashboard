import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { configured, rest } from "@/lib/registry";
import { VOUCHER, deactivateBrandCode, type VoucherRow } from "@/lib/vouchers";

// Shopify "orders/cancelled" and "refunds/create" from the UPPAbaby store.
// If an order that earned a $20 voucher is cancelled, or refunded to below
// the $500 threshold, the voucher is switched off on the brand store and the
// row marked cancelled. A partial refund that leaves the order at $500 or
// more keeps the voucher. A code already redeemed is left alone.
export const revalidate = 0;
export const maxDuration = 30;

function authentic(raw: string, sig: string | null) {
  const cred = storeCreds().find(c => c.id === VOUCHER.sourceBrandId);
  if (!cred || !sig) return false;
  const digest = createHmac("sha256", cred.clientSecret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(digest), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function orderState(orderId: number) {
  const cred = storeCreds().find(c => c.id === VOUCHER.sourceBrandId);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return null;
  const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ order(id: "gid://shopify/Order/${orderId}") { cancelledAt currentSubtotalPriceSet { shopMoney { amount } } } }` }), cache: "no-store",
  }).catch(() => null);
  const j = await res?.json().catch(() => null);
  const o = j?.data?.order;
  return o ? { cancelled: !!o.cancelledAt, subtotal: Number(o.currentSubtotalPriceSet?.shopMoney?.amount || 0) } : null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!authentic(raw, req.headers.get("x-shopify-hmac-sha256"))) return NextResponse.json({ ok: false }, { status: 401 });
  if (!configured()) return NextResponse.json({ ok: false }, { status: 200 });
  const topic = req.headers.get("x-shopify-topic") || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any; try { p = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 200 }); }
  const orderId = Number(topic.startsWith("refunds/") ? p.order_id : p.id);
  if (!orderId) return NextResponse.json({ ok: false }, { status: 200 });

  const found = await rest(`issued_vouchers?source_order_id=eq.${orderId}&select=*`);
  if (!found.ok) return NextResponse.json({ ok: false, error: "issued_vouchers unavailable" }, { status: 503 });
  const row = ((await found.json().catch(() => [])) as VoucherRow[])[0];
  if (!row || row.status !== "issued") return NextResponse.json({ ok: true, skipped: row ? row.status : "no voucher" }, { status: 200 });

  const state = await orderState(orderId);
  if (!state) return NextResponse.json({ ok: false, error: "order lookup failed" }, { status: 503 });
  const cancel = state.cancelled || state.subtotal < VOUCHER.threshold;
  if (!cancel) return NextResponse.json({ ok: true, skipped: `still $${state.subtotal}` }, { status: 200 });

  const off = row.discount_gid ? await deactivateBrandCode(row.brand_id, row.discount_gid) : { ok: false as const, error: "no discount id" };
  const why = state.cancelled ? "order cancelled" : `refunded to $${state.subtotal.toFixed(2)}`;
  await rest(`issued_vouchers?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify(off.ok ? { status: "cancelled", error: `Cancelled: ${why}` } : { error: `Could not deactivate (${why}): ${off.error}` }) });
  return NextResponse.json({ ok: off.ok, why, error: off.ok ? undefined : off.error }, { status: 200 });
}
