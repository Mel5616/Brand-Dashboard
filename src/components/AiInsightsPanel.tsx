"use client";

import { useState } from "react";
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
              <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
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
        <h4 key={`h-${blocks.length}`} className={`text-xs font-bold uppercase tracking-widest mt-4 mb-2 first:mt-0 ${isWatch ? "text-amber-600" : "text-indigo-500"}`}>
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
  const [open, setOpen] = useState(true);

  if (!insight) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2">
          <SparkIcon />
          <h3 className="text-sm font-semibold text-slate-700">Weekly AI Brief</h3>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          No brief generated yet. Run <code className="bg-gray-100 px-1 rounded">python3 scripts/sync_insights.py</code> to create one.
        </p>
      </div>
    );
  }

  const when = new Date(insight.generated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="bg-gradient-to-br from-indigo-50/60 to-white rounded-2xl border border-indigo-100 shadow-sm mb-5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-indigo-50/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SparkIcon />
          <h3 className="text-sm font-semibold text-slate-700">Weekly AI Brief</h3>
          <span className="text-[11px] text-gray-400">· {insight.period_label ?? when}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1">
          <div className="border-t border-indigo-100/70 pt-4">
            {renderMarkdown(insight.content)}
          </div>
          <p className="text-[10px] text-gray-300 mt-3">Generated {when}{insight.model ? ` · ${insight.model}` : ""} · review before sharing</p>
        </div>
      )}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l1.6 5.6L19 9.2l-5.4 1.6L12 16l-1.6-5.2L5 9.2l5.4-1.6L12 2z" opacity="0.9" />
      <path d="M18 14l.8 2.6L21.4 17.4l-2.6.8L18 21l-.8-2.8L14.6 17.4l2.6-.8L18 14z" opacity="0.6" />
    </svg>
  );
}
