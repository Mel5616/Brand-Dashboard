"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ⌘K palette: type to jump to any tab or brand. Keyboard-first (↑/↓/↵/esc).
type Item = { kind: "tab" | "brand"; id: string; label: string; group?: string; color?: string };

export function CommandPalette({ open, onClose, tabs, brands, onPickTab, onPickBrand }: {
  open: boolean;
  onClose: () => void;
  tabs: { id: string; label: string; group?: string }[];
  brands: { id: number; name: string; color?: string }[];
  onPickTab: (id: string) => void;
  onPickBrand: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items: Item[] = useMemo(() => [
    ...tabs.map(t => ({ kind: "tab" as const, id: t.id, label: t.label, group: t.group })),
    ...brands.map(b => ({ kind: "brand" as const, id: String(b.id), label: b.name, group: "Brand", color: b.color })),
  ], [tabs, brands]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 40);
    // Rank: label startsWith beats contains; word-boundary match beats mid-word.
    const scored = items
      .map(it => {
        const l = it.label.toLowerCase();
        let score = -1;
        if (l === s) score = 100;
        else if (l.startsWith(s)) score = 80;
        else if (l.split(/\s+/).some(w => w.startsWith(s))) score = 60;
        else if (l.includes(s)) score = 40;
        return { it, score };
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.map(x => x.it).slice(0, 40);
  }, [q, items]);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const pick = (it: Item) => {
    if (it.kind === "tab") onPickTab(it.id); else onPickBrand(Number(it.id));
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-gray-100">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Jump to a tab or brand…"
            className="flex-1 py-3.5 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No matches for “{q}”.</p>
          ) : results.map((it, i) => (
            <button
              key={`${it.kind}-${it.id}`} data-idx={i}
              onMouseEnter={() => setActive(i)} onClick={() => pick(it)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm ${i === active ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {it.kind === "brand"
                ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: it.color || "#94a3b8" }} />
                : <svg className={`w-3.5 h-3.5 shrink-0 ${i === active ? "text-emerald-500" : "text-gray-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
              <span className="flex-1 truncate font-medium">{it.label}</span>
              {it.group && <span className="text-[10px] text-gray-400 shrink-0">{it.group}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">
          <span><kbd className="border border-gray-200 rounded px-1">↑</kbd> <kbd className="border border-gray-200 rounded px-1">↓</kbd> navigate</span>
          <span><kbd className="border border-gray-200 rounded px-1">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="border border-gray-200 rounded px-1">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
