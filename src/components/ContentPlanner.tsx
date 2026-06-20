"use client";

import { useEffect, useState } from "react";
import type { Brand } from "@/lib/db";

type Item = {
  id: number; brand_id: number; channel: string; title: string;
  scheduled_date: string | null; status: string; notes: string | null; draft?: string | null;
};

const CHANNELS = ["Instagram", "Facebook", "TikTok", "Email", "Blog", "Website", "Other"];
const STATUSES = [
  { key: "idea",      label: "Idea",      dot: "#94a3b8", chip: "bg-slate-100 text-slate-600" },
  { key: "drafting",  label: "Drafting",  dot: "#f59e0b", chip: "bg-amber-100 text-amber-700" },
  { key: "scheduled", label: "Scheduled", dot: "#6366f1", chip: "bg-indigo-100 text-indigo-700" },
  { key: "live",      label: "Live",      dot: "#10b981", chip: "bg-emerald-100 text-emerald-700" },
];
const statusMeta = (k: string) => STATUSES.find(s => s.key === k) ?? STATUSES[0];

const SQL = `create table if not exists content_items (
  id bigint generated always as identity primary key,
  brand_id int not null,
  channel text not null default 'Instagram',
  title text not null,
  scheduled_date date,
  status text not null default 'idea',
  notes text,
  draft text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table content_items disable row level security;`;

