"use client";

import { useEffect } from "react";

// Logs the open, then heartbeats +10s while the tab is actually visible —
// so "time viewed" means time genuinely on screen, not tab-left-open.
export function DeckTracker({ token }: { token: string }) {
  useEffect(() => {
    let session = "";
    try {
      session = sessionStorage.getItem("deckSession") || crypto.randomUUID();
      sessionStorage.setItem("deckSession", session);
    } catch { session = crypto.randomUUID(); }
    const post = (body: any) => fetch("/api/decks/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, session, ...body }), keepalive: true,
    }).catch(() => {});
    post({ kind: "open" });
    const t = setInterval(() => { if (document.visibilityState === "visible") post({ kind: "beat", seconds: 10 }); }, 10_000);
    return () => clearInterval(t);
  }, [token]);
  return null;
}
