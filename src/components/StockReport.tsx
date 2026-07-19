"use client";

import { useEffect, useMemo, useState } from "react";

// Operations > Stock Report — OOS-style live mirror of the Asana Stock Report
// board: per-brand table sections (brand-coloured bands) with Product / Code /
// Stock Status / Ordering For / Notes columns from Asana custom fields.
// Ticking the circle completes the task in Asana.
type Task = {
  gid: string; name: string; notes: string; due_on: string | null;
  section: string | null; permalink_url: string | null; requested_by?: string | null;
  custom_fields?: Record<string, string> | null;
};
type BrandRef = { name: string; color: string };

// Pull a value from the custom-field map by fuzzy name match.
function field(t: Task, patterns: RegExp[]): string | null {
  const cf = t.custom_fields || {};
  for (const pat of patterns) {
    const key = Object.keys(cf).find(k => pat.test(k));
    if (key && cf[key]) return cf[key];
  }
  return null;
}
const statusCls = (s: string) => {
  const v = s.toLowerCase();
  if (/out/.test(v)) return "bg-rose-100 text-rose-700";
  if (/low/.test(v)) return "bg-amber-100 text-amber-700";
  if (/back|order/.test(v)) return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
};

export function StockReport({ brands = [], admin }: { brands?: BrandRef[]; admin: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [asanaWrite, setAsanaWrite] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", due_on: "" });
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content-todo?label=Stock%20Report").then(r => r.json()).then(d => {
      if (d.ok) {
        // Only real stock lines come through — tasks with no custom fields
        // (section headers, "Last Updated" markers) stay in Asana.
        setTasks((d.tasks ?? []).filter((t: any) => t.custom_fields && Object.keys(t.custom_fields).length > 0));
        setAsanaWrite(!!d.asanaWrite);
        const mods = (d.tasks ?? []).map((t: any) => t.modified_at).filter(Boolean).sort();
        setSynced(d.synced ?? (mods[mods.length - 1] ?? null));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const color = (name: string) => brands.find(b => b.name.toLowerCase() === (name || "").toLowerCase())?.color ?? "#94a3b8";
  const hasFields = useMemo(() => tasks.some(t => t.custom_fields && Object.keys(t.custom_fields).length > 0), [tasks]);

  const sections = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) m.set(t.section || "General", [...(m.get(t.section || "General") ?? []), t]);
    for (const [k, list] of m) m.set(k, [...list].sort((a, b) => a.name.localeCompare(b.name)));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [tasks]);

  async function complete(gid: string) {
    const prev = tasks;
    setTasks(p => p.filter(t => t.gid !== gid));
    const d = await post({ action: "task.complete", gid });
    if (!d.ok) { setTasks(prev); setErr(d.error || "Couldn't complete in Asana."); }
  }
  async function createTask() {
    if (!af.name.trim()) { setErr("Item name required."); return; }
    setBusy(true); setErr("");
    const d = await post({ action: "task.create", name: af.name, due_on: af.due_on, project_gid: "1148429855158443", project_label: "Stock Report" });
    setBusy(false);
    if (d.ok) { setTasks(p => [d.item, ...p]); setAf({ name: "", due_on: "" }); setShowAdd(false); }
    else setErr(d.error || "Couldn't create the task.");
  }

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">OOS Report</h1>
          <p className="text-sm text-gray-400">Live mirror of the Asana <strong>Stock Report</strong> board{synced ? ` · last synced ${new Date(synced).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""} · ticks write back to Asana.</p>
        </div>
        {asanaWrite && admin && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">{showAdd ? "Cancel" : "+ Add item"}</button>}
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
      {!hasFields && tasks.length > 0 && (
        <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Code / stock status columns fill after the next sync (and <code className="bg-white px-1 rounded">add_asana_custom_fields.sql</code> has been run).</p>
      )}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-2">
          <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder="Product / item" className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <input type="date" value={af.due_on} onChange={e => setAf({ ...af, due_on: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={createTask} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Adding…" : "Add to Asana"}</button>
        </div>
      )}
      {tasks.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Nothing on the stock report — it fills from Asana after the next sync.</div>
      )}

      {sections.map(([section, list]) => {
        const col = color(section);
        const oos = list.filter(t => /out/i.test(field(t, [/stock.*status/i, /^status$/i]) || "")).length;
        const low = list.filter(t => /low/i.test(field(t, [/stock.*status/i, /^status$/i]) || "")).length;
        return (
          <div key={section} className="bg-white rounded-2xl shadow-sm overflow-hidden border" style={{ borderColor: `${col}55`, borderTopWidth: 3, borderTopColor: col }}>
            <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: `${col}12` }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col }} />
              <p className="text-[14px] font-bold text-slate-800">{section}</p>
              <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5" style={{ background: `${col}22`, color: col }}>{list.length} items</span>
              <span className="ml-auto flex gap-1.5">
                {oos > 0 && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-rose-100 text-rose-600">{oos} Out of Stock</span>}
                {low > 0 && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">{low} Low in Stock</span>}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-bold">Product</th>
                    <th className="text-left px-3 py-2 font-bold">Code</th>
                    <th className="text-left px-3 py-2 font-bold">Stock status</th>
                    <th className="text-left px-3 py-2 font-bold">Ordering for</th>
                    <th className="text-left px-3 py-2 font-bold">Notes</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((t, i) => {
                    const code = field(t, [/code/i, /sku/i]);
                    const status = field(t, [/stock.*status/i, /^status$/i]);
                    const ordering = field(t, [/order/i, /eta/i, /arriv/i, /due/i]);
                    return (
                      <tr key={t.gid} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-gray-50/60" : ""}`}>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-2.5">
                            <button onClick={() => complete(t.gid)} title="Mark resolved (completes in Asana)"
                              className="w-[15px] h-[15px] rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-100 shrink-0 transition-colors" />
                            <span className="font-medium text-slate-700">{t.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-slate-500">{code ?? "—"}</td>
                        <td className="px-3 py-2">{status ? <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${statusCls(status)}`}>{status}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-600">{ordering ?? (t.due_on ? new Date(t.due_on + "T00:00:00").toLocaleDateString("en-AU", { month: "long" }) : "—")}</td>
                        <td className="px-3 py-2 text-slate-500 text-[13px] max-w-[280px] truncate" title={field(t, [/^notes$/i]) || t.notes || undefined}>{field(t, [/^notes$/i]) || t.notes?.trim() || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          {t.permalink_url && <a href={t.permalink_url} target="_blank" rel="noreferrer" title="Open in Asana" className="text-gray-300 hover:text-emerald-600">↗</a>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
