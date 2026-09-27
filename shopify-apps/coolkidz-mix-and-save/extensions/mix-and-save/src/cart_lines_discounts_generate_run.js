// Coolkidz mix-and-save.
// The saving is set by how many DIFFERENT brands are in the cart, not by the
// amount spent: 2 brands 5%, 3 brands 10%, 4 or more 15%. The tiers can be
// changed without redeploying via the discount's metafield
// ($app:mix-and-save / tiers), e.g. {"2":5,"3":10,"4":15}.

const DEFAULT_TIERS = { 2: 5, 3: 10, 4: 15 };

// "UPPAbaby" and "UPPAbaby Australia", "WonderFold" and "WonderFold Wagons
// Australia" are the same brand. "Coolkidz Australia" (the store's own
// accessories) doesn't count as a brand.
export function brandOf(vendor) {
  const v = String(vendor || "").trim().toLowerCase().replace(/( wagons)? australia$/, "").trim();
  return v === "coolkidz" ? "" : v;
}

export function percentFor(brandCount, tiers) {
  const t = { ...DEFAULT_TIERS, ...(tiers || {}) };
  const steps = Object.keys(t).map(Number).filter(n => n > 1).sort((a, b) => a - b);
  let pct = 0;
  for (const n of steps) if (brandCount >= n) pct = Number(t[n]) || 0;
  return pct;
}

export function cartLinesDiscountsGenerateRun(input) {
  const empty = { operations: [] };
  if (!input.discount.discountClasses.includes("ORDER")) return empty;

  const brands = new Set();
  for (const line of input.cart.lines) {
    const m = line.merchandise;
    if (!m || m.__typename !== "ProductVariant" || m.product.isGiftCard) continue;
    const b = brandOf(m.product.vendor);
    if (b) brands.add(b);
  }
  const pct = percentFor(brands.size, input.discount.metafield?.jsonValue);
  if (pct <= 0) return empty;

  return {
    operations: [{
      orderDiscountsAdd: {
        candidates: [{
          message: `Mix and save: ${brands.size} brands, ${pct}% off`,
          targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
          value: { percentage: { value: pct } },
        }],
        selectionStrategy: "FIRST",
      },
    }],
  };
}
