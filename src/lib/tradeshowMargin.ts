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

// Some product families cost the same regardless of colourway, but Shopify's
// SKU (and therefore the sync's recorded product sku) is per-colour — so no
// prefix match against a single Cost Sheet style_code can bridge them (the
// colour codes don't share a usable common prefix). These overrides, given
// directly by Mel, force every colour of a family onto one agreed style_code
// for cost-matching purposes only — the real per-colour SKU is untouched
// everywhere else (sales figures, product lists, etc.).
const TITLE_SKU_OVERRIDES: { brand: string; match: RegExp | null; code: string }[] = [
  { brand: "Hannie", match: null, code: "HANPHSG" },              // whole brand is one costed line
  { brand: "Magic", match: /thoth xl/i, code: "MG-TNBXL-B" },
  { brand: "Magic", match: /heka l\b/i, code: "MG-HNBXL-B" },     // not "Heka M" / "Heka - Bathroom Lid"
  { brand: "Magic", match: /majestic/i, code: "MG-MNB-B" },
  { brand: "UPPAbaby", match: /rumbleseat/i, code: "UPR3NO" },
  // Ex-demo floor stock sold off at a show ("Vista liam demo taken") never
  // carried a normal colour SKU — cost at the base model rate.
  { brand: "UPPAbaby", match: /vista.*demo/i, code: "UPV3" },
  { brand: "UPPAbaby", match: /cruz.*demo/i, code: "UPC3" },
];

function effectiveSku(brand: string, title: string, sku: string | null): string | null {
  for (const o of TITLE_SKU_OVERRIDES) {
    if (o.brand === brand && (o.match == null || o.match.test(title))) return o.code;
  }
  return sku ? String(sku).trim().toUpperCase() : null;
}

export type Margin = { knownRevenue: number; knownCost: number; knownMargin: number; coveragePct: number; note: string };
export type UnmatchedProduct = { product: string; bucket: string; sku: string | null; revenue: number; units: number; reason: string };

export function computeMargin(products: ProductRow[], costByBrand: Map<string, Map<string, number | null>>): Margin | null {
  let knownRevenue = 0, knownCost = 0, allRevenue = 0;
  for (const p of products) {
    const rev = Number(p.revenue) || 0;
    allRevenue += rev;
    const brand = bucketBrand(p.bucket);
    const sku = effectiveSku(brand, p.product, p.sku);
    if (!sku) continue;
    const cost = findCost(costByBrand, brand, sku);
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

// Every product line that did NOT count toward "known" COGS, with why —
// so a real person can go fix the Cost Sheet instead of just seeing a
// coverage percentage. Ranked by revenue (highest-impact gaps first).
export function findUnmatched(products: ProductRow[], costByBrand: Map<string, Map<string, number | null>>): UnmatchedProduct[] {
  const out: UnmatchedProduct[] = [];
  for (const p of products) {
    const rev = Number(p.revenue) || 0;
    if (rev <= 0) continue;
    const brand = bucketBrand(p.bucket);
    let reason: string | null = null;
    const sku = effectiveSku(brand, p.product, p.sku);
    if (!sku) {
      reason = "No single SKU recorded for this product line (sold under more than one SKU)";
    } else {
      const cost = findCost(costByBrand, brand, sku);
      if (cost == null) {
        const hasAnyPrefixMatch = [costByBrand.get(brand), costByBrand.get("Coolkidz")]
          .filter((m): m is Map<string, number | null> => !!m)
          .some(pool => [...pool.keys()].some(code => sku.startsWith(code)));
        reason = hasAnyPrefixMatch
          ? "Style code matched, but has conflicting costs in the Cost Sheet"
          : `No Cost Sheet style code matches SKU "${sku}"`;
      }
    }
    if (reason) out.push({ product: p.product, bucket: p.bucket, sku: p.sku, revenue: Math.round(rev), units: Number(p.units) || 0, reason });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}
