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

type Txn = { brand_id: number; date: string; status: string; sale_value: number; commission: number; override_fee: number; affiliate: string | null; coupon: string | null };

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const brand = url.searchParams.get("brand");
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ ok: false, error: "bad range" }, { status: 400 });

  let q = `${sbUrl}/rest/v1/commission_factory_transactions?select=brand_id,date,status,sale_value,commission,override_fee,affiliate,coupon&date=gte.${from}&date=lte.${to}`;
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

  return NextResponse.json({
    ok: true,
    transactions: rows.length,
    affiliates: roll(r => r.affiliate),
    coupons: roll(r => r.coupon),
  });
}
