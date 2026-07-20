"use client";

import { useEffect, useState } from "react";

// Briefed blogs on the Blogs Asana board (incl. AI-suggested ones) — click a
// row to read the full brief without leaving the dashboard. Rendered on the
// Blogs tab directly under the Suggested blogs panel.
type PipeTask = { gid: string; name: string; notes: string | null; due_on: string | null; requested_by?: string | null; permalink_url: string | null };

function mdLite(text: string) {
  const bold = (s: string, k: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={`${k}-${i}`} className="font-bold text-slate-800">{part}</strong> : part));
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return null;
    if (/^#{1,4}\s/.test(t)) return <p key={i} className="text-[13px] font-bold text-slate-800 mt-2.5 first:mt-0">{bold(t.replace(/^#{1,4}\s/, ""), String(i))}</p>;
    if (/^[-*•]\s/.test(t)) return <p key={i} className="text-[13px] text-slate-600 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-violet-500">{bold(t.replace(/^[-*•]\s/, ""), String(i))}</p>;
    return <p key={i} className="text-[13px] text-slate-600 leading-relaxed mt-1.5">{bold(t, String(i))}</p>;
  });
}

export function BlogPipeline() {
  const [pipeline, setPipeline] = useState<PipeTask[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content-todo?label=Blogs").then(r => r.json()).then(d => {
      if (d?.ok) setPipeline(d.tasks ?? []);
    }).catch(() => {});
  }, []);

  if (pipeline.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">📝 Blog pipeline</p>
        <span className="text-[12px] text-gray-400">{pipeline.length} briefed · click one to read its full brief</span>
      </div>
      <div className="divide-y divide-gray-50">
        {pipeline.map(t => {
          const isOpen = open === t.gid;
          return (
            <div key={t.gid}>
              <button onClick={() => setOpen(isOpen ? null : t.gid)} className="w-full text-left flex items-center gap-2 py-2 hover:bg-violet-50/40 rounded-lg px-1.5">
                <span className="text-[13px] font-semibold text-slate-700 flex-1 truncate">{isOpen ? "▾ " : "▸ "}{t.name}</span>
                {t.requested_by && <span className="text-[11px] text-gray-400 shrink-0">req. {String(t.requested_by).split(" ")[0]}</span>}
                {t.due_on && <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 rounded px-1.5 py-0.5 shrink-0">{new Date(t.due_on + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>}
              </button>
              {isOpen && (
                <div className="mx-1.5 mb-2.5 rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
                  {t.notes ? <div className="space-y-0.5">{mdLite(t.notes)}</div> : <p className="text-[12.5px] text-gray-400">No brief attached to this one.</p>}
                  {t.permalink_url && <a href={t.permalink_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[12px] font-semibold text-violet-600 hover:underline">Open in Asana ↗</a>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
