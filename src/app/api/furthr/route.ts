import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { shopifyTokenForBrand } from "@/lib/shopifyBrandKeys";

// Furthr card-linked cashback campaign (UPPAbaby). No API from Furthr yet —
// Mel uploads their transaction export CSV (admin, POST), same manual
// pattern as Baby Bunting. GET returns totals + the raw rows, each flagged
// if its order_id also shows up in commission_factory_transactions — a real
// order (UB#33749) was found double-tracked by Furthr and Commission
// Factory's ShopBack Australia affiliate on 29 Sep 2026, so every row here
// gets checked against that risk rather than trusting Furthr's export alone.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const num = (v: unknown) => Number(v) || 0;

type FurthrTxn = {
  id: string; brand_id: number; transaction_id: string; transaction_date: string;
  amount: number; cashback: number; fee: number; bank: string | null;
  order_id: string | null; customer_id: string | null; status: string | null;
  is_new_customer: boolean | null;
};
type Campaign = { id: string; brand_id: number; bank: string; offer: string; status: string; starts_at: string | null; ends_at: string | null };

// Resolves "is this order_id that customer's first-ever order" against
// Shopify (not anything in Furthr's own export) for whichever rows haven't
// been resolved yet, and persists the answer so it's a one-off cost per row.
async function backfillNewCustomerFlag(rows: FurthrTxn[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const pending = rows.filter(r => r.is_new_customer === null && r.customer_id && r.order_id);
  const byBrand = new Map<number, FurthrTxn[]>();
  for (const r of pending) byBrand.set(r.brand_id, [...(byBrand.get(r.brand_id) ?? []), r]);

  for (const [brandId, brandRows] of byBrand) {
    const resolved = await shopifyTokenForBrand(brandId);
    if (!resolved) continue;
    const { store, token } = resolved;
    const patches: { id: string; is_new_customer: boolean }[] = [];
    for (const r of brandRows) {
      const q = `query($id: ID!){ customer(id: $id) { orders(first: 1, sortKey: CREATED_AT) { nodes { name } } } }`;
      const res = await fetch(`https://${store.domain}/admin/api/2025-01/graphql.json`, {
        method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, variables: { id: r.customer_id } }), cache: "no-store",
      }).catch(() => null);
      if (!res?.ok) continue;
      const j = await res.json().catch(() => null);
      const firstOrder = j?.data?.customer?.orders?.nodes?.[0]?.name;
      if (!firstOrder) continue;
      const isNew = firstOrder === r.order_id;
      result.set(r.id, isNew);
      patches.push({ id: r.id, is_new_customer: isNew });
    }
    // PATCH one row at a time — PostgREST has no per-row-value bulk update.
    await Promise.all(patches.map(p =>
      fetch(`${sbUrl}/rest/v1/furthr_transactions?id=eq.${p.id}`, { method: "PATCH", headers: H({ Prefer: "return=minimal" }), body: JSON.stringify({ is_new_customer: p.is_new_customer }) })
    ));
  }
  return result;
}

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  const brand = new URL(req.url).searchParams.get("brand");
  const brandF = brand && brand !== "all" && /^\d+$/.test(brand) ? `&brand_id=eq.${brand}` : "";

  const [txnRes, campRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/furthr_transactions?select=*${brandF}&order=transaction_date.desc&limit=2000`, { headers: H(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/furthr_campaigns?select=*${brandF}&order=starts_at.desc`, { headers: H(), cache: "no-store" }),
  ]);
  const txnText = await txnRes.text();
  if (!txnRes.ok) {
    if (missing(txnRes.status, txnText)) return NextResponse.json({ ok: true, needsSetup: true, transactions: [], campaigns: [], kpi: null });
    return NextResponse.json({ ok: false, error: txnText.slice(0, 200) }, { status: 500 });
  }
  const transactions = JSON.parse(txnText || "[]") as FurthrTxn[];
  const campaigns = campRes.ok ? (JSON.parse((await campRes.text()) || "[]") as Campaign[]) : [];

  // Cross-check every order_id against Commission Factory — flag real overlap risk.
  const orderIds = [...new Set(transactions.map(t => t.order_id).filter(Boolean))] as string[];
  const overlapMap = new Map<string, { affiliate: string | null; status: string; sale_value: number; commission: number }>();
  if (orderIds.length) {
    // Order ids like "UB#33749" contain '#', which truncates a URL at the
    // fragment if left unencoded — every id must be percent-encoded (the
    // literal quotes stay unencoded, they're PostgREST's own list syntax).
    const orFilter = orderIds.map(o => `"${encodeURIComponent(o)}"`).join(",");
    const cfRes = await fetch(`${sbUrl}/rest/v1/commission_factory_transactions?select=order_id,affiliate,status,sale_value,commission&order_id=in.(${orFilter})`, { headers: H(), cache: "no-store" });
    if (cfRes.ok) {
      const cfRows = JSON.parse((await cfRes.text()) || "[]") as { order_id: string; affiliate: string | null; status: string; sale_value: number; commission: number }[];
      for (const r of cfRows) overlapMap.set(r.order_id, { affiliate: r.affiliate, status: r.status, sale_value: r.sale_value, commission: r.commission });
    }
  }
  // Backfill "new customer?" for any row that hasn't been resolved yet —
  // cheap after the first load of a batch, since it's persisted per row.
  const newCustomerPatched = await backfillNewCustomerFlag(transactions);
  const rows = transactions.map(t => ({
    ...t,
    is_new_customer: newCustomerPatched.get(t.id) ?? t.is_new_customer,
    overlap: t.order_id ? overlapMap.get(t.order_id) ?? null : null,
  }));

  const uniqueCustomers = new Set(transactions.map(t => t.customer_id).filter(Boolean)).size;
  const revenue = transactions.reduce((s, t) => s + num(t.amount), 0);
  const spend = transactions.reduce((s, t) => s + num(t.fee), 0);
  const resolvedNew = rows.filter(r => r.is_new_customer !== null);
  const kpi = {
    revenue, spend, transactions: transactions.length,
    customers: uniqueCustomers || transactions.length,
    aov: transactions.length ? revenue / transactions.length : 0,
    overlapCount: rows.filter(r => r.overlap).length,
    overlapCost: rows.reduce((s, r) => s + (r.overlap ? num(r.overlap.commission) : 0), 0),
    newCustomerCount: rows.filter(r => r.is_new_customer === true).length,
    newCustomerRate: resolvedNew.length ? (rows.filter(r => r.is_new_customer === true).length / resolvedNew.length) * 100 : null,
  };

  return NextResponse.json({ ok: true, kpi, transactions: rows, campaigns });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, error: "no rows" }, { status: 400 });
  const withMeta = rows.map((r: any) => ({ ...r, created_by: acc.user?.email ?? null }));
  const res = await fetch(`${sbUrl}/rest/v1/furthr_transactions?on_conflict=transaction_id`, {
    method: "POST", headers: H({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(withMeta),
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ ok: false, needsSetup: missing(res.status, t), error: t.slice(0, 300) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length });
}

export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // Campaign create/update — id present = update, absent = create.
  const { id, ...fields } = b;
  if (id) {
    const res = await fetch(`${sbUrl}/rest/v1/furthr_campaigns?id=eq.${id}`, { method: "PATCH", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, campaign: JSON.parse(text)[0] });
  }
  const res = await fetch(`${sbUrl}/rest/v1/furthr_campaigns`, { method: "POST", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/furthr_campaigns?id=eq.${id}`, { method: "DELETE", headers: H({ Prefer: "return=minimal" }) });
  if (!res.ok) return NextResponse.json({ ok: false, error: (await res.text()).slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
