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
      setMsg(json.message ?? (json.ok ? "Sync started" : "Couldn’t start sync"));
      // sync runs in the cloud (~1–2 min); reload later to pick up fresh data
      if (json.ok) setTimeout(() => window.location.reload(), 90_000);
    } catch {
      setMsg("Error — try again");
    } finally {
      setSyncing(false);
    }
  }

  const timeStr = lastSync?.finished_at
    ? new Date(lastSync.finished_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "short", timeStyle: "short" })
    : "Never";

  return (
    <div className="flex items-center gap-3 text-sm text-gray-500">
      <span>Last sync: {timeStr} AEST</span>
      {isAdmin && (
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {syncing ? "Starting…" : "↻ Sync Now"}
        </button>
      )}
      {msg && <span className="text-xs text-indigo-600">{msg}</span>}
    </div>
  );
}
