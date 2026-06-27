"use client";

import { useMemo, useRef, useState } from "react";
import { buildSnapshot, snapshotHtml, type SnapshotInput } from "@/lib/snapshot";

type Props = Omit<SnapshotInput, "brand"> & {
  brands: { id: number; name: string; live?: boolean }[];
  selected: number | "all";
  onSelect: (id: number) => void;
};

export function BrandSnapshot({ brands, selected, onSelect, month, monthKeys, monthLabels, fyLabel, ...data }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const live = brands.filter(b => b.live !== false);
  // Fall back to the first live brand when "all" is selected — a snapshot is per brand.
  const brandId = selected === "all" ? (live[0]?.id ?? brands[0]?.id) : selected;
  const brand = brands.find(b => b.id === brandId);
  const [busy, setBusy] = useState(false);

  const html = useMemo(() => {
    if (!brand) return "";
    return snapshotHtml(buildSnapshot({ brand, month, monthKeys, monthLabels, fyLabel, ...data }));
  }, [brand, month, monthKeys, monthLabels, fyLabel, data]);

  const monthName = monthLabels[monthKeys.indexOf(month)] ?? month;
  const fileName = `${(brand?.name ?? "brand").replace(/\s+/g, "_")}_${monthName}_${fyLabel}_Snapshot.html`.replace(/[^\w.\-]/g, "");

  function printIt() {
    const win = frameRef.current?.contentWindow;
    if (win) { win.focus(); win.print(); }
  }
  function download() {
    setBusy(true);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => { URL.revokeObjectURL(url); setBusy(false); }, 500);
  }

  if (!brand) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No brand to report on.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <select
          value={String(brandId)}
          onChange={e => onSelect(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
        >
          {live.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <button onClick={download} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition disabled:opacity-60">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
            Download HTML
          </button>
          <button onClick={printIt} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print / PDF
          </button>
        </div>
      </div>
      {/* Rendered in an isolated iframe so the report's own styles match the sample exactly. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <iframe ref={frameRef} title="snapshot" srcDoc={html} className="w-full" style={{ height: "1180px", border: 0 }} />
      </div>
    </div>
  );
}
