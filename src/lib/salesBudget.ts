import type { SalesBudgetRow } from "./db";

// Budget-sheet channel name -> the channel name buildChannels produces for live actuals.
// Hatch Baby is the NZ business; The Memo / Online Wholesale keep their own names (they
// pace once those sales report under a matching live channel).
export const BUDGET_TO_ACTUAL: Record<string, string> = {
  "Direct / Website": "Website Sales", "Wholesale": "Wholesale", "Baby Bunting": "Baby Bunting",
  "Amazon": "Amazon", "MarketPlace": "Marketplace", "Affiliate": "Affiliates",
  "Partnerships": "Partnerships", "Specialty": "Specialty", "The Memo": "The Memo",
  "Hatch Baby": "New Zealand", "Online Wholesale": "Online Wholesale",
};

// Roll the channel budget up by the ACTUAL channel name, per month, for a scope.
// Returns monthly target arrays (aligned to monthKeys) and the prior-year actual.
export function budgetByActualChannel(salesBudget: SalesBudgetRow[], scope: number | "all", monthKeys: string[]) {
  const target: Record<string, number[]> = {};
  const fy26: Record<string, number> = {};
  const seen = new Set<string>();
  for (const r of salesBudget) {
    if (scope !== "all" && r.brand_id !== scope) continue;
    const name = BUDGET_TO_ACTUAL[r.channel] ?? r.channel;
    (target[name] ??= monthKeys.map(() => 0));
    const i = monthKeys.indexOf(r.month_key);
    if (i >= 0) target[name][i] += r.target || 0;
    const k = `${r.brand_id}|${r.channel}`;
    if (!seen.has(k)) { seen.add(k); fy26[name] = (fy26[name] ?? 0) + (r.fy26_actual || 0); }
  }
  return { target, fy26 };
}
