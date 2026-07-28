"use client";

import { useEffect, useRef, useState } from "react";

// Personal to-do list: floating ✓ button (every tab) → slide-over panel.
// Private per login; quick add, tick, delete, clear completed.
type Todo = { id: number; text: string; done: boolean; done_at: string | null; created_at: string };

export function TodoPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Todo[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/todos").then(r => r.json()).then(d => {
      if (d?.needsSetup) setNeedsSetup(true);
      else if (d?.ok) setItems(d.items ?? []);
    }).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 120); }, [open]);

  const todo = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  async function add() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setDraft("");
    const d = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) setItems(prev => [d.item, ...prev]);
    else setDraft(text);
  }
  async function toggle(t: Todo) {
    setItems(prev => prev.map(x => x.id === t.id ? { ...x, done: !t.done } : x));
    await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, done: !t.done }) }).catch(() => {});
  }
  async function del(id: number) {
    setItems(prev => prev.filter(x => x.id !== id));
    await fetch(`/api/todos?id=${id}`, { method: "DELETE" }).catch(() => {});
  }
  async function clearDone() {
    setItems(prev => prev.filter(x => !x.done));
    await fetch("/api/todos?clearDone=1", { method: "DELETE" }).catch(() => {});
  }

  return (
    <>
      {/* floating button */}
      <button onClick={() => setOpen(v => !v)} title="My to-dos"
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-white shadow-lg flex items-center justify-center print:hidden">
        <span className="text-lg">✓</span>
        {todo.length > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-emerald-500 text-[11px] font-bold flex items-center justify-center">{todo.length}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/20" />
          <div onClick={e => e.stopPropagation()}
            className="absolute right-0 top-0 bottom-0 w-[360px] max-w-[92vw] bg-white shadow-2xl flex flex-col">
            <div className="px-5 py-4 bg-slate-800 flex items-center justify-between">
              <p className="text-white font-bold text-[15px]">✓ My to-dos</p>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white text-xl leading-none">✕</button>
            </div>

            {needsSetup ? (
              <p className="p-5 text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_todos.sql</code> to enable to-dos.</p>
            ) : (
              <>
                <div className="p-4 border-b border-gray-100">
                  <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && add()}
                    placeholder="Add a to-do and press Enter…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {todo.length === 0 && done.length === 0 && <p className="text-sm text-gray-300 text-center py-8">Nothing yet — add your first to-do above.</p>}
                  <div className="space-y-1">
                    {todo.map(t => (
                      <div key={t.id} className="group flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50">
                        <button onClick={() => toggle(t)} className="mt-0.5 w-[18px] h-[18px] shrink-0 rounded-md border-2 border-gray-300 hover:border-emerald-500" aria-label="Mark done" />
                        <span className="flex-1 text-[13.5px] text-slate-700 leading-snug">{t.text}</span>
                        <button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 text-xs mt-0.5">✕</button>
                      </div>
                    ))}
                  </div>
                  {done.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Done · {done.length}</p>
                        <button onClick={clearDone} className="text-[11px] text-gray-400 hover:text-rose-500">Clear</button>
                      </div>
                      <div className="space-y-0.5">
                        {done.map(t => (
                          <div key={t.id} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5">
                            <button onClick={() => toggle(t)} className="mt-0.5 w-[18px] h-[18px] shrink-0 rounded-md bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center" aria-label="Mark not done">✓</button>
                            <span className="flex-1 text-[13px] text-gray-400 line-through leading-snug">{t.text}</span>
                            <button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 text-xs mt-0.5">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="px-5 py-2.5 border-t border-gray-100 text-[10.5px] text-gray-400">Private to your login — every team member gets their own list.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
