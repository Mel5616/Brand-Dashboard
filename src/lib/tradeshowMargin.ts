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
