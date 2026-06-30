"use client";

// Triggers the browser print dialog (Save as PDF / print on A4). Screen-only.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 shadow-sm transition"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
      Print / Save as PDF
    </button>
  );
}
