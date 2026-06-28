"use client";

import { useState, useRef, useEffect } from "react";
import type { AiInsight } from "@/lib/db";

interface Props {
  insight: AiInsight | null;
}

// Minimal renderer for the structured markdown Claude returns:
// ## headings, "- " bullets, and **bold** spans.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-800">{p.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${i}`}>{p}</span>
  );
}

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="space-y-1.5 mb-3">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
              <span className="text-emerald-400 mt-0.5 flex-shrink-0">•</span>
              <span>{renderInline(b, `li-${blocks.length}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("## ")) {
      flush();
      const heading = line.slice(3);
      const isWatch = /watch/i.test(heading);
      blocks.push(
        <h4 key={`h-${blocks.length}`} className={`text-xs font-bold uppercase tracking-widest mt-4 mb-2 first:mt-0 ${isWatch ? "text-amber-600" : "text-emerald-500"}`}>
          {heading.replace(/:$/, "")}
        </h4>
      );
    } else if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push(<h3 key={`h-${blocks.length}`} className="text-sm font-bold text-slate-800 mb-2">{line.slice(2)}</h3>);
    } else {
      flush();
      blocks.push(<p key={`p-${blocks.length}`} className="text-sm text-slate-600 leading-relaxed mb-3">{renderInline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flush();
  return blocks;
}

export function AiInsightsPanel({ insight }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const when = insight
    ? new Date(insight.generated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg hover:bg-gray-100 transition-colors"
        title="Weekly AI Brief"
      >
        <SparkIcon />
        <span className="text-xs font-medium text-gray-600 hidden sm:inline">Brief</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[26rem] max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-emerald-50/70 to-white">
            <SparkIcon />
            <h3 className="text-sm font-semibold text-slate-700">Weekly AI Brief</h3>
            {insight && <span className="text-[11px] text-gray-400 ml-auto">{insight.period_label ?? when}</span>}
          </div>

          {insight ? (
            <>
              <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
                {renderMarkdown(insight.content)}
              </div>
              <p className="px-5 py-2.5 text-[10px] text-gray-300 border-t border-gray-50">
                Generated {when}{insight.model ? ` · ${insight.model}` : ""} · review before sharing
              </p>
            </>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-500">No brief generated yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_insights.py</code> to create one.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l1.6 5.6L19 9.2l-5.4 1.6L12 16l-1.6-5.2L5 9.2l5.4-1.6L12 2z" opacity="0.9" />
      <path d="M18 14l.8 2.6L21.4 17.4l-2.6.8L18 21l-.8-2.8L14.6 17.4l2.6-.8L18 14z" opacity="0.6" />
    </svg>
  );
}
