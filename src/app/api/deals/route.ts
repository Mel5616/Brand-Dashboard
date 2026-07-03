import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";

// Tradeshow deals: per-show, per-brand deal entry. Pricing (show_price) and the
// discount back-calc are computed server-side; a deal below the portfolio margin
// floor can't be saved active without an approver. Cost/margin hidden from non-admins.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const sb = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: H(), cache: "no-store" });
const num = (v: any) => (v == null || v === "" ? 0 : Number(v) || 0);
const round = (n: number) => Math.round(n * 100) / 100;
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

async function marginFloor(): Promise<number> {
  const r = await sb("deal_settings?id=eq.1&select=margin_floor&limit=1");
  if (!r.ok) return 20;
  const j = await r.json();
  return num(j?.[0]?.margin_floor) || 20;
}

// Resolve show_price + back-calculated discount from the mechanic.
function priced(b: any) {
  const rrp = num(b.rrp);
  let show = num(b.show_price);
  let dval = num(b.discount_value);
  if (b.mechanic === "discount") {
    if (b.discount_type === "pct_off") show = round(rrp * (1 - dval / 100));
    else if (b.discount_type === "amount_off") show = round(rrp - dval);
    else if (b.discount_type === "fixed_price") dval = round(rrp - show);
  } else {
    show = show || rrp; // GWP keeps RRP unless a special price is set
  }
  return { show_price: show, discount_value: dval };
}

// Effective margin fraction (GWP costs the gift into the deal).
function marginPct(b: any, showPrice: number) {
  const cost = num(b.cost_price) + (b.mechanic === "gwp" ? num(b.gift_cost) * (num(b.gift_qty) || 1) : 0);
  return showPrice > 0 ? (showPrice - cost) / showPrice : 0;
}

// Strip cost/margin fields for non-admins.
function scrub(deals: any[], admin: boolean) {
  if (admin) return deals;
  return deals.map(({ cost_price, gift_cost, ...rest }: any) => rest);
}

// Look up rrp + cost for a style code from the product master.
async function catalogueCost(code: string): Promise<{ rrp: number | null; cost_price: number | null }> {
  const r = await sb(`influencer_products?style_code=eq.${encodeURIComponent(code)}&select=rrp,cost_price&limit=1`);
  if (!r.ok) return { rrp: null, cost_price: null };
  const p = (await r.json())?.[0];
  return { rrp: p?.rrp != null ? Number(p.rrp) : null, cost_price: p?.cost_price != null ? Number(p.cost_price) : null };
}

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, deals: [] }, { status: 500 });
  const access = await getAccess();
  if (!access.role) return NextResponse.json({ ok: false, error: "unauthorised", deals: [] }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  // Admin-only single-product cost lookup, for the form's live margin readout.
  const costCode = sp.get("cost_code");
  if (costCode) {
    if (access.role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
    return NextResponse.json({ ok: true, ...(await catalogueCost(costCode)) });
  }
  const showId = sp.get("show_id");
  const flt = showId ? `&show_id=eq.${encodeURIComponent(showId)}` : "";
  const res = await sb(`show_deals?select=*${flt}&order=created_at.desc`);
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), deals: [] });
  return NextResponse.json({ ok: true, deals: scrub(JSON.parse(text || "[]"), access.role === "admin"), marginFloor: await marginFloor(), canManage: await canManage("show-deals"), admin: access.role === "admin" });
}

async function upsert(b: any, id?: string) {
  // Auto-fill RRP + cost from the product master when a SKU is linked and they weren't sent.
  if (b.product_code && (b.rrp == null || b.rrp === "" || b.cost_price == null || b.cost_price === "")) {
    const c = await catalogueCost(b.product_code);
    if ((b.rrp == null || b.rrp === "") && c.rrp != null) b.rrp = c.rrp;
    if ((b.cost_price == null || b.cost_price === "") && c.cost_price != null) b.cost_price = c.cost_price;
  }
  const { show_price, discount_value } = priced(b);
  const floor = await marginFloor();
  const mp = marginPct(b, show_price) * 100;
  // Guardrail: below the floor can't go active without an approver.
  if (b.status === "active" && mp < floor && !b.approved_by) {
    return { error: "below_floor", floor, margin: round(mp) };
  }
  const row: Record<string, any> = {
    show_id: b.show_id, brand: b.brand, scope: b.scope || "product",
    product_code: b.product_code || null, product_name: b.product_name || null, range_label: b.range_label || null,
    mechanic: b.mechanic || "discount", discount_type: b.discount_type || null, discount_value,
    rrp: b.rrp != null && b.rrp !== "" ? num(b.rrp) : null, cost_price: b.cost_price != null && b.cost_price !== "" ? num(b.cost_price) : null, show_price,
    gift_code: b.gift_code || null, gift_label: b.gift_label || null,
    gift_value: b.gift_value != null && b.gift_value !== "" ? num(b.gift_value) : null,
    gift_cost: b.gift_cost != null && b.gift_cost !== "" ? num(b.gift_cost) : null,
    gift_qty: b.gift_qty ? Math.max(1, parseInt(b.gift_qty)) : 1,
    gwp_trigger: b.gwp_trigger || null, min_spend: b.min_spend != null && b.min_spend !== "" ? num(b.min_spend) : null,
    stock_cap: b.stock_cap ? parseInt(b.stock_cap) : null, auto_add: b.auto_add !== false,
    valid_from: b.valid_from || null, valid_to: b.valid_to || null,
    channel: b.channel || "d2c_booth", stackable: !!b.stackable, one_per_customer: !!b.one_per_customer,
    status: b.status || "draft", approved_by: b.approved_by || null, notes: b.notes || null,
    updated_at: new Date().toISOString(),
  };
  const path = id ? `show_deals?id=eq.${encodeURIComponent(id)}` : "show_deals";
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, { method: id ? "PATCH" : "POST", headers: H({ Prefer: "return=minimal" }), body: JSON.stringify(id ? row : { ...row, created_at: new Date().toISOString() }) });
  return { ok: res.ok };
}

export async function POST(req: Request) {
  if (!(await canManage("show-deals"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.show_id || !b.brand) return NextResponse.json({ ok: false, error: "show + brand required" }, { status: 400 });
  const r = await upsert(b, b.id);
  if ((r as any).error) return NextResponse.json({ ok: false, ...r }, { status: 409 });
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if (!(await canManage("show-deals"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/show_deals?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: H({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

// Update the portfolio margin floor (admin only).
export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (b.margin_floor == null) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/deal_settings?id=eq.1`, { method: "PATCH", headers: H({ Prefer: "return=minimal" }), body: JSON.stringify({ margin_floor: num(b.margin_floor) }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
