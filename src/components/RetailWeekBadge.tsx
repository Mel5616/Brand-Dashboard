"use client";

import { retailWeek } from "@/lib/retailWeek";

// Small "what week is it" badge for Baby Bunting quoting — they talk in
// retail fiscal weeks, not calendar dates, so this needs to stay visible
// wherever the team is looking at dates.
export function RetailWeekBadge() {
  const { week, start, end } = retailWeek();
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return (
    <span title="Retail fiscal week — Baby Bunting quotes in these" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Week {week} <span className="text-slate-400 font-normal">· {fmt(start)}–{fmt(end)}</span>
    </span>
  );
}
