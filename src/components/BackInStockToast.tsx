"use client";

import { useEffect, useState } from "react";

// Pop-up on every dashboard page for users with Stock Report access: items
// removed from the Asana Stock Report board are back in stock. Dismissed
// alerts are remembered per-browser (localStorage), so each user sees each
// item once.
type StockAlert = { gid: string; name: string; section: string | null; detected_at: string };

const LS_KEY = "stockAlertsSeen";

export function BackInStockToast() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);

  useEffect(() => {
    fetch("/api/stock-alerts").then(r => r.json()).then(d => {
      if (!d.ok || !d.alerts?.length) return;
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { /* noop */ }
      setAlerts((d.alerts as StockAlert[]).filter(a => !seen.includes(a.gid)).slice(0, 5));
    }).catch(() => {});
  }, []);

  if (!alerts.length) return null;

  const dismiss = (gid: string) => {
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify([...new Set([...seen, gid])].slice(-300)));
    } catch { /* noop */ }
    setAlerts(p => p.filter(a => a.gid !== gid));
  };

  return (
    <div className="fixed bottom-24 right-4 z-[95] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]">
      {alerts.map(a => (
        <div key={a.gid} className="bg-white rounded-xl shadow-lg ring-1 ring-emerald-200 px-4 py-3 flex items-start gap-3 animate-[slideIn_.3s_ease-out]">
          <span className="text-xl leading-none mt-0.5">📦</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">Back in stock</p>
            <p className="text-sm font-semibold text-slate-800 leading-snug">{a.name}</p>
            {a.section && <p className="text-[11px] text-slate-400 mt-0.5">{a.section} · removed from the stock report</p>}
          </div>
          <button onClick={() => dismiss(a.gid)} className="text-slate-300 hover:text-slate-500 text-sm font-bold shrink-0" aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
