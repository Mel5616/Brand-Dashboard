import React from "react";

// Shared visual cues, matched to the brand detail page so every tab reads as
// the same family: a dark slate section bar with uppercase, letter-spaced text.
export const HEADER_BG = "#2e4057";

export function SectionBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div
      className="px-5 py-2.5 flex items-center justify-between text-white text-[11px] font-bold tracking-[0.22em] uppercase rounded-xl mb-4"
      style={{ background: HEADER_BG }}
    >
      <span>{title}</span>
      {right}
    </div>
  );
}
