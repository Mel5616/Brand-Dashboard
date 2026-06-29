"use client";

import { useState } from "react";

export function SyncStatus({ lastSync, isAdmin = true }: { lastSync: { finished_at: string | null; triggered_by: string } | null; isAdmin?: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  async function triggerSync() {
    setSyncing(true);
    setMsg("Starting…");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        // Sync runs in the cloud (~1–2 min). Keep the spinner going, then reload.
        setMsg("Syncing… ~1–2 min");
        setTimeout(() => window.location.reload(), 90_000);
      } else {
        setMsg(json.message ?? "Couldn’t start sync");
        setSyncing(false);
      }
    } catch {
      setMsg("Error — try again");
      setSyncing(false);
    }
  }

  const timeStr = lastSync?.finished_at
    ? new Date(lastSync.finished_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "short", timeStyle: "short" })
    : "Never";

  const RefreshIcon = (
    <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0A8.003 8.003 0 015.064 15m14.355 0H15" />
    </svg>
  );

  return (
    <div className="px-2 pb-3">
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-400">{syncing ? "Syncing" : "Last sync"}</p>
          <p className="text-[11px] text-gray-500 truncate">{syncing ? (msg || "in progress…") : `${timeStr} AEST`}</p>
        </div>
        {isAdmin && (
          <button onClick={triggerSync} disabled={syncing} title="Sync now"
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-60">
            {RefreshIcon}{!syncing && "Sync"}
          </button>
        )}
      </div>
    </div>
  );
}
