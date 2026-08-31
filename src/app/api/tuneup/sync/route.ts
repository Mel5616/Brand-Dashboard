import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { storeCreds } from "@/lib/shopifyMint";
import { syncTuneupOrders } from "@/lib/tuneupShopify";

// Matches pending_payment bookings to their now-real Shopify orders (see
// tuneupShopify.ts for why this is polling, not a webhook). Called from the
// admin panel and the check-in page, so a booking never sits unconfirmed
// for long even without someone explicitly clicking "sync".
export const revalidate = 0;
export const maxDuration = 30;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });
const UPPABABY_BRAND_ID = 5;

export async function POST() {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const variantId = process.env.TUNEUP_VARIANT_ID;
  const cred = storeCreds().find(s => s.id === UPPABABY_BRAND_ID);
  if (!variantId || !cred) return NextResponse.json({ ok: false, error: "Tune-Up product not configured" }, { status: 500 });

  const pendingRes = await rest("tuneup_bookings?status=eq.pending_payment&select=id,created_at&order=created_at.asc&limit=200");
  const pending: { id: string; created_at: string }[] = await pendingRes.json().catch(() => []);
  if (!pending.length) return NextResponse.json({ ok: true, matched: 0 });

  const oldest = pending.reduce((a, b) => (a.created_at < b.created_at ? a : b));
  const since = new Date(new Date(oldest.created_at).getTime() - 60 * 60 * 1000).toISOString();

  let matched = 0;
  try {
    const orders = await syncTuneupOrders(cred, variantId, since);
    const pendingIds = new Set(pending.map(p => p.id));
    for (const o of orders) {
      if (!pendingIds.has(o.bookingId)) continue;
      await rest(`tuneup_bookings?id=eq.${encodeURIComponent(o.bookingId)}`, {
        method: "PATCH", headers: h({ Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "booked", shopify_order_id: o.orderId, shopify_order_number: o.orderNumber }),
      });
      matched++;
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, matched });
}
