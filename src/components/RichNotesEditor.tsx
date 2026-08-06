"use client";

import { useRef, useEffect } from "react";

const btn = "text-xs font-semibold px-2 py-1 rounded hover:bg-gray-100 text-slate-600";

// Minimal contenteditable rich-text field (bold/italic/bullet/numbered list) —
// its HTML output is converted to Asana's html_notes format at submit time
// (see src/lib/richNotes.ts), so keep formatting to what that converter handles.
export function RichNotesEditor({ value, onChange, placeholder, className }: { value: string; onChange: (html: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external resets (e.g. clearing the form after submit) without
  // clobbering the cursor mid-type.
  useEffect(() => {
    if (!ref.current) return;
    if (document.activeElement === ref.current) return;
    if (ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
  }, [value]);

  function cmd(name: string) {
    ref.current?.focus();
    document.execCommand(name);
    onChange(ref.current?.innerHTML ?? "");
  }
  const empty = !value || value === "<br>";

  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 border border-gray-200 border-b-0 rounded-t-lg bg-gray-50 px-1.5 py-1">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd("bold")} className={`${btn} font-bold`}>B</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd("italic")} className={`${btn} italic`}>I</button>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd("insertUnorderedList")} className={btn}>• List</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd("insertOrderedList")} className={btn}>1. List</button>
      </div>
      <div className="relative">
        {empty && placeholder && <span className="pointer-events-none absolute left-3 top-2 text-sm text-gray-400">{placeholder}</span>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={e => onChange(e.currentTarget.innerHTML)}
          className="text-sm text-slate-700 border border-gray-200 rounded-b-lg px-3 py-2 min-h-[64px] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-inset"
        />
      </div>
    </div>
  );
}
