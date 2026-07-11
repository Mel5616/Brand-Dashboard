// Full-year revenue forecast for the Australian FY (Jul–Jun).
//
// Method — "seasonal shape × current pace":
//   * Last FY's monthly revenue gives the SHAPE (Christmas peak, expo months, quiet
//     months). A flat run-rate throws all of that away.
//   * A growth factor scales that shape to this year's level:
//       - once ≥1 month has closed this FY: same-period YoY (completed months this
//         FY ÷ the same months last FY) — solid.
//       - before any month closes: the current month's pace vs last year's same
//         month — noisy, so it's clamped and the confidence band is wide.
//   * The band is honest: money already banked has zero error; only the remaining
//     forecast carries uncertainty, and that uncertainty shrinks as the year fills in.
//
// Deliberately NOT ML — one year of history can't support a trained seasonal model
// without overfitting. This is the smartest method the data actually justifies.

export type ForecastResult = {
  monthKeys: string[];              // 12 current-FY keys, Jul → Jun
  labels: string[];                 // "Jul", "Aug", …
  monthlyActual: (number | null)[]; // per-month actual (null for not-yet-happened months)
  monthlyForecast: number[];        // per-month best estimate (actual where known)
  monthlyLastFY: number[];          // prior FY, same month positions
  cumActual: (number | null)[];     // cumulative actual, null once the future starts
  cumForecast: (number | null)[];   // cumulative forecast (dashed line), null in the past
  cumTarget: number[] | null;       // cumulative target, if targets supplied
  cumLastFY: number[];              // cumulative prior FY
  full: number;                     // full-year forecast
  low: number; high: number;        // confidence band on the full-year number
  bankedToDate: number;             // revenue already earned this FY
  target: number | null;
  pacePct: number | null;           // full ÷ target × 100
  growth: number;                   // applied growth vs last FY
  elapsedFraction: number;          // how much of the FY is done (0–1)
  hasLastFY: boolean;               // false → falls back to a flat run-rate
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function fyStartYear(d: Date): number {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; // month is 0-indexed; 6 = July
}
function fyMonthKeys(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = 7 + i, y = startYear + Math.floor((m - 1) / 12), mm = ((m - 1) % 12) + 1;
    return `${y}-${String(mm).padStart(2, "0")}`;
  });
}

