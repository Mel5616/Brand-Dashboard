import { NextResponse } from "next/server";

// Live UPPAbaby Shopify POS query for booth orders. Called on demand from the
// Tradeshows tab so it doesn't add latency to other pages. POS orders are
// distinct from QR booth orders, so they can be summed for total booth revenue.

export const revalidate = 0;

const API_VERSION = "2024-01";
const WINDOW_DAYS = 180;

export async function GET() {
  const domain = process.env.UPPABABY_SHOPIFY_DOMAIN;
  const token = process.env.UPPABABY_SHOPIFY_TOKEN;
  if (!domain || !token) {
    return NextResponse.json({ ok: false, orders: 0, revenue: 0, daily: [] });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  // source_name:pos filters server-side so web orders never crowd out POS
  const query = `{
    orders(first: 250, query: "financial_status:paid source_name:pos created_at:>=${since}", sortKey: CREATED_AT, reverse: true) {
      edges { node { sourceName createdAt totalPriceSet { shopMoney { amount } } } }
    }
  }`;

  try {
    const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    const json = await res.json();
    const edges = json?.data?.orders?.edges ?? [];
    const pos = edges
      .map((e: any) => e.node)
      .filter((n: any) => (n.sourceName || "").toLowerCase() === "pos");

    let revenue = 0;
    const byDay = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const n of pos) {
      const amt = Number(n.totalPriceSet?.shopMoney?.amount ?? 0);
      revenue += amt;
      const date = String(n.createdAt).slice(0, 10);
      const d = byDay.get(date) ?? { date, revenue: 0, orders: 0 };
      d.revenue += amt;
      d.orders += 1;
      byDay.set(date, d);
    }
    const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ ok: true, orders: pos.length, revenue, daily });
  } catch (e: any) {
    return NextResponse.json({ ok: false, orders: 0, revenue: 0, daily: [], error: String(e) });
  }
}
