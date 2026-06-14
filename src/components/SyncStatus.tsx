"use client";

import { useState } from "react";

export function SyncStatus({ lastSync }: { lastSync: { finished_at: string | null; triggered_by: string } | null }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  async function triggerSync() {
    setSyncing(true);
    setMsg("Syncing…");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      setMsg(json.message ?? "Done");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setMsg("Error — check logs");
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
      <button
        onClick={triggerSync}
        disabled={syncing}
        className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        {syncing ? "Syncing…" : "↻ Sync Now"}
      </button>
      {msg && <span className="text-xs text-indigo-600">{msg}</span>}
    </div>
  );
}
