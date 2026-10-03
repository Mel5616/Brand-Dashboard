import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-code performance from discount_code_performance (synced from real
// Shopify orders by scripts/sync_code_performance.py). Revenue and discount
// are ex-GST. Margin is an ESTIMATE from the cost sheet and is withheld
// (null) when too little of the order quantity could be costed.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

const MIN_COVERAGE = 0.6;

type Row = {
  brand_id: number; code: string; month_key: string; orders: number; net_revenue: number;
  discount_given: number; new_customers: number; est_cost: number; qty_total: number; qty_costed: number;
};

// Batches of single-use codes (UBL-f13ea5a14d95, WF-F3L9B2CQ, UB20-XR7V5H) are
// one "code" to the marketer, so roll them up by prefix. A suffix only counts
// as random if it mixes digits in and never spells a word (4+ letters in a
// row), so named codes (UB-WELCOME20, UB-REGISTRATION15, WARRIOR-FATIMA)
// stay individual.
function groupKey(code: string): { key: string; batch: boolean } {
  const m = /^([A-Z0-9]{2,6})-([A-Z0-9]{6,})$/.exec(code);
  if (m && /\d/.test(m[2]) && !/[A-Z]{4,}/.test(m[2])) return { key: `${m[1]}-*`, batch: true };
  return { key: code, batch: false };
}

const melMonth = (offset: number) => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
  d.setDate(1); d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const period = new URL(req.url).searchParams.get("period") || "3m";
  const months = period === "this" ? [melMonth(0)] : period === "last" ? [melMonth(-1)] : [melMonth(0), melMonth(-1), melMonth(-2)];

  const res = await fetch(`${sbUrl}/rest/v1/discount_code_performance?select=*&month_key=in.(${months.join(",")})&limit=10000`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), rows: [], months });

  const agg = new Map<string, { brand_id: number; code: string; batch: boolean; codes: Set<string>; orders: number; net: number; disc: number; newc: number; cost: number; qt: number; qc: number }>();
  for (const r of JSON.parse(text || "[]") as Row[]) {
    const { key, batch } = groupKey(r.code);
    const k = `${r.brand_id}|${key}`;
    const a = agg.get(k) ?? { brand_id: r.brand_id, code: key, batch, codes: new Set<string>(), orders: 0, net: 0, disc: 0, newc: 0, cost: 0, qt: 0, qc: 0 };
    a.codes.add(r.code);
    a.orders += r.orders; a.net += Number(r.net_revenue); a.disc += Number(r.discount_given);
    a.newc += r.new_customers; a.cost += Number(r.est_cost); a.qt += r.qty_total; a.qc += r.qty_costed;
    agg.set(k, a);
  }

  const rows = [...agg.values()].map(a => {
    const coverage = a.qt > 0 ? a.qc / a.qt : 0;
    const gross = a.net + a.disc;
    return {
      brand_id: a.brand_id, code: a.code, batch: a.batch, code_count: a.codes.size,
      orders: a.orders, net_revenue: Math.round(a.net), aov: a.orders ? Math.round(a.net / a.orders) : 0,
      discount_given: Math.round(a.disc), discount_pct: gross > 0 ? Math.round((a.disc / gross) * 1000) / 10 : 0,
      new_customer_pct: a.orders ? Math.round((a.newc / a.orders) * 100) : 0,
      cost_coverage: Math.round(coverage * 100),
      est_margin_pct: coverage >= MIN_COVERAGE && a.net > 0 ? Math.round(((a.net - a.cost / coverage) / a.net) * 100) : null,
    };
  }).sort((x, y) => y.net_revenue - x.net_revenue);

  return NextResponse.json({ ok: true, rows, months });
}
