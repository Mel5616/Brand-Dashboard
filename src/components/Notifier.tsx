"use client";

import { useEffect, useRef, useState } from "react";

// In-dashboard toast notifications: new design tasks, published blog posts and
// influencer gifts. Polls /api/notifications every 90s; per-browser last-seen
// watermark + seen-id list in localStorage so nothing repeats and a fresh
// browser doesn't get flooded with history.
type Ev = { id: string; kind: "design" | "blog" | "influencer"; tab: string; title: string; sub: string; at: string };

const ICON: Record<Ev["kind"], string> = { design: "🎨", blog: "📝", influencer: "🤝" };
const RING: Record<Ev["kind"], string> = { design: "border-pink-200", blog: "border-cyan-200", influencer: "border-violet-200" };

export function Notifier({ go }: { go: (tab: string) => void }) {
  const [toasts, setToasts] = useState<Ev[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      seen.current = new Set(JSON.parse(localStorage.getItem("notifySeen") || "[]"));
      if (!localStorage.getItem("notifyLastSeen")) localStorage.setItem("notifyLastSeen", new Date().toISOString());
    } catch { /* ignore */ }

    let stop = false;
    async function poll() {
      try {
        const d = await fetch("/api/notifications").then(r => r.json());
        if (stop || !d?.ok) return;
        const lastSeen = localStorage.getItem("notifyLastSeen") || new Date().toISOString();
        const fresh: Ev[] = (d.events ?? []).filter((e: Ev) => e.at > lastSeen && !seen.current.has(e.id)).slice(0, 4);
        if (fresh.length) {
          fresh.forEach(e => seen.current.add(e.id));
          try {
            localStorage.setItem("notifySeen", JSON.stringify([...seen.current].slice(-300)));
            localStorage.setItem("notifyLastSeen", new Date().toISOString());
          } catch { /* ignore */ }
          setToasts(t => [...t, ...fresh].slice(-4));
          fresh.forEach(e => setTimeout(() => setToasts(t => t.filter(x => x.id !== e.id)), 9000));
        } else {
          // advance the watermark so long-idle tabs don't replay old events
          try { localStorage.setItem("notifyLastSeen", new Date().toISOString()); } catch { /* ignore */ }
        }
      } catch { /* network blip — next poll */ }
    }
    poll();
    const t = setInterval(poll, 90_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 w-[320px] max-w-[calc(100vw-2rem)]">
      {toasts.map(e => (
        <button key={e.id}
          onClick={() => { go(e.tab); setToasts(t => t.filter(x => x.id !== e.id)); }}
          className={`w-full text-left bg-white rounded-xl border-2 ${RING[e.kind]} shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 hover:shadow-xl transition-shadow animate-[slideIn_.25s_ease-out]`}>
          <span className="text-[18px] leading-none mt-0.5">{ICON[e.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-slate-800 truncate">{e.title}</span>
            <span className="block text-[11.5px] text-gray-400 truncate">{e.sub} · click to open</span>
          </span>
          <span onClick={ev => { ev.stopPropagation(); setToasts(t => t.filter(x => x.id !== e.id)); }}
            className="text-gray-300 hover:text-gray-500 text-sm leading-none mt-0.5 cursor-pointer">✕</span>
        </button>
      ))}
      <style jsx>{`@keyframes slideIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
    </div>
  );
}
