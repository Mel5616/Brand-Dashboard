import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Top affiliates + coupon performance from commission_factory_transactions.
// Queried on demand so the raw rows never bloat the main page load.
// sale_value is ATTRIBUTED revenue (already in Shopify) — never additive.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Txn = { brand_id: number; date: string; status: string; sale_value: number; commission: number; override_fee: number; affiliate: string | null; affiliate_id: string | null; coupon: string | null; invoice_id: string | null; order_id: string | null };

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const brand = url.searchParams.get("brand");
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ ok: false, error: "bad range" }, { status: 400 });

  let q = `${sbUrl}/rest/v1/commission_factory_transactions?select=brand_id,date,status,sale_value,commission,override_fee,affiliate,affiliate_id,coupon,invoice_id,order_id&date=gte.${from}&date=lte.${to}`;
  if (brand && brand !== "all" && /^\d+$/.test(brand)) q += `&brand_id=eq.${brand}`;

  const res = await fetch(q, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    if (missing(res.status, text)) return NextResponse.json({ ok: true, needsSetup: true, affiliates: [], coupons: [] });
    return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  }

  // Void transactions are cancelled — they cost nothing and earned nothing.
  const rows = (JSON.parse(text || "[]") as Txn[]).filter(r => (r.status || "") !== "Void");
  const roll = (key: (r: Txn) => string | null) => {
    const m = new Map<string, { name: string; transactions: number; sale_value: number; cost: number }>();
    for (const r of rows) {
      const k = key(r);
      if (!k) continue;
      const cur = m.get(k) ?? { name: k, transactions: 0, sale_value: 0, cost: 0 };
      cur.transactions++;
      cur.sale_value += Number(r.sale_value) || 0;
      cur.cost += (Number(r.commission) || 0) + (Number(r.override_fee) || 0);
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.sale_value - a.sale_value).slice(0, 15);
  };

  // Distinct affiliates that have driven a real (non-Void) transaction in
  // range. Keyed by affiliate_id where we have it (a stable numeric key);
  // falls back to the business-name string for rows synced before that
  // column existed.
  const affiliateKeys = new Set(rows.map(r => r.affiliate_id || r.affiliate).filter(Boolean));

  // Invoices — null until Commission Factory actually issues a payout
  // invoice covering a transaction, so this legitimately stays empty for a
  // newly-launched program. Not every real transaction has one yet.
  const invMap = new Map<string, { invoice_id: string; transactions: number; cost: number }>();
  for (const r of rows) {
    if (!r.invoice_id) continue;
    const cur = invMap.get(r.invoice_id) ?? { invoice_id: r.invoice_id, transactions: 0, cost: 0 };
    cur.transactions++;
    cur.cost += (Number(r.commission) || 0) + (Number(r.override_fee) || 0);
    invMap.set(r.invoice_id, cur);
  }

  // Monthly Attributed sales vs Total cost (commission + override fee) — the
  // "how effective is the platform" view. Deliberately LIVE: includes Pending
  // alongside Approved (rows already excludes Void), same basis as the KPI
  // band above, so a newly-launched program shows something meaningful
  // during CF's validation window instead of a flat cost-only chart. This
  // is real-time, not a snapshot — if a Pending transaction later gets
  // voided, it drops out of both sales and cost on the next load.
  // Subscription fees aren't in commission_factory_transactions at all, so
  // the client adds those in from the subscription-invoice rows it already
  // holds rather than this route reaching into a second table.
  const monthlyMap = new Map<string, { month_key: string; sales: number; cost: number }>();
  for (const r of rows) {
    const mk = r.date.slice(0, 7);
    const cur = monthlyMap.get(mk) ?? { month_key: mk, sales: 0, cost: 0 };
    cur.sales += Number(r.sale_value) || 0;
    cur.cost += (Number(r.commission) || 0) + (Number(r.override_fee) || 0);
    monthlyMap.set(mk, cur);
  }

  // Individual transactions, most recent first, capped so the payload stays
  // sane — this is a detail table, not a metric input.
  const transactionRows = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map(r => ({
    date: r.date, status: r.status, affiliate: r.affiliate, order_id: r.order_id,
    sale_value: r.sale_value, commission: r.commission, override_fee: r.override_fee,
    commission_pct: r.sale_value > 0 ? ((r.commission / r.sale_value) * 100) : null,
  }));

  return NextResponse.json({
    ok: true,
    transactions: rows.length,
    affiliates: roll(r => r.affiliate),
    coupons: roll(r => r.coupon),
    distinctAffiliates: affiliateKeys.size,
    invoices: [...invMap.values()].sort((a, b) => b.cost - a.cost),
    monthly: [...monthlyMap.values()].sort((a, b) => a.month_key.localeCompare(b.month_key)),
    transactionRows,
  });
}
