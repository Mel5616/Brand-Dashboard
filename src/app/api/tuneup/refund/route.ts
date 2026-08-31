import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { storeCreds } from "@/lib/shopifyMint";
import { refundTuneupOrder } from "@/lib/tuneupShopify";

// Bulk end-of-day refund: every checked_in booking for the given day gets
// its $20 refunded in one hit. Admin-only, and deliberately requires an
// explicit tuneup_day_id — never "refund everything" in one call.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });
const UPPABABY_BRAND_ID = 5;

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const cred = storeCreds().find(s => s.id === UPPABABY_BRAND_ID);
  if (!cred) return NextResponse.json({ ok: false, error: "Store not configured" }, { status: 500 });

  let b: { tuneup_day_id?: string }; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.tuneup_day_id) return NextResponse.json({ ok: false, error: "Missing tuneup_day_id" }, { status: 400 });

  const res = await rest(`tuneup_bookings?tuneup_day_id=eq.${encodeURIComponent(b.tuneup_day_id)}&status=eq.checked_in&select=id,shopify_order_id,amount`);
  const bookings: { id: string; shopify_order_id: string | null; amount: number }[] = await res.json().catch(() => []);
  const toRefund = bookings.filter(bk => bk.shopify_order_id);
  if (!toRefund.length) return NextResponse.json({ ok: true, refunded: 0, failed: 0 });

  let refunded = 0; const failures: { id: string; error: string }[] = [];
  for (const bk of toRefund) {
    try {
      await refundTuneupOrder(cred, bk.shopify_order_id!, bk.amount);
      await rest(`tuneup_bookings?id=eq.${encodeURIComponent(bk.id)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "refunded", refunded_at: new Date().toISOString() }) });
      refunded++;
    } catch (e: unknown) {
      failures.push({ id: bk.id, error: e instanceof Error ? e.message : "Refund failed" });
    }
  }
  return NextResponse.json({ ok: true, refunded, failed: failures.length, failures });
}
