// The financial year the influencer gifting program runs on (Jul–Jun). The budget is
// loaded for this FY, and both the team gift form and the admin tracker key off it so
// they can never drift. Bump FY_START_YEAR when the program rolls to the next FY.
const FY_START_YEAR = 2026; // FY2026-27 (Jul 2026 – Jun 2027)

export const INFLUENCER_FY_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(FY_START_YEAR, 6 + i, 1);
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    labelShort: d.toLocaleDateString("en-AU", { month: "short" }),
    label: d.toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
  };
});
export const INFLUENCER_FY_KEYS = INFLUENCER_FY_MONTHS.map(m => m.key);
export const INFLUENCER_FY_LABEL = `FY${FY_START_YEAR}–${String(FY_START_YEAR + 1).slice(2)}`;
// The `fy` value used in the marketing_budgets table, e.g. "2026-27".
export const INFLUENCER_BUDGET_FY = `${FY_START_YEAR}-${String(FY_START_YEAR + 1).slice(2)}`;
