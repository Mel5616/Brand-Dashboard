// Shared "true revenue" / COGS-matching logic for tradeshow reporting —
// used by both the per-show breakdown API and the cross-show Show Insights
// API so the two never disagree on what counts as a confident cost match.
//
// COGS comes from Cin7 (scripts/sync_cin7_costs.py) — the real, per-show
// landed unit cost Cin7 recorded when the actual stock for that show's sales
// was dispatched, keyed by exact SKU (Cin7's SKU matches Shopify's exactly,
// no prefix/colourway bridging needed the way the old Cost-Sheet matching
// required). Cost is scoped PER SHOW, not a single global per-SKU number,
// because Cin7 tracks FIFO-consumed batch cost, which genuinely moves as
// stock batches turn over.

export type ProductRow = { bucket: string; product: string; revenue: number | string; units: number | string; sku: string | null };
export type Cin7CostRow = { tradeshow_id: string; sku: string; unit_cost: number | string; qty: number | string };

export function buildShowCostMaps(rows: Cin7CostRow[]): Map<string, Map<string, number>> {
  const byShow = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const cost = Number(r.unit_cost);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    const sku = String(r.sku).trim().toUpperCase();
    if (!sku) continue;
    const m = byShow.get(r.tradeshow_id) ?? new Map<string, number>();
    m.set(sku, cost);
    byShow.set(r.tradeshow_id, m);
  }
  return byShow;
}

export type Margin = { knownRevenue: number; knownCost: number; knownMargin: number; coveragePct: number; note: string };
export type UnmatchedProduct = { product: string; bucket: string; sku: string | null; revenue: number; units: number; reason: string };
export type Cin7ShowTotal = { tradeshow_id: string; total_cogs: number | string; matched_orders: number | string; total_orders: number | string };

// The AUTHORITATIVE margin source when Cin7 order-matching has run for this
// show: total_cogs is summed directly from every matched dispatched Cin7
// order's line items (scripts/sync_cin7_costs.py), not re-derived by joining
// SKUs against tradeshow_products — that join silently loses ~11% of
// coverage on bundled/demo/no-SKU product lines (Mesa Capsule, ex-demo floor
// stock, "Custom sale") that Cin7 still has a real per-unit cost for at the
// order-line level. Verified against a real Cin7-native COGS export
// (28 Aug 2026): this landed within ~1% of Cin7's own report, vs. ~15% low
// via the SKU-join path (computeMargin below, kept as a fallback for shows
// Cin7 order-matching hasn't run for yet).
export function marginFromShowTotal(revenue: number, total: Cin7ShowTotal): Margin | null {
  if (revenue <= 0) return null;
  const matchedOrders = Number(total.matched_orders) || 0;
  const totalOrders = Number(total.total_orders) || 0;
  const orderCoverage = totalOrders > 0 ? matchedOrders / totalOrders : 0;
  const knownRevenue = Math.round(revenue * orderCoverage);
  const knownCost = Math.round(Number(total.total_cogs) || 0);
  return {
    knownRevenue, knownCost, knownMargin: knownRevenue - knownCost,
    coveragePct: Math.round(orderCoverage * 100),
    note: `Gross margin after cost of goods — real landed cost summed directly from Cin7's dispatched orders for this show (${matchedOrders} of ${totalOrders} identified orders matched a Cin7 sales order).`,
  };
}

export function computeMargin(products: ProductRow[], showCosts: Map<string, number> | undefined): Margin | null {
  let knownRevenue = 0, knownCost = 0, allRevenue = 0;
  for (const p of products) {
    const rev = Number(p.revenue) || 0;
    allRevenue += rev;
    const sku = p.sku ? String(p.sku).trim().toUpperCase() : null;
    if (!sku) continue;
    const cost = showCosts?.get(sku);
    if (cost == null) continue;
    knownRevenue += rev;
    knownCost += cost * (Number(p.units) || 0);
  }
  if (allRevenue <= 0) return null;
  return {
    knownRevenue: Math.round(knownRevenue), knownCost: Math.round(knownCost), knownMargin: Math.round(knownRevenue - knownCost),
    coveragePct: Math.round((knownRevenue / allRevenue) * 100),
    note: "Gross margin after cost of goods — real landed cost from Cin7's actual dispatched orders for this show, matched by exact SKU; a product with no dispatched-order match is excluded from this figure (not assumed zero-cost), so coverage % shows how much of revenue it actually reflects.",
  };
}

// Every product line that did NOT count toward "known" COGS, with why —
// so a real person can see the gap instead of just a coverage percentage.
// Ranked by revenue (highest-impact gaps first).
export function findUnmatched(products: ProductRow[], showCosts: Map<string, number> | undefined): UnmatchedProduct[] {
  const out: UnmatchedProduct[] = [];
  for (const p of products) {
    const rev = Number(p.revenue) || 0;
    if (rev <= 0) continue;
    const sku = p.sku ? String(p.sku).trim().toUpperCase() : null;
    let reason: string | null = null;
    if (!sku) {
      reason = "No single SKU recorded for this product line (sold under more than one SKU)";
    } else if (showCosts?.get(sku) == null) {
      reason = `No Cin7 dispatched order for SKU "${sku}" in this show's window`;
    }
    if (reason) out.push({ product: p.product, bucket: p.bucket, sku: p.sku, revenue: Math.round(rev), units: Number(p.units) || 0, reason });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}
