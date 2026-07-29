"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Plan > Launch Decks: HTML strategy decks with per-recipient tracked share
// links — who opened, how many times, how long they actually looked. Admin-only.
type Deck = { id: number; title: string; brand: string | null; pdfUrl?: string | null; created_by: string | null; created_at: string };
type Share = { id: number; deck_id: number; token: string; label: string; created_at: string };
type View = { share_id: number; session_id: string; viewer: string | null; seconds: number; opened_at: string; last_seen: string };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};
const mins = (sec: number) => sec >= 90 ? `${Math.round(sec / 60)}m` : `${sec}s`;

// The live deck rendered inside a laptop mockup: the screen is a scaled iframe
// of the real deck at desktop width, measured so any card width works.
function DeckThumb({ token }: { token: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(384);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const upd = () => setW(el.clientWidth || 384);
    upd();
    const ro = new ResizeObserver(upd); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const screenW = Math.max(200, w - 96);
  const scale = screenW / 1280;
  return (
    <div ref={ref} className="bg-gradient-to-b from-slate-100 to-slate-200 pt-5 px-4 flex flex-col items-center">
      {/* lid + bezel */}
      <div className="rounded-t-xl rounded-b-[3px] bg-slate-900 p-[7px] pb-[9px] shadow-xl" style={{ width: screenW + 14 }}>
        <div className="mx-auto mb-1 w-1.5 h-1.5 rounded-full bg-slate-700" />
        <div className="relative overflow-hidden bg-white rounded-[3px]" style={{ width: screenW, height: screenW * 0.625 }}>
          <iframe src={`/deck/${token}?preview=1`} loading="lazy" tabIndex={-1} aria-hidden scrolling="no"
            style={{ width: 1280, height: 800, transform: `scale(${scale})`, transformOrigin: "top left" }}
            className="absolute top-0 left-0 pointer-events-none border-0" />
        </div>
      </div>
      {/* base */}
      <div className="rounded-b-lg bg-gradient-to-b from-slate-300 to-slate-400 h-[7px]" style={{ width: screenW + 58 }}>
        <div className="mx-auto w-16 h-[3px] rounded-b bg-slate-400/80" />
      </div>
      <div className="h-4" />
    </div>
  );
}

export function LaunchDecks({ brands }: { brands: { name: string }[] }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [newLabel, setNewLabel] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);

  function load() {
    fetch("/api/decks").then(r => r.json()).then(d => {
      if (d?.needsSetup) setNeedsSetup(true);
      else if (d?.ok) { setDecks(d.decks ?? []); setShares(d.shares ?? []); setViews(d.views ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const statFor = useMemo(() => {
    const m = new Map<number, { opens: number; seconds: number; last: string | null; viewers: string[] }>();
    for (const v of views) {
      const cur = m.get(v.share_id) ?? { opens: 0, seconds: 0, last: null, viewers: [] };
      cur.opens += 1; cur.seconds += v.seconds || 0;
      if (!cur.last || v.last_seen > cur.last) cur.last = v.last_seen;
      if (v.viewer && !cur.viewers.includes(v.viewer)) cur.viewers.push(v.viewer);
      m.set(v.share_id, cur);
    }
    return m;
  }, [views]);

  async function create() {
    setMsg("");
    if (!title.trim()) { setMsg("Give the deck a title."); return; }
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg("Attach the deck's HTML file."); return; }
    if (file.size > 40 * 1024 * 1024) { setMsg("That's over 40MB — send it to Mel to slim down first."); return; }
    setBusy(true);
    let d: any = null;
    const CHUNK = 3 * 1024 * 1024;
    if (file.size <= CHUNK) {
      const fd = new FormData();
      fd.append("title", title); fd.append("brand", brand); fd.append("file", file);
      d = await fetch("/api/decks", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    } else {
      // Big deck: upload in ~3MB parts (Vercel rejects bodies over ~4.5MB), then assemble.
      const uploadId = crypto.randomUUID();
      const parts = Math.ceil(file.size / CHUNK);
      for (let i = 0; i < parts; i++) {
        setMsg(`Uploading… part ${i + 1} of ${parts}`);
        const fd = new FormData();
        fd.append("action", "part"); fd.append("upload_id", uploadId); fd.append("seq", String(i));
        fd.append("part", file.slice(i * CHUNK, (i + 1) * CHUNK));
        const r = await fetch("/api/decks", { method: "POST", body: fd }).then(x => x.json()).catch(() => null);
        if (!r?.ok) { setBusy(false); setMsg(r?.error || `Upload failed at part ${i + 1} — try again.`); return; }
      }
      setMsg("Assembling deck…");
      const fd = new FormData();
      fd.append("action", "finish"); fd.append("upload_id", uploadId); fd.append("parts", String(parts));
      fd.append("title", title); fd.append("brand", brand);
      d = await fetch("/api/decks", { method: "POST", body: fd }).then(x => x.json()).catch(() => null);
    }
    setBusy(false);
    if (d?.ok) { setShowForm(false); setTitle(""); setBrand(""); if (fileRef.current) fileRef.current.value = ""; load(); setMsg("Deck loaded — a Team share link is ready."); }
    else setMsg(d?.error || "Couldn't load the deck.");
  }
  async function addShare(deckId: number) {
    const label = (newLabel[deckId] || "").trim();
    if (!label) { setMsg("Name the link — who's it for? e.g. Baby Bunting · Sarah"); return; }
    const d = await fetch("/api/decks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share.create", deck_id: deckId, label }) }).then(r => r.json()).catch(() => null);
    if (d?.ok) { setNewLabel(p => ({ ...p, [deckId]: "" })); load(); }
    else setMsg(d?.error || "Couldn't create the link.");
  }
  async function delShare(shareId: number) {
    if (!confirm("Revoke this link? Anyone holding it loses access; its view history is removed.")) return;
    await fetch("/api/decks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share.delete", share_id: shareId }) });
    load();
  }
  async function delDeck(d: Deck) {
    if (!confirm(`Delete "${d.title}" and all its links + view history?`)) return;
    await fetch(`/api/decks?id=${d.id}`, { method: "DELETE" });
    load();
  }
  const copy = (token: string) => { navigator.clipboard?.writeText(`${window.location.origin}/deck/${token}`); setMsg("Link copied."); };

  if (loading) return <div className="p-6 text-center text-sm text-gray-400">Loading decks…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_decks.sql</code> to enable launch decks.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowForm(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showForm ? "Close" : "+ Load a deck"}</button>
        <span className="text-[12px] text-gray-400">Send Mel your PowerPoint — it comes back as a branded HTML deck to load here with tracked links.</span>
      </div>
      {msg && <p className="text-[13px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-3">Load a deck</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Deck title *" className={`${inp} lg:col-span-2`} />
            <select value={brand} onChange={e => setBrand(e.target.value)} className={inp}>
              <option value="">Brand (optional)</option>
              {brands.map(b => <option key={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div className="mt-3">
            <label className="text-[12px] font-semibold text-slate-600 block mb-1">Deck HTML file *</label>
            <input ref={fileRef} type="file" accept=".html,.htm" className="text-sm text-slate-600" />
          </div>
          <button onClick={create} disabled={busy} className="mt-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Loading…" : "Load deck"}</button>
        </div>
      )}

      {decks.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 text-center text-gray-300 text-sm">No decks yet.</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {decks.map(d => {
        const dShares = shares.filter(s => s.deck_id === d.id);
        const opens = dShares.reduce((s, x) => s + (statFor.get(x.id)?.opens ?? 0), 0);
        const secs = dShares.reduce((s, x) => s + (statFor.get(x.id)?.seconds ?? 0), 0);
        const isOpen = open === d.id;
        const firstToken = dShares[0]?.token;
        return (
          <div key={d.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${isOpen ? "sm:col-span-2 xl:col-span-3" : ""}`}>
            {/* Live top-of-deck preview (scaled iframe, ?preview=1 so it never counts as an open) */}
            {firstToken && (
              <a href={`/deck/${firstToken}`} target="_blank" rel="noreferrer" className="block relative group">
                <DeckThumb token={firstToken} />
                <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-[13px] font-bold bg-slate-900/70 rounded-full px-4 py-2">Open deck →</span>
                </span>
              </a>
            )}
            <div className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-50">
              <button onClick={() => setOpen(isOpen ? null : d.id)} className="min-w-0 flex-1 text-left hover:opacity-80">
                <span className="block text-[14.5px] font-bold text-slate-800 truncate">{d.title}</span>
                <span className="block text-[11.5px] text-gray-400">{[d.brand, `${dShares.length} link${dShares.length === 1 ? "" : "s"}`, `${opens} open${opens === 1 ? "" : "s"}`, secs > 0 ? `${mins(secs)} viewed` : null].filter(Boolean).join(" · ")}</span>
              </button>
              {d.pdfUrl && (
                <a href={d.pdfUrl} target="_blank" rel="noreferrer"
                  className="shrink-0 text-[11.5px] font-bold text-white bg-[#e2593c] hover:bg-[#c94c31] rounded-full px-3 py-1.5">⬇ PDF</a>
              )}
              <button onClick={() => setOpen(isOpen ? null : d.id)} className="shrink-0 text-[11px] font-semibold text-gray-400 hover:text-gray-600">{isOpen ? "Hide links ▾" : "Links & tracking ▸"}</button>
            </div>
            {isOpen && (
              <div className="px-5 pb-4 border-t border-gray-50">
                <table className="w-full text-sm mt-3">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="text-left py-1.5">Link · who it's for</th>
                      <th className="text-right py-1.5">Opens</th>
                      <th className="text-right py-1.5">Time viewed</th>
                      <th className="text-right py-1.5">Last opened</th>
                      <th className="text-right py-1.5">Viewers</th>
                      <th className="text-right py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dShares.map(s => {
                      const st = statFor.get(s.id);
                      return (
                        <tr key={s.id} className="border-t border-gray-50">
                          <td className="py-2 font-semibold text-slate-700">{s.label}</td>
                          <td className="py-2 text-right text-slate-600">{st?.opens ?? 0}</td>
                          <td className="py-2 text-right text-slate-600">{st ? mins(st.seconds) : "—"}</td>
                          <td className="py-2 text-right text-gray-400 text-[12px]">{st?.last ? ago(st.last) : "never"}</td>
                          <td className="py-2 text-right text-[11.5px] text-gray-400 max-w-[180px] truncate" title={st?.viewers.join(", ")}>{st?.viewers.length ? st.viewers.map(v => v.split("@")[0]).join(", ") : (st?.opens ? "external" : "—")}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <a href={`/deck/${s.token}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-violet-600 hover:underline mr-2">View</a>
                            <button onClick={() => copy(s.token)} className="text-[12px] font-semibold text-emerald-600 hover:underline mr-2">⧉ Copy</button>
                            <button onClick={() => delShare(s.id)} className="text-[12px] text-gray-300 hover:text-rose-500">Revoke</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-2.5 flex items-center gap-2">
                  <input value={newLabel[d.id] ?? ""} onChange={e => setNewLabel(p => ({ ...p, [d.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addShare(d.id)}
                    placeholder="New tracked link — who's it for? e.g. Baby Bunting · Sarah" className={`${inp} flex-1 max-w-md`} />
                  <button onClick={() => addShare(d.id)} className="text-[12.5px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">+ Link</button>
                  <button onClick={() => delDeck(d)} className="ml-auto text-[12px] text-gray-300 hover:text-rose-500">Delete deck</button>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Give each person or company their own link — that&apos;s how you know who opened it. Time counts only while the deck is actually on screen.</p>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
