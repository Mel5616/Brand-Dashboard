"use client";

import { useEffect, useState } from "react";

// Combined Klaviyo database size (Lifecycle Flows tab, above the flow grid).
// Reads klaviyo_metrics.list_size per brand — already synced monthly from
// each brand's own Klaviyo account — and adds them up. Not a live Klaviyo
// call, so it's instant; see src/app/api/klaviyo/database-size/route.ts for
// exactly what "combined" means here (summed, not deduplicated).
type BrandRow = { brand_id: number; name: string; live: boolean; list_size: number; month_key: string };

const fmt = (n: number) => n.toLocaleString("en-AU");
const monthLabel = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
};

export function DatabaseSizeCard() {
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/klaviyo/database-size").then(r => r.json()).then(res => {
      if (!res.ok) return;
      setNeedsSetup(!!res.needsSetup);
      setTotal(res.total ?? 0);
      setRows(res.brands ?? []);
    }).catch(() => {});
  }, []);

  if (needsSetup || total === null) return null;

  // Every brand currently reads 0: none has an "Active Subscribers" segment
  // in Klaviyo yet for sync_klaviyo.py to find (see its get_subscriber_count
  // comment). Say so plainly instead of showing a bare, misleading "0".
  if (total === 0) {
    return (
      <div className="bg-amber-50 rounded-2xl border border-amber-100 px-5 py-4 mb-5">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest">Combined Klaviyo Database</p>
        <p className="text-sm text-amber-800 mt-1">
          Reading as 0 across all {rows.length} brands — none currently has an "Active Subscribers" segment in Klaviyo for the sync to find.
          Create that segment in each brand's Klaviyo account and this fills in on the next sync.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/60 transition-colors">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Combined Klaviyo Database</p>
          <p className="text-2xl font-bold text-slate-800 mt-0.5">{fmt(total)} <span className="text-sm font-medium text-gray-400">people, across {rows.length} brands</span></p>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? "Hide breakdown ▲" : "Show breakdown ▼"}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-50 divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.brand_id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className={r.live ? "text-slate-700 font-medium" : "text-gray-400"}>{r.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">as of {monthLabel(r.month_key)}</span>
                <span className="font-semibold text-slate-700 tabular-nums">{fmt(r.list_size)}</span>
              </span>
            </div>
          ))}
          <p className="px-5 py-2.5 text-[11px] text-gray-400 bg-gray-50/50">
            Each brand's "Active Subscribers" segment size in Klaviyo, summed. Someone subscribed to more than one brand is counted once per brand, so this is a combined total, not a deduplicated unique-person count.
          </p>
        </div>
      )}
    </div>
  );
}