export function ContentPlanner({ brands, brandFilter, monthKey }: { brands: Brand[]; brandFilter: number | "all"; monthKey: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<"pipeline" | "calendar">("pipeline");
  const [edit, setEdit] = useState<Partial<Item> | null>(null); // open form (new or existing)

  const liveBrands = brands.filter(b => b.live);
  const brandOf = (id: number) => brands.find(b => b.id === id);
  const colorOf = (id: number) => brandOf(id)?.color ?? "#6366f1";

  function load() {
    fetch("/api/content").then(r => r.json()).then(d => {
      setNeedsSetup(!!d.needsSetup); setItems(d.items ?? []); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  // Filter to the selected brand (global filter)
  const visible = items.filter(i => brandFilter === "all" || i.brand_id === brandFilter);
  const inMonth = (d: string | null) => !!d && d.slice(0, 7) === monthKey;

  async function save(it: Partial<Item>) {
    const isNew = !it.id;
    const res = await fetch("/api/content", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(it),
    }).then(r => r.json()).catch(() => null);
    if (res?.ok) { setEdit(null); load(); }
    else if (res?.needsSetup) { setNeedsSetup(true); setEdit(null); }
  }
  async function remove(id: number) {
    await fetch(`/api/content?id=${id}`, { method: "DELETE" });
    setEdit(null); load();
  }
  async function setStatus(it: Item, status: string) {
    setItems(prev => prev.map(p => p.id === it.id ? { ...p, status } : p)); // optimistic
    await fetch("/api/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, status }) });
  }

  // Gap flags — live brands with nothing planned this month
  const plannedBrandIds = new Set(visible.filter(i => inMonth(i.scheduled_date)).map(i => i.brand_id));
  const gapBrands = (brandFilter === "all" ? liveBrands : liveBrands.filter(b => b.id === brandFilter)).filter(b => !plannedBrandIds.has(b.id));

  const monthLabel = new Date(monthKey + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  if (needsSetup) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-2xl">
        <h2 className="font-semibold text-gray-800">One-time setup</h2>
        <p className="text-sm text-gray-500 mt-1">The content planner needs a table to store entries. Run this once in the Supabase SQL editor, then reload.</p>
        <pre className="mt-4 text-[11px] bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">{SQL}</pre>
        <button onClick={() => { setLoading(true); setNeedsSetup(false); load(); }} className="mt-4 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3 py-2">I've run it — reload</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Content Planner</h2>
          <p className="text-xs text-gray-400 mt-0.5">{monthLabel}{brandFilter !== "all" ? ` · ${brandOf(brandFilter as number)?.name}` : " · all brands"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            {(["pipeline", "calendar"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${view === v ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => setEdit({ brand_id: brandFilter === "all" ? liveBrands[0]?.id : (brandFilter as number), channel: "Instagram", status: "idea", scheduled_date: `${monthKey}-15` })}
            className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3 py-2">+ Add content</button>
        </div>
      </div>

      {/* Gap flags */}
      {!loading && gapBrands.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Nothing planned for {monthLabel}:</span>{" "}
            {gapBrands.map((b, i) => (
              <button key={b.id} onClick={() => setEdit({ brand_id: b.id, channel: "Instagram", status: "idea", scheduled_date: `${monthKey}-15` })} className="underline decoration-amber-300 hover:decoration-amber-600">
                {b.name}{i < gapBrands.length - 1 ? "," : ""}
              </button>
            )).reduce((a, b) => [a, " ", b] as any)}
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : view === "pipeline" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUSES.map(s => {
            const col = visible.filter(i => i.status === s.key).sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999"));
            return (
              <div key={s.key} className="bg-gray-50/70 rounded-xl p-2.5 min-h-[120px]">
                <div className="flex items-center gap-1.5 px-1 pb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{s.label}</span>
                  <span className="text-[11px] text-gray-400">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map(it => <Card key={it.id} it={it} colorOf={colorOf} brandOf={brandOf} onClick={() => setEdit(it)} onStatus={setStatus} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CalendarGrid monthKey={monthKey} items={visible} colorOf={colorOf} onAdd={(d) => setEdit({ brand_id: brandFilter === "all" ? liveBrands[0]?.id : (brandFilter as number), channel: "Instagram", status: "idea", scheduled_date: d })} onOpen={setEdit} />
      )}

      {edit && (
        <EditModal item={edit} brands={liveBrands} onClose={() => setEdit(null)} onSave={save} onDelete={remove} />
      )}
    </div>
  );
}

function Card({ it, colorOf, brandOf, onClick, onStatus }: { it: Item; colorOf: (id: number) => string; brandOf: (id: number) => Brand | undefined; onClick: () => void; onStatus: (it: Item, s: string) => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5 hover:shadow-md transition-shadow">
      <button onClick={onClick} className="text-left w-full">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(it.brand_id) }} />
          <span className="text-[10px] text-gray-400 truncate">{brandOf(it.brand_id)?.name}</span>
          <span className="ml-auto text-[9px] font-semibold text-gray-400 uppercase">{it.channel}</span>
        </div>
        <p className="text-xs text-slate-700 font-medium leading-snug">{it.title}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {it.scheduled_date && <span className="text-[10px] text-gray-400">{new Date(it.scheduled_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>}
          {it.draft && <span className="text-[9px] text-indigo-500" title="Has AI draft">✨ draft</span>}
        </div>
      </button>
      <select value={it.status} onChange={e => onStatus(it, e.target.value)} onClick={e => e.stopPropagation()}
        className="mt-2 w-full text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-1 focus:outline-none">
        {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </div>
  );
}

function CalendarGrid({ monthKey, items, colorOf, onAdd, onOpen }: { monthKey: string; items: Item[]; colorOf: (id: number) => string; onAdd: (d: string) => void; onOpen: (it: Item) => void }) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthKey}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const byDay = new Map<string, Item[]>();
  for (const it of items) if (it.scheduled_date) { const k = it.scheduled_date; byDay.set(k, [...(byDay.get(k) ?? []), it]); }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d} className="text-[10px] font-semibold text-gray-400 text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => (
          <div key={i} className={`min-h-[84px] rounded-lg border p-1 ${date ? "border-gray-100" : "border-transparent bg-gray-50/40"} ${date === today ? "ring-1 ring-indigo-300" : ""}`}>
            {date && (
              <>
                <button onClick={() => onAdd(date)} className="w-full text-left text-[10px] text-gray-400 hover:text-indigo-500 px-0.5">{Number(date.slice(-2))}</button>
                <div className="space-y-1 mt-0.5">
                  {(byDay.get(date) ?? []).map(it => (
                    <button key={it.id} onClick={() => onOpen(it)} className="w-full text-left flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-50" style={{ background: `${colorOf(it.brand_id)}14` }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colorOf(it.brand_id) }} />
                      <span className="text-[9px] text-slate-600 truncate">{it.title}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditModal({ item, brands, onClose, onSave, onDelete }: { item: Partial<Item>; brands: Brand[]; onClose: () => void; onSave: (it: Partial<Item>) => void; onDelete: (id: number) => void }) {
  const [f, setF] = useState<Partial<Item>>(item);
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState("");
  const set = (k: keyof Item, v: any) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title && f.brand_id != null;

  async function generate() {
    if (!f.title || f.brand_id == null) return;
    setDrafting(true); setDraftErr("");
    const brand_name = brands.find(b => b.id === f.brand_id)?.name;
    const res = await fetch("/api/content/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_name, channel: f.channel, title: f.title, notes: f.notes }),
    }).then(r => r.json()).catch(() => null);
    setDrafting(false);
    if (res?.ok) set("draft", res.draft);
    else setDraftErr("Couldn't generate — try again.");
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-4">{item.id ? "Edit content" : "New content"}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Title</label>
            <input autoFocus value={f.title ?? ""} onChange={e => set("title", e.target.value)} placeholder="e.g. Vista V3 launch reel"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</label>
              <select value={f.brand_id ?? ""} onChange={e => set("brand_id", Number(e.target.value))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Channel</label>
              <select value={f.channel ?? "Instagram"} onChange={e => set("channel", e.target.value)} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Date</label>
              <input type="date" value={f.scheduled_date ?? ""} onChange={e => set("scheduled_date", e.target.value || null)} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
              <select value={f.status ?? "idea"} onChange={e => set("status", e.target.value)} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Notes</label>
            <textarea value={f.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2} placeholder="brief, angle, links…"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Draft copy</label>
              <button onClick={generate} disabled={!valid || drafting}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40 flex items-center gap-1">
                {drafting ? "✨ Writing…" : f.draft ? "✨ Regenerate" : "✨ Draft copy"}
              </button>
            </div>
            <textarea value={f.draft ?? ""} onChange={e => set("draft", e.target.value)} rows={f.draft ? 6 : 2}
              placeholder="Click ‘Draft copy’ to generate on-brand copy for this channel — then edit freely."
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
            {draftErr && <p className="text-[11px] text-rose-500 mt-1">{draftErr}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <button disabled={!valid} onClick={() => onSave(f)} className="text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-lg px-4 py-2">Save</button>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
          {item.id && <button onClick={() => onDelete(item.id!)} className="ml-auto text-sm text-rose-500 hover:text-rose-600">Delete</button>}
        </div>
      </div>
    </div>
  );
}
