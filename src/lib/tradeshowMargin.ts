// Shared "true revenue" / COGS-matching logic for tradeshow reporting —
// used by both the per-show breakdown API and the cross-show Show Insights
// API so the two never disagree on what counts as a confident cost match.
//
// Cost Sheet codes are per MODEL ("UPV3"), not per colourway — Shopify SKUs
// are per-colourway ("UPV3JM") — so this matches by longest style_code
// PREFIX of the SKU, not an exact string. A style_code reused for two
// different costs within a brand is excluded rather than picked arbitrarily,
// and a product with no matched SKU just doesn't count toward "known" — it's
// a coverage gap, not an assumed $0 cost.

export type CostRow = { brand: string; product_name: string; style_code: string; landed_cost_aud: number | string };
export type ProductRow = { bucket: string; product: string; revenue: number | string; units: number | string; sku: string | null };

export function buildCostByBrand(costRows: CostRow[]): Map<string, Map<string, number | null>> {
  const costGroups = new Map<string, { name: string; cost: number }[]>(); // "brand|code" -> rows
  for (const r of costRows) {
    const code = String(r.style_code).trim().toUpperCase();
    const cost = Number(r.landed_cost_aud);
    if (!Number.isFinite(cost) || cost <= 0 || code.length < 3) continue;
    const key = `${r.brand}|${code}`;
    const list = costGroups.get(key) ?? [];
    list.push({ name: String(r.product_name || ""), cost });
    costGroups.set(key, list);
  }
  const costByBrand = new Map<string, Map<string, number | null>>();
  for (const [key, rows] of costGroups) {
    const [brand, code] = key.split("|");
    const base = rows.filter(r => !/reprice/i.test(r.name));
    const pool = base.length ? base : rows;
    const distinct = [...new Set(pool.map(r => r.cost))];
    const resolved = distinct.length === 1 ? distinct[0] : null;
    const m = costByBrand.get(brand) ?? new Map<string, number | null>();
    m.set(code, resolved);
    costByBrand.set(brand, m);
  }
  return costByBrand;
}

// Cross-brand accessories (seat protectors, etc.) live on their own
// "Coolkidz" Cost Sheet tab regardless of which brand's booth sold them —
// fall back to that pool when the selling brand's own sheet has no match.
export function findCost(costByBrand: Map<string, Map<string, number | null>>, brand: string, sku: string): number | null {
  for (const pool of [costByBrand.get(brand), costByBrand.get("Coolkidz")]) {
    if (!pool) continue;
    let best: { code: string; cost: number | null } | null = null;
    for (const [code, cost] of pool) {
      if (sku.startsWith(code) && (!best || code.length > best.code.length)) best = { code, cost };
    }
    if (best) return best.cost;
  }
  return null;
}

export const bucketBrand = (bucket: string) => (bucket === "QR" ? "UPPAbaby" : bucket);

export type Margin = { knownRevenue: number; knownCost: number; knownMargin: number; coveragePct: number; note: string };

export function computeMargin(products: ProductRow[], costByBrand: Map<string, Map<string, number | null>>): Margin | null {
  let knownRevenue = 0, knownCost = 0, allRevenue = 0;
  for (const p of products) {
    const rev = Number(p.revenue) || 0;
    allRevenue += rev;
    if (!p.sku) continue;
    const cost = findCost(costByBrand, bucketBrand(p.bucket), String(p.sku).trim().toUpperCase());
    if (cost == null) continue;
    knownRevenue += rev;
    knownCost += cost * (Number(p.units) || 0);
  }
  if (allRevenue <= 0) return null;
  return {
    knownRevenue: Math.round(knownRevenue), knownCost: Math.round(knownCost), knownMargin: Math.round(knownRevenue - knownCost),
    coveragePct: Math.round((knownRevenue / allRevenue) * 100),
    note: "Gross margin after cost of goods — only for products with a confident SKU match to the Cost Sheet; everything else is excluded from this figure (not assumed zero-cost), so coverage % shows how much of revenue it actually reflects.",
  };
}
