"use client";

import { useEffect, useState } from "react";

// Always-visible header chip: when the data was last synced and whether every
// feed is healthy. Green = all good · amber = something failed or stale.
const STALE_HOURS = 26;
const OVERRIDES: Record<string, number> = { "Semrush": 8 * 24, "LTV cohorts": 33 * 24 };

export function FreshnessBadge() {
  const [state, setState] = useState<{ time: string; healthy: boolean; issues: number } | null>(null);

  useEffect(() => {
    fetch("/api/sync-status").then(r => r.json()).then(d => {
      const rows: { source: string; ok: boolean; ran_at: string }[] = d.rows ?? [];
      if (!rows.length) return;
      const latest = rows.reduce((m, r) => Math.max(m, Date.parse(r.ran_at) || 0), 0);
      const issues = rows.filter(r =>
        !r.ok || Date.now() - Date.parse(r.ran_at) > (OVERRIDES[r.source] ?? STALE_HOURS) * 3.6e6).length;
      setState({
        time: new Date(latest).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }),
        healthy: issues === 0,
        issues,
      });
    }).catch(() => {});
  }, []);

  if (!state) return null;
  return (
    <span
      title={state.healthy ? "All data feeds healthy" : `${state.issues} data feed${state.issues === 1 ? "" : "s"} need attention — see Data freshness on Business Overview`}
      className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 ${
        state.healthy ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${state.healthy ? "bg-emerald-500" : "bg-amber-500"}`} />
      Data as at {state.time}
    </span>
  );
}
