import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Real performance for every tracked partnership — three different tracking
// mechanisms merged into one view:
//  - most partners have a Shopify discount code (influencer_sales, via
//    scripts/sync_influencer_sales.py)
//  - a wholesale/reseller account with no code of its own (e.g. Baby and
//    Car) is tracked by its Cin7 customer email instead (cin7_customer_sales,
//    via scripts/sync_partnership_cin7_sales.py)
//  - Commission Factory affiliates are tracked as a program, not individual
//    partnership_entries rows — pulled live from commission_factory_transactions
//    (same shape as /api/affiliates' roll(), last 12 months, non-Void only).
//    sale_value there is ATTRIBUTED revenue already counted in Shopify/store
//    revenue — never additive with the other two sources.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

type CfTxn = { date: string; status: string; sale_value: number; affiliate: string | null; affiliate_id: string | null };

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [entriesRes, salesRes, cin7Res, cfRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/partnership_entries?select=id,company,brand,affiliate_code,cin7_email,kind,status,created_at&or=(affiliate_code.not.is.null,cin7_email.not.is.null)&order=created_at.desc`, { headers: h, cache: "no-store" }),
    // brand_id is required here (not just code) — the same code can now span
    // multiple brands (e.g. MM15 on UPPAbaby, MiaMily and Matchstick Monkey
    // all at once), so aggregating by code alone would show every brand's
    // row the same combined total.
    fetch(`${sbUrl}/rest/v1/influencer_sales?select=brand_id,code,month_key,orders,revenue&limit=5000`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/cin7_customer_sales?select=customer_email,month_key,orders,revenue&limit=5000`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/commission_factory_transactions?select=date,status,sale_value,affiliate,affiliate_id&date=gte.${since}&limit=10000`, { headers: h, cache: "no-store" }),
  ]);
  const text = await entriesRes.text();
  if (!entriesRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(entriesRes.status, text), entries: [], sales: [], cin7Sales: [], cfAffiliates: [] });
  const sales = salesRes.ok ? JSON.parse((await salesRes.text()) || "[]") : [];
  const cin7Sales = cin7Res.ok ? JSON.parse((await cin7Res.text()) || "[]") : [];

  let cfAffiliates: { name: string; transactions: number; sale_value: number }[] = [];
  if (cfRes.ok) {
    const cfRows = ((JSON.parse((await cfRes.text()) || "[]")) as CfTxn[]).filter(r => (r.status || "") !== "Void");
    const m = new Map<string, { name: string; transactions: number; sale_value: number }>();
    for (const r of cfRows) {
      const k = r.affiliate_id || r.affiliate;
      if (!k) continue;
      const cur = m.get(k) ?? { name: r.affiliate || k, transactions: 0, sale_value: 0 };
      cur.transactions++; cur.sale_value += Number(r.sale_value) || 0;
      m.set(k, cur);
    }
    cfAffiliates = [...m.values()].sort((a, b) => b.sale_value - a.sale_value).slice(0, 15);
  }

  return NextResponse.json({ ok: true, entries: JSON.parse(text || "[]"), sales, cin7Sales, cfAffiliates });
}
