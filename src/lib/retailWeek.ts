// AU retail fiscal week (the numbering Baby Bunting quotes everything in —
// "week 14" not a calendar date). Retail fiscal years run Monday-Sunday
// starting the Monday nearest 30 June. Week 1 pinned from Mel confirming
// "we're in week 14" on Monday 28 Sep 2026 -> week 1 started Mon 29 Jun 2026.
// If Baby Bunting's own numbering ever drifts from this, move the anchor.
const WEEK1_Y = 2026, WEEK1_M = 5, WEEK1_D = 29; // 29 Jun 2026 — Monday, week 1

// Calendar-day math via UTC-normalised dates, not raw ms division — the
// AU daylight-saving switch (first Sunday of Oct/Apr) makes some local
// days 23 or 25 hours long, which threw the week number off by one for
// any date on or after that transition if you diff local-time ms directly.
const toUTCDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;

export function retailWeek(date: Date = new Date()): { week: number; start: Date; end: Date } {
  const anchorDay = Date.UTC(WEEK1_Y, WEEK1_M, WEEK1_D) / 864e5;
  const weekIndex = Math.floor((toUTCDay(date) - anchorDay) / 7);
  const start = new Date(WEEK1_Y, WEEK1_M, WEEK1_D + weekIndex * 7);
  const end = new Date(WEEK1_Y, WEEK1_M, WEEK1_D + weekIndex * 7 + 6);
  return { week: weekIndex + 1, start, end };
}
