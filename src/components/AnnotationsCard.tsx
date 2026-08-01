"use client";

import React from "react";

// Event memory — the "what happened here" layer. Dated notes (promos, expos,
// price changes, stockouts, PR) listed newest-first with a quick-add row.
// The same annotations are drawn as flags on the monthly charts.

export type Annotation = { id: number; day: string; label: string; kind: string; brand: string | null; created_by: string | null };

export const KIND_META: Record<string, { emoji: string; name: string }> = {
  promo: { emoji: "🏷️", name: "Promo" },
  expo:  { emoji: "🎪", name: "Expo/Event" },
  price: { emoji: "💲", name: "Price change" },
  stock: { emoji: "📦", name: "Stock" },
  pr:    { emoji: "📣", name: "PR/Launch" },
  other: { emoji: "📌", name: "Note" },
};

const dShort = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });

export function AnnotationsCard({ items, brands, isAdmin, me, onChange }: {
  items: Annotation[]; brands: { name: string }[]; isAdmin: boolean; me: string | null;
  onChange: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [f, setF] = React.useState({ day: new Date().toISOString().slice(0, 10), label: "", kind: "promo", brand: "" });
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!f.label.trim()) return;
    setBusy(true);
    await fetch("/api/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, brand: f.brand || null }) }).catch(() => {});
    setBusy(false);
    setF(p => ({ ...p, label: "" }));
    setOpen(false);
    onChange();
  }
  async function del(id: number) {
    await fetch(`/api/annotations?id=${id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  const shown = showAll ? items : items.slice(0, 8);
  const inp = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Event memory</h2>
          <p className="text-xs text-gray-400 mt-0.5">What happened, when — promos, expos, launches, stock. Flagged on the monthly charts.</p>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-[12.5px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5 shrink-0">＋ Note</button>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-50 rounded-lg p-3">
          <input type="date" value={f.day} onChange={e => setF(p => ({ ...p, day: e.target.value }))} className={inp} />
          <select value={f.kind} onChange={e => setF(p => ({ ...p, kind: e.target.value }))} className={inp}>
            {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.emoji} {m.name}</option>)}
          </select>
          <select value={f.brand} onChange={e => setF(p => ({ ...p, brand: e.target.value }))} className={inp}>
            <option value="">Whole portfolio</option>
            {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
          <input value={f.label} onChange={e => setF(p => ({ ...p, label: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()}
            placeholder='e.g. "Kona pre-orders open", "BigW promo starts"' className={`${inp} flex-1 min-w-[220px]`} />
          <button onClick={add} disabled={busy || !f.label.trim()} className="text-[12.5px] font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 disabled:opacity-40">Save</button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No events noted yet — add the first with ＋ Note. Future-you will thank you.</p>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {shown.map(a => (
              <div key={a.id} className="flex items-center gap-3 py-1.5">
                <span className="text-base leading-none">{KIND_META[a.kind]?.emoji ?? "📌"}</span>
                <span className="text-[12px] text-gray-400 w-20 shrink-0">{dShort(a.day)}</span>
                {a.brand && <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">{a.brand}</span>}
                <span className="text-sm text-slate-700 flex-1 min-w-0 truncate" title={a.label}>{a.label}</span>
                {(isAdmin || a.created_by === me) && (
                  <button onClick={() => del(a.id)} className="text-gray-300 hover:text-rose-500 text-xs shrink-0">✕</button>
                )}
              </div>
            ))}
          </div>
          {items.length > 8 && (
            <button onClick={() => setShowAll(s => !s)} className="mt-2 text-[12px] font-semibold text-gray-400 hover:text-gray-600">
              {showAll ? "Show fewer ▴" : `Show all ${items.length} ▾`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Chart.js inline plugin factory: draws a flag emoji above annotated months and
// appends the notes to that month's tooltip footer.
export function annotationChartExtras(annotations: Annotation[], monthKeys: string[]) {
  const byMonth = new Map<number, Annotation[]>();
  for (const a of annotations) {
    const i = monthKeys.indexOf(a.day.slice(0, 7));
    if (i >= 0) byMonth.set(i, [...(byMonth.get(i) ?? []), a]);
  }
  const plugin = {
    id: "eventFlags",
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart;
      const xScale = chart.scales.x;
      if (!xScale) return;
      ctx.save();
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      for (const [i, list] of byMonth) {
        const x = xScale.getPixelForValue(i);
        ctx.fillText(KIND_META[list[0].kind]?.emoji ?? "📌", x, chart.chartArea.top + 10);
      }
      ctx.restore();
    },
  };
  const footer = (items: any[]) => {
    const i = items[0]?.dataIndex;
    const list = byMonth.get(i) ?? [];
    return list.map(a => `${KIND_META[a.kind]?.emoji ?? "📌"} ${a.day.slice(8)}${a.brand ? ` ${a.brand}:` : ""} ${a.label}`).join("\n");
  };
  return { plugin, footer, hasAny: byMonth.size > 0 };
}
