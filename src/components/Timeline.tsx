"use client";

import { useEffect, useMemo, useState } from "react";

// Portfolio-wide, highly visual timeline of what's physically landing:
// stock arrivals, product launches, coming-soon teasers. Distinct from the
// Campaign Calendar (marketing activity) and Launch Decks (the pitch decks
// themselves) — this is purely "what's coming and when."

type Brand = { id: number; name: string; live?: boolean; color?: string };
type EventType = "stock" | "launch" | "coming_soon";
type TimelineEvent = {
  id: number; brand_id: number; event_type: EventType; title: string; date: string; end_date: string | null;
  product_name: string | null; quantity: number | null; status: string | null; note: string | null; image_url: string | null;
};

const TYPE_META: Record<EventType, { label: string; icon: string; color: string; bg: string }> = {
  stock: { label: "Stock arrival", icon: "📦", color: "#0284c7", bg: "#eff8ff" },
  launch: { label: "Product launch", icon: "🚀", color: "#7c3aed", bg: "#f6f2ff" },
  coming_soon: { label: "Coming soon", icon: "✨", color: "#d97706", bg: "#fff8ec" },
};

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const fmtD = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const monthOf = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" });

export function Timeline({ brands, admin = false }: { brands: Brand[]; admin?: boolean }) {
  const live = brands.filter(b => b.live !== false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [msg, setMsg] = useState("");
  const [brandFilter, setBrandFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [showPast, setShowPast] = useState(false);

  function reload() {
    setLoading(true);
    fetch("/api/timeline-events").then(r => r.json()).then(d => {
      if (d.needsSetup) { setNeedsSetup(true); return; }
      setEvents(d.events ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const filtered = useMemo(() => events
    .filter(e => brandFilter === "all" || e.brand_id === brandFilter)
    .filter(e => typeFilter === "all" || e.event_type === typeFilter)
    .filter(e => showPast || (e.end_date || e.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date)), [events, brandFilter, typeFilter, showPast, today]);

  const grouped = useMemo(() => {
    const g: { month: string; items: TimelineEvent[] }[] = [];
    for (const e of filtered) {
      const m = monthOf(e.date);
      let bucket = g.find(x => x.month === m);
      if (!bucket) { bucket = { month: m, items: [] }; g.push(bucket); }
      bucket.items.push(e);
    }
    return g;
  }, [filtered]);

  const brandOf = (id: number) => brands.find(b => b.id === id);

  const [newEv, setNewEv] = useState<{ brand_id: string; event_type: EventType; title: string; date: string; end_date: string; product_name: string; quantity: string; status: string; note: string }>(
    { brand_id: "", event_type: "stock", title: "", date: "", end_date: "", product_name: "", quantity: "", status: "", note: "" });
  const [showAdd, setShowAdd] = useState(false);
  async function addEvent() {
    if (!newEv.brand_id || !newEv.title || !newEv.date) return;
    const body = { ...newEv, brand_id: Number(newEv.brand_id), quantity: newEv.quantity ? Number(newEv.quantity) : null, end_date: newEv.end_date || null };
    const d = await fetch("/api/timeline-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    if (d.ok) { setEvents(prev => [...prev, d.event]); setNewEv({ brand_id: "", event_type: "stock", title: "", date: "", end_date: "", product_name: "", quantity: "", status: "", note: "" }); setShowAdd(false); }
    else setMsg(d.error || "Couldn't add.");
  }
  async function removeEvent(id: number) {
    if (!confirm("Remove this event?")) return;
    const d = await fetch(`/api/timeline-events?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) setEvents(prev => prev.filter(e => e.id !== id));
  }
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  async function uploadImage(id: number, file: File) {
    setUploadingId(id);
    const fd = new FormData(); fd.append("file", file); fd.append("id", String(id));
    const d = await fetch("/api/timeline-events/image", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setUploadingId(null);
    if (d?.ok) setEvents(prev => prev.map(e => e.id === id ? { ...e, image_url: d.url } : e));
    else setMsg(d?.error || "Couldn't upload the photo.");
  }

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_timeline_events.sql</code> to enable the Timeline.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className={inp + " bg-white"}>
          <option value="all">All brands</option>
          {live.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex gap-1.5">
          {(["all", "stock", "launch", "coming_soon"] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${typeFilter === t ? "text-white border-transparent" : "text-gray-500 border-gray-200 bg-white hover:border-gray-300"}`}
              style={typeFilter === t ? { background: t === "all" ? "#132741" : TYPE_META[t].color } : undefined}>
              {t === "all" ? "All" : `${TYPE_META[t].icon} ${TYPE_META[t].label}`}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-400 flex items-center gap-1.5 ml-1"><input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />Show past</label>
        {admin && <button onClick={() => setShowAdd(v => !v)} className="ml-auto text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showAdd ? "Close" : "+ Add event"}</button>}
      </div>
      {msg && <p className="text-xs text-rose-500">{msg}</p>}

      {showAdd && admin && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 space-y-2.5">
          <div className="grid sm:grid-cols-2 gap-2.5">
            <select value={newEv.brand_id} onChange={e => setNewEv(p => ({ ...p, brand_id: e.target.value }))} className={inp}>
              <option value="">Select brand…</option>
              {live.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={newEv.event_type} onChange={e => setNewEv(p => ({ ...p, event_type: e.target.value as EventType }))} className={inp}>
              {(["stock", "launch", "coming_soon"] as const).map(t => <option key={t} value={t}>{TYPE_META[t].icon} {TYPE_META[t].label}</option>)}
            </select>
          </div>
          <input value={newEv.title} onChange={e => setNewEv(p => ({ ...p, title: e.target.value }))} placeholder="Title (e.g. MINU V3 Stroller — new colourway)" className={inp + " w-full"} />
          <div className="grid sm:grid-cols-4 gap-2.5">
            <input type="date" value={newEv.date} onChange={e => setNewEv(p => ({ ...p, date: e.target.value }))} className={inp} />
            <input type="date" value={newEv.end_date} onChange={e => setNewEv(p => ({ ...p, end_date: e.target.value }))} placeholder="End (optional)" className={inp} />
            <input value={newEv.quantity} onChange={e => setNewEv(p => ({ ...p, quantity: e.target.value }))} placeholder="Qty (optional)" inputMode="numeric" className={inp} />
            <input value={newEv.status} onChange={e => setNewEv(p => ({ ...p, status: e.target.value }))} placeholder="Status (e.g. Confirmed)" className={inp} />
          </div>
          <input value={newEv.product_name} onChange={e => setNewEv(p => ({ ...p, product_name: e.target.value }))} placeholder="Product name (optional)" className={inp + " w-full"} />
          <textarea value={newEv.note} onChange={e => setNewEv(p => ({ ...p, note: e.target.value }))} rows={2} placeholder="Note (optional)" className={inp + " w-full"} />
          <button onClick={addEvent} disabled={!newEv.brand_id || !newEv.title || !newEv.date} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">Add to timeline</button>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">Nothing on the timeline yet.</div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-100" />
          {grouped.map(group => (
            <div key={group.month} className="mb-8 last:mb-0">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 -ml-6 pl-0">{group.month}</p>
              <div className="space-y-3">
                {group.items.map(e => {
                  const meta = TYPE_META[e.event_type];
                  const brand = brandOf(e.brand_id);
                  const isPast = (e.end_date || e.date) < today;
                  return (
                    <div key={e.id} className="relative">
                      <span className="absolute -left-6 top-4 w-4 h-4 rounded-full border-4 border-white shadow" style={{ background: meta.color }} />
                      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex ${isPast ? "opacity-60" : ""}`}>
                        {e.image_url && <img src={e.image_url} alt={e.title} className="w-28 h-28 object-cover shrink-0" />}
                        <div className="flex-1 min-w-0 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.icon} {meta.label}</span>
                                {brand && <span className="text-[11px] font-semibold" style={{ color: brand.color ?? "#64748b" }}>{brand.name}</span>}
                                {e.status && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{e.status}</span>}
                              </div>
                              <p className="font-semibold text-slate-800 mt-1.5">{e.title}</p>
                              {e.product_name && <p className="text-xs text-gray-500 mt-0.5">{e.product_name}{e.quantity != null ? ` · ${e.quantity.toLocaleString()} units` : ""}</p>}
                              {e.note && <p className="text-xs text-gray-400 mt-1 whitespace-pre-line">{e.note}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-slate-800 leading-none">{fmtD(e.date)}</p>
                              {e.end_date && <p className="text-[11px] text-gray-400 mt-1">– {fmtD(e.end_date)}</p>}
                            </div>
                          </div>
                          {admin && (
                            <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-gray-50">
                              <label className="text-[11px] font-semibold text-amber-600 hover:underline cursor-pointer">
                                {uploadingId === e.id ? "Uploading…" : e.image_url ? "Change photo" : "+ Add photo"}
                                <input type="file" accept="image/*" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) uploadImage(e.id, f); ev.currentTarget.value = ""; }} />
                              </label>
                              <button onClick={() => removeEvent(e.id)} className="text-[11px] font-semibold text-rose-500 hover:underline">Remove</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
