"use client";

// Shimmer placeholder card — shown while a panel's data is on its way, so
// panels never "pop in" from nothing.
export function SkeletonCard({ lines = 3, title }: { lines?: number; title?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 animate-pulse" aria-hidden>
      {title
        ? <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300 mb-3">{title}</h2>
        : <div className="h-3 w-40 bg-gray-100 rounded mb-4" />}
      <div className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-3.5 bg-gray-100 rounded" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
