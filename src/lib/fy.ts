// Central financial-year definitions. A FY runs 1 Jul → 30 Jun and is keyed by
// its starting calendar year (e.g. "2025-26" = Jul 2025 → Jun 2026).

export type FY = "2025-26" | "2026-27";

export const FY_LIST: FY[] = ["2025-26", "2026-27"];

export const FY_LABEL: Record<FY, string> = {
  "2025-26": "FY 2025–26",
  "2026-27": "FY 2026–27",
};

const FY_START_YEAR: Record<FY, number> = {
  "2025-26": 2025,
  "2026-27": 2026,
};

/** 12 month keys (YYYY-MM) for the FY, Jul → Jun. */
export function fyMonthKeys(fy: FY): string[] {
  const y = FY_START_YEAR[fy];
  const keys: string[] = [];
  for (let m = 7; m <= 12; m++) keys.push(`${y}-${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 6; m++) keys.push(`${y + 1}-${String(m).padStart(2, "0")}`);
  return keys;
}

/** Short labels matching fyMonthKeys order, e.g. "Jul 25". */
export function fyMonthLabels(fy: FY): string[] {
  return fyMonthKeys(fy).map(k => {
    const [yy, mm] = k.split("-");
    const d = new Date(Number(yy), Number(mm) - 1, 1);
    return `${d.toLocaleDateString("en-AU", { month: "short" })} ${yy.slice(2)}`;
  });
}

/** The FY that contains a given date (defaults to today). */
export function currentFY(today: Date = new Date()): FY {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return startYear >= 2026 ? "2026-27" : "2025-26";
}

/**
 * The "current" month within a FY for headline KPIs: the most recent month
 * that actually has data; otherwise the latest month ≤ today; otherwise the
 * FY's first month. Pass the month_keys present in your dataset.
 */
export function fyLatestMonth(fy: FY, presentKeys: string[] = []): string {
  const keys = fyMonthKeys(fy);
  const inData = keys.filter(k => presentKeys.includes(k));
  if (inData.length) return inData[inData.length - 1];
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const past = keys.filter(k => k <= cur);
  return past.length ? past[past.length - 1] : keys[0];
}

export function fyPrevMonth(fy: FY, latest: string): string {
  const keys = fyMonthKeys(fy);
  const i = keys.indexOf(latest);
  return i > 0 ? keys[i - 1] : keys[0];
}

/** Human label for a month key, e.g. "May 26". */
export function monthLabel(key: string): string {
  const [yy, mm] = key.split("-");
  const d = new Date(Number(yy), Number(mm) - 1, 1);
  return `${d.toLocaleDateString("en-AU", { month: "short" })} ${yy.slice(2)}`;
}
