import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { storeCreds, mintToken } from "@/lib/shopifyMint";

// Creator / influencer discount codes, tracked live from Shopify.
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD[&brand=ID]  -> creators with sales, monthly rollup, orders, payouts
// POST {brand_id, code, creator_name, ...}         -> register a code (admin)
// PATCH {id, ...fields} | {payout: {creator_id, month_key, amount, paid_on, reference}} (admin)
// DELETE ?id= | ?payout=                          (admin)
//
// Sale value is ATTRIBUTED revenue; those orders are already in Shopify revenue.
// Commission base = order subtotal after discount, before shipping, net of refunds.
export const revalidate = 0;
export const maxDuration = 60;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Creator = { id: string; brand_id: number; code: string; creator_name: string; handle: string | null; platform: string | null; followers: number | null; commission_pct: number; offer: string | null; program: string | null; started_on: string | null; active: boolean; notes: string | null };
type Order = { id: string; name: string; created_at: string; customer: string; first_order: boolean; subtotal: number; discount: number; shipping: number; refunded: number; net: number; commission: number; status: string };

/* ---- live Shopify orders for one code (cached 10 min per code+range) ---- */
const cache = new Map<string, { at: number; orders: Order[] }>();
async function ordersForCode(brandId: number, code: string, from: string, to: string, pct: number): Promise<Order[] | null> {
  const key = `${brandId}|${code}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.orders.map(o => ({ ...o, commission: +(o.net * pct / 100).toFixed(2) }));
  const cred = storeCreds().find(c => c.id === brandId);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return null;
  const out: Order[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 8; page++) {
    const after: string = cursor ? `, after: "${cursor}"` : "";
    const q = `{ orders(first: 100${after}, sortKey: CREATED_AT, reverse: true, query: "discount_code:${code.replace(/"/g, "")} created_at:>=${from}T00:00:00+10:00 created_at:<=${to}T23:59:59+10:00") {
      edges { cursor node { id name createdAt cancelledAt displayFinancialStatus
        currentSubtotalPriceSet { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } totalShippingPriceSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } }
        discountCodes customer { displayName numberOfOrders } } }
      pageInfo { hasNextPage } } }`;
    const res = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store" }).catch(() => null);
    const j: any = await res?.json().catch(() => null);
    const edges: any[] = j?.data?.orders?.edges || [];
    for (const e of edges) {
      const n = e.node;
      // Shopify's search is a substring match; keep exact code matches only.
      if (!(n.discountCodes || []).some((c: string) => c.toUpperCase() === code.toUpperCase())) continue;
      const num = (x: any) => Number(x?.shopMoney?.amount || 0);
      const subtotal = num(n.currentSubtotalPriceSet), refunded = num(n.totalRefundedSet);
      const cancelled = !!n.cancelledAt || /VOIDED/.test(n.displayFinancialStatus || "");
      const net = cancelled ? 0 : Math.max(0, subtotal - refunded);
      out.push({ id: n.id, name: n.name, created_at: n.createdAt, customer: n.customer?.displayName || "Guest", first_order: (n.customer?.numberOfOrders ?? 1) <= 1,
        subtotal, discount: num(n.totalDiscountsSet), shipping: num(n.totalShippingPriceSet), refunded, net, commission: +(net * pct / 100).toFixed(2),
        status: cancelled ? "cancelled" : refunded > 0 ? (refunded >= subtotal ? "refunded" : "part refunded") : "paid" });
    }
    if (!j?.data?.orders?.pageInfo?.hasNextPage || !edges.length) break;
    cursor = edges[edges.length - 1].cursor;
  }
  cache.set(key, { at: Date.now(), orders: out });
  if (cache.size > 500) cache.clear();
  return out;
}

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "", brand = url.searchParams.get("brand");
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ ok: false, error: "bad range" }, { status: 400 });
  const sb = await createClient();
  let q = sb.from("creator_codes").select("*").order("created_at", { ascending: true });
  if (brand && brand !== "all" && /^\d+$/.test(brand)) q = q.eq("brand_id", Number(brand));
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), creators: [] });
  const creators = (data || []) as Creator[];
  const { data: payouts } = await sb.from("creator_payouts").select("*").in("creator_id", creators.map(c => c.id).concat(["00000000-0000-0000-0000-000000000000"]));

  const rows = await Promise.all(creators.map(async c => {
    const orders = await ordersForCode(c.brand_id, c.code, from, to, Number(c.commission_pct) || 0);
    const monthly = new Map<string, { month_key: string; orders: number; net: number; discount: number; commission: number }>();
    for (const o of orders || []) {
      const k = o.created_at.slice(0, 7);
      const m = monthly.get(k) ?? { month_key: k, orders: 0, net: 0, discount: 0, commission: 0 };
      m.orders++; m.net += o.net; m.discount += o.discount; m.commission += o.commission; monthly.set(k, m);
    }
    const mine = (payouts || []).filter((p: any) => p.creator_id === c.id);
    const totals = { orders: (orders || []).length, net: 0, discount: 0, commission: 0, first_orders: 0, paid: mine.reduce((s: number, p: any) => s + Number(p.amount || 0), 0) };
    for (const o of orders || []) { totals.net += o.net; totals.discount += o.discount; totals.commission += o.commission; if (o.first_order) totals.first_orders++; }
    return { ...c, live: orders !== null, orders: orders || [], monthly: [...monthly.values()].sort((a, b) => a.month_key.localeCompare(b.month_key)), payouts: mine, totals: { ...totals, owed: +(totals.commission - totals.paid).toFixed(2) } };
  }));
  return NextResponse.json({ ok: true, creators: rows });
}

const clean = (b: any) => ({
  brand_id: Number(b.brand_id), code: String(b.code || "").trim().toUpperCase().slice(0, 40), creator_name: String(b.creator_name || "").trim().slice(0, 120),
  handle: String(b.handle || "").trim().slice(0, 80) || null, platform: String(b.platform || "instagram").trim().slice(0, 40),
  followers: b.followers === "" || b.followers == null ? null : Number(b.followers) || null, commission_pct: Number(b.commission_pct) || 0,
  offer: String(b.offer || "").trim().slice(0, 200) || null, program: String(b.program || "").trim().slice(0, 120) || null,
  started_on: String(b.started_on || "").slice(0, 10) || null, active: b.active !== false, notes: String(b.notes || "").trim().slice(0, 1000) || null,
});

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const row = clean(b);
  if (!Number.isFinite(row.brand_id) || !row.code || !row.creator_name) return NextResponse.json({ ok: false, error: "Brand, code and creator name are required" }, { status: 400 });
  const sb = await createClient();
  const { data, error } = await sb.from("creator_codes").insert({ ...row, created_by: access.user?.email ?? null }).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: /duplicate/i.test(error.message) ? "That code is already registered for this brand" : error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const sb = await createClient();
  if (b.payout) {
    const p = b.payout;
    if (!p.creator_id || !/^\d{4}-\d{2}$/.test(p.month_key || "")) return NextResponse.json({ ok: false, error: "creator and month required" }, { status: 400 });
    const row = { creator_id: p.creator_id, month_key: p.month_key, amount: Number(p.amount) || 0, paid_on: String(p.paid_on || "").slice(0, 10) || new Date().toISOString().slice(0, 10), reference: String(p.reference || "").slice(0, 120) || null, created_by: access.user?.email ?? null };
    const { data, error } = await sb.from("creator_payouts").upsert(row, { onConflict: "creator_id,month_key" }).select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }
  if (!b.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const row = clean(b); const patch: any = {};
  for (const k of ["creator_name", "handle", "platform", "followers", "commission_pct", "offer", "program", "started_on", "active", "notes"]) if (k in b) patch[k] = (row as any)[k];
  const { data, error } = await sb.from("creator_codes").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const u = new URL(req.url); const id = u.searchParams.get("id"); const payout = u.searchParams.get("payout");
  const sb = await createClient();
  const { error } = payout ? await sb.from("creator_payouts").delete().eq("id", payout) : id ? await sb.from("creator_codes").delete().eq("id", id) : { error: { message: "id required" } as any };
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