export function forecastFY(
  series: Record<string, number>,
  targetsMonthly: Record<string, number> | null,
  now: Date = new Date(),
): ForecastResult {
  const startY = fyStartYear(now);
  const monthKeys = fyMonthKeys(startY);
  const priorKeys = fyMonthKeys(startY - 1);
  const labels = monthKeys.map(k => new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short" }));

  const cur = (k: string) => Number(series[k] || 0);
  const prior = (k: string) => Number(series[priorKeys[monthKeys.indexOf(k)]] || 0);
  const monthlyLastFY = monthKeys.map((_, i) => Number(series[priorKeys[i]] || 0));
  const hasLastFY = monthlyLastFY.some(v => v > 0);

  const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curIdx = monthKeys.indexOf(curMonthKey);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFrac = dayOfMonth / daysInMonth;

  // Completed months this FY = strictly before the current month (or the whole FY if
  // "now" is past FY end / before it starts).
  const completedIdx = monthKeys.map((_, i) => i).filter(i =>
    curIdx === -1 ? monthKeys[i] < curMonthKey : i < curIdx);

  // Current-month projection (flat pro-rate — no prior-year daily to shape it).
  const curActualMTD = curIdx >= 0 ? cur(curMonthKey) : 0;
  const curProjected = curIdx >= 0 && monthFrac > 0 ? curActualMTD / monthFrac : curActualMTD;

  // Growth factor, shrunk toward 1 (= "same as last year") by how much evidence we
  // actually have. A 10-day pro-rate must NOT swing the whole year; a closed quarter
  // should. So: growth = 1 + (raw − 1) × credibility.
  let growth = 1;
  const completedActual = completedIdx.reduce((s, i) => s + cur(monthKeys[i]), 0);
  const completedPrior = completedIdx.reduce((s, i) => s + monthlyLastFY[i], 0);
  if (hasLastFY) {
    let raw = 1, credibility = 0;
    if (completedPrior > 0) {
      raw = completedActual / completedPrior;              // clean same-period YoY
      credibility = clamp(completedIdx.length / 3, 0, 1);  // 3 closed months → full trust
    } else if (curIdx >= 0 && prior(curMonthKey) > 0 && curProjected > 0) {
      raw = curProjected / prior(curMonthKey);             // early-FY pace, barely trusted
      credibility = clamp(monthFrac * 0.5, 0, 0.5);        // a full open month → 0.5 trust
    }
    growth = clamp(1 + (clamp(raw, 0.5, 2.0) - 1) * credibility, 0.5, 2.0);
  }

  // Build the monthly forecast series.
  const monthlyForecast = monthKeys.map((k, i) => {
    if (curIdx === -1) return monthlyLastFY[i] * growth;           // whole FY is future/past
    if (i < curIdx) return cur(k);                                 // completed → actual
    if (i === curIdx) return Math.max(curActualMTD, hasLastFY ? prior(k) * growth : curProjected);
    return hasLastFY ? monthlyLastFY[i] * growth : (completedIdx.length ? completedActual / completedIdx.length : curProjected);
  });

  const monthlyActual = monthKeys.map((k, i) =>
    curIdx === -1 ? (monthKeys[i] < curMonthKey ? cur(k) : null)
    : i < curIdx ? cur(k)
    : i === curIdx ? curActualMTD
    : null);

  const bankedToDate = completedIdx.reduce((s, i) => s + cur(monthKeys[i]), 0) + curActualMTD;
  const full = monthlyForecast.reduce((s, v) => s + v, 0);
  const remaining = Math.max(0, full - bankedToDate);

  // Cumulatives
  let a = 0, f = 0, t = 0, l = 0;
  const cumActual: (number | null)[] = [], cumForecast: (number | null)[] = [], cumLastFY: number[] = [];
  const cumTargetArr: number[] = [];
  monthKeys.forEach((k, i) => {
    l += monthlyLastFY[i]; cumLastFY.push(Math.round(l));
    if (targetsMonthly) { t += Number(targetsMonthly[k] || 0); cumTargetArr.push(Math.round(t)); }
    const isPastOrCur = curIdx === -1 ? monthKeys[i] <= (completedIdx.length ? monthKeys[completedIdx[completedIdx.length - 1]] : "") : i <= curIdx;
    if (isPastOrCur) { a += (monthlyActual[i] ?? 0); cumActual.push(Math.round(a)); }
    else cumActual.push(null);
    // Full 12-point forecast line (equals actual for closed months, so the solid
    // "actual" line overlays it exactly, then the dashed forecast continues).
    f += monthlyForecast[i];
    cumForecast.push(Math.round(f));
  });

  const target = targetsMonthly ? cumTargetArr[cumTargetArr.length - 1] : null;
  const elapsedFraction = clamp((completedIdx.length + (curIdx >= 0 ? monthFrac : 0)) / 12, 0, 1);
  // Uncertainty applies only to the un-banked remainder, and narrows as the FY fills in.
  const spread = 0.03 + 0.20 * (1 - elapsedFraction);
  const low = Math.round(bankedToDate + remaining * (1 - spread));
  const high = Math.round(bankedToDate + remaining * (1 + spread));

  return {
    monthKeys, labels,
    monthlyActual, monthlyForecast, monthlyLastFY,
    cumActual, cumForecast, cumTarget: targetsMonthly ? cumTargetArr : null, cumLastFY,
    full: Math.round(full), low, high, bankedToDate: Math.round(bankedToDate),
    target, pacePct: target && target > 0 ? (full / target) * 100 : null,
    growth, elapsedFraction, hasLastFY,
  };
}
