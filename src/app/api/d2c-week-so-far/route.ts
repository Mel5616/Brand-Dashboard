import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { resolveToken } from "@/lib/shopifyMint";

// Live "week so far" for the D2C Weekly tab: the current business week
// (Sun → now) computed straight from Shopify, same definition as the Sunday
// report — web orders only (POS excluded), revenue ex-GST. Also returns the
// same elapsed days of the previous week for a fair WoW comparison.
export const revalidate = 0;
export const maxDuration = 60;

const melDate = (isoStr: string) =>
  new Date(isoStr).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });

  let stores: { id: number; name: string; domain: string; token: string }[] = [];
  try { stores = JSON.parse(process.env.BRAND_SHOPIFY || "[]"); } catch { /* noop */ }
  if (!stores.length) return NextResponse.json({ ok: true, weekSoFar: null });

  // Current business week starts on the most recent Sunday (AEST)
  const todayMel = melDate(new Date().toISOString());
  const t = new Date(todayMel + "T00:00:00Z");
  const weekStart = iso(new Date(t.getTime() - t.getUTCDay() * 864e5));
  const prevWeekStart = iso(new Date(new Date(weekStart + "T00:00:00Z").getTime() - 7 * 864e5));
  // Same number of elapsed days last week (inclusive)
  const prevCut = iso(new Date(new Date(prevWeekStart + "T00:00:00Z").getTime() +
    (new Date(todayMel + "T00:00:00Z").getTime() - new Date(weekStart + "T00:00:00Z").getTime())));

  // One fetch window covers both weeks (+1 day padding for timezone edges)
  const since = iso(new Date(new Date(prevWeekStart + "T00:00:00Z").getTime() - 864e5));

  const byBrand = new Map<string, { brand: string; revenue: number; orders: number; prevRevenue: number; prevOrders: number }>();
  await Promise.all(stores.map(async (st0) => {
    const st = { ...st0, token: (await resolveToken(st0 as any)) ?? st0.token };
    const row = { brand: st.name, revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 };
    byBrand.set(st.name, row);
    let cursor: string | null = null;
    for (let p = 0; p < 6; p++) {
      const after: string = cursor ? `, after: "${cursor}"` : "";
      const q = `{ orders(first: 250${after}, query: "financial_status:paid created_at:>=${since}", sortKey: CREATED_AT) {
        edges { cursor node { createdAt sourceName totalPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } } }
        pageInfo { hasNextPage } } }`;
      const j: any = await fetch(`https://${st.domain}/admin/api/2024-01/graphql.json`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": st.token },
        body: JSON.stringify({ query: q }), cache: "no-store",
      }).then(r => r.json()).catch(() => null);
      const edges = j?.data?.orders?.edges ?? [];
      for (const e of edges) {
        const n = e.node;
        if ((n.sourceName || "").toLowerCase() === "pos") continue;
        const d = melDate(n.createdAt);
        const gross = Number(n.totalPriceSet?.shopMoney?.amount) || 0;
        const tax = Number(n.totalTaxSet?.shopMoney?.amount) || 0;
        const rev = tax > 0 ? gross - tax : gross / 1.1;
        if (d >= weekStart && d <= todayMel) { row.revenue += rev; row.orders += 1; }
        else if (d >= prevWeekStart && d <= prevCut) { row.prevRevenue += rev; row.prevOrders += 1; }
      }
      if (!j?.data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
      cursor = edges[edges.length - 1].cursor;
    }
  }));

  const rows = [...byBrand.values()]
    .map(r => ({ ...r, revenue: Math.round(r.revenue), prevRevenue: Math.round(r.prevRevenue) }))
    .filter(r => r.revenue > 0 || r.prevRevenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const prevTotal = rows.reduce((s, r) => s + r.prevRevenue, 0);
  const orders = rows.reduce((s, r) => s + r.orders, 0);

  return NextResponse.json({
    ok: true,
    weekSoFar: {
      weekStart, today: todayMel, prevWeekStart, prevCut,
      total, prevTotal, orders,
      wowPct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
      brands: rows,
    },
  });
}
