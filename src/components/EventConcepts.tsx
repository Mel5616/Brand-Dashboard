"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Plan > Event Concepts: event ideas with uploaded concept documents.
// Any signed-in user with the tab can create/upload; delete is admin-only.
type Concept = { id: number; title: string; brand: string | null; event_date: string | null; location: string | null; status: string; note: string | null; created_by: string | null; created_at: string };
type CFile = { id: number; concept_id: number; file_url: string; file_name: string; uploaded_by: string | null; created_at: string; content_html?: string | null };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const STATUS: Record<string, { label: string; cls: string }> = {
  concept: { label: "Concept", cls: "bg-violet-100 text-violet-700" },
  pitched: { label: "Pitched", cls: "bg-sky-100 text-sky-700" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  planning: { label: "In planning", cls: "bg-amber-100 text-amber-700" },
  locked: { label: "Locked in", cls: "bg-teal-100 text-teal-700" },
  done: { label: "Done", cls: "bg-slate-200 text-slate-600" },
  parked: { label: "Parked", cls: "bg-gray-100 text-gray-400" },
};
const fmtD = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null;
const docIcon = (name: string) => /\.pdf$/i.test(name) ? "📄" : /\.(docx?|pages)$/i.test(name) ? "📝" : /\.(pptx?|key)$/i.test(name) ? "📊" : /\.(xlsx?|csv|numbers)$/i.test(name) ? "📈" : /\.(png|jpe?g|webp|heic)$/i.test(name) ? "🖼" : "📎";

export function EventConcepts({ brands, admin = false }: { brands: { name: string; color?: string }[]; admin?: boolean }) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [files, setFiles] = useState<CFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [brandF, setBrandF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = { title: "", brand: "", event_date: "", location: "", note: "" };
  const [f, setF] = useState<Record<string, string>>(empty);
  const newFilesRef = useRef<HTMLInputElement>(null);
  const addRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Spec-sheet viewer: concept + the brief's converted HTML
  const [sheet, setSheet] = useState<{ concept: Concept; file: CFile; html: string } | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  async function openSheet(concept: Concept, file: CFile) {
    if (file.content_html) { setSheet({ concept, file, html: file.content_html }); return; }
    setConvertingId(file.id);
    const d = await fetch("/api/event-concepts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "convert", fileId: file.id }) }).then(r => r.json()).catch(() => null);
    setConvertingId(null);
    if (d?.ok) {
      setFiles(prev => prev.map(x => x.id === file.id ? { ...x, content_html: d.html } : x));
      setSheet({ concept, file, html: d.html });
    } else setMsg(d?.error || "Couldn't open the brief — use the download link instead.");
  }

  function load() {
    fetch("/api/event-concepts").then(r => r.json()).then(d => {
      if (d?.needsSetup) setNeedsSetup(true);
      else if (d?.ok) { setConcepts(d.concepts ?? []); setFiles(d.files ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const list = useMemo(() => concepts.filter(c =>
    (!brandF || c.brand === brandF) && (!statusF || c.status === statusF)), [concepts, brandF, statusF]);
  const filesFor = (id: number) => files.filter(x => x.concept_id === id);
  const colorOf = (name: string | null) => brands.find(b => b.name === name)?.color ?? "#94a3b8";

  async function create() {
    setMsg(""); setBusy(true);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    for (const file of Array.from(newFilesRef.current?.files ?? [])) fd.append("files", file);
    const d = await fetch("/api/event-concepts", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setShowForm(false); setF(empty); if (newFilesRef.current) newFilesRef.current.value = "";
      load(); setMsg(d.fileError ? `Saved, but a file failed: ${d.fileError}` : "Event concept saved.");
    } else setMsg(d?.error || "Couldn't save the concept.");
  }
  async function addFiles(id: number, fl: FileList | null) {
    if (!fl || fl.length === 0) return;
    setMsg(""); setBusy(true);
    const fd = new FormData();
    fd.append("concept_id", String(id));
    for (const file of Array.from(fl)) fd.append("files", file);
    const d = await fetch("/api/event-concepts", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { load(); setMsg(`Added ${d.added} file${d.added === 1 ? "" : "s"}.`); }
    else setMsg(d?.error || "Upload failed.");
  }
  async function setStatus(id: number, status: string) {
    setConcepts(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    await fetch("/api/event-concepts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => {});
  }
  async function del(id: number, title: string) {
    if (!confirm(`Delete "${title}" and its documents?`)) return;
    await fetch(`/api/event-concepts?id=${id}`, { method: "DELETE" });
    load();
  }
  async function delFile(fileId: number) {
    await fetch(`/api/event-concepts?fileId=${fileId}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="p-6 text-center text-sm text-gray-400">Loading event concepts…</div>;

  const SheetModal = sheet && (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={() => setSheet(null)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        <div className="bg-[#132741] rounded-t-2xl px-7 py-5 flex items-start justify-between gap-3 sticky top-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Event brief · {sheet.concept.brand ?? "Coolkidz"}</p>
            <h2 className="text-white text-xl font-bold mt-0.5">{sheet.concept.title}</h2>
            <p className="text-[12px] text-slate-300 mt-0.5">{[fmtD(sheet.concept.event_date), sheet.concept.location].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => window.print()} className="text-[12px] font-semibold text-white/80 hover:text-white border border-white/25 rounded-lg px-2.5 py-1.5">Print</button>
            <a href={sheet.file.file_url} className="text-[12px] font-semibold text-white/80 hover:text-white border border-white/25 rounded-lg px-2.5 py-1.5">Word ⬇</a>
            <button onClick={() => setSheet(null)} className="text-white/70 hover:text-white text-xl leading-none ml-1">✕</button>
          </div>
        </div>
        <div className="px-7 py-6 text-[14px] leading-relaxed text-slate-700
          [&_h1]:text-[19px] [&_h1]:font-bold [&_h1]:text-slate-800 [&_h1]:mt-6 [&_h1]:mb-2 first:[&_h1]:mt-0
          [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:mt-5 [&_h2]:mb-1.5
          [&_h3]:text-[14px] [&_h3]:font-bold [&_h3]:text-slate-700 [&_h3]:mt-4 [&_h3]:mb-1
          [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-0.5
          [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-[13px]
          [&_th]:border [&_th]:border-gray-200 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:bg-slate-50 [&_th]:text-[12px] [&_th]:font-bold
          [&_a]:text-emerald-600 [&_a]:underline [&_strong]:text-slate-800 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-3"
          dangerouslySetInnerHTML={{ __html: sheet.html }} />
      </div>
    </div>
  );
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_event_concepts.sql</code> to enable event concepts.</div>;

  return (
    <div className="space-y-4">
      {SheetModal}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowForm(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showForm ? "Close" : "+ New event concept"}</button>
        <select value={brandF} onChange={e => setBrandF(e.target.value)} className={inp}>
          <option value="">All brands</option>
          {[...new Set(concepts.map(c => c.brand).filter(Boolean))].sort().map(b => <option key={b as string}>{b}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className={inp}>
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="ml-auto text-[12px] text-gray-400">{list.length} concept{list.length === 1 ? "" : "s"}</span>
      </div>
      {msg && <p className="text-[13px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-3">New event concept</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="Event name *" className={`${inp} lg:col-span-2`} />
            <select value={f.brand} onChange={e => setF(p => ({ ...p, brand: e.target.value }))} className={inp}>
              <option value="">Brand (optional)</option>
              {brands.map(b => <option key={b.name}>{b.name}</option>)}
              <option>All brands</option>
            </select>
            <input type="date" value={f.event_date} onChange={e => setF(p => ({ ...p, event_date: e.target.value }))} className={inp} />
            <input value={f.location} onChange={e => setF(p => ({ ...p, location: e.target.value }))} placeholder="Location (optional)" className={inp} />
            <input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} placeholder="One-line summary (optional)" className={inp} />
          </div>
          <div className="mt-3">
            <label className="text-[12px] font-semibold text-slate-600 block mb-1">Concept documents (PDF, Word, slides — up to 25MB each)</label>
            <input ref={newFilesRef} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.key,.pages,.xls,.xlsx,.png,.jpg,.jpeg" className="text-sm text-slate-600" />
          </div>
          <button onClick={create} disabled={busy} className="mt-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Saving…" : "Save concept"}</button>
        </div>
      )}

      {list.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 text-center text-gray-300 text-sm">No event concepts yet — add the first one above.</div>}

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {list.map(c => {
          const st = STATUS[c.status] ?? STATUS.concept;
          const cf = filesFor(c.id);
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-slate-800">{c.title}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">
                    {c.brand && <span className="inline-flex items-center gap-1.5 mr-2"><span className="w-2 h-2 rounded-full" style={{ background: colorOf(c.brand) }} />{c.brand}</span>}
                    {[fmtD(c.event_date), c.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <select value={c.status} onChange={e => setStatus(c.id, e.target.value)}
                  className={`shrink-0 text-[11px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer ${st.cls}`}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {c.note && <p className="text-[13px] text-slate-600 mt-2 leading-relaxed">{c.note}</p>}
              <div className="mt-3 space-y-1">
                {cf.map(x => {
                  const isDocx = /\.docx$/i.test(x.file_name);
                  return (
                    <div key={x.id} className="flex items-center gap-2 group">
                      {isDocx ? (
                        <button onClick={() => openSheet(c, x)} disabled={convertingId === x.id}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left text-[13px] font-semibold text-emerald-700 hover:underline truncate disabled:opacity-60">
                          <span>📋</span><span className="truncate">{convertingId === x.id ? "Opening brief…" : `Open brief · ${x.file_name.replace(/[-_]/g, " ").replace(/\.docx$/i, "")}`}</span>
                        </button>
                      ) : (
                        <a href={x.file_url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-slate-600 hover:text-emerald-700 hover:underline truncate">
                          <span>{docIcon(x.file_name)}</span><span className="truncate">{x.file_name}</span>
                        </a>
                      )}
                      {isDocx && <a href={x.file_url} className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-gray-600 shrink-0" title="Download the original Word file">⬇</a>}
                      {admin && <button onClick={() => delFile(x.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 text-xs">✕</button>}
                    </div>
                  );
                })}
                {cf.length === 0 && <p className="text-[12px] text-gray-300">No documents yet.</p>}
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-gray-50 pt-2.5">
                <label className="text-[12px] font-semibold text-emerald-600 hover:underline cursor-pointer">
                  ＋ Add document
                  <input ref={el => { addRefs.current[c.id] = el; }} type="file" multiple className="hidden"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.key,.pages,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={e => { addFiles(c.id, e.target.files); e.target.value = ""; }} />
                </label>
                <span className="text-[11px] text-gray-300">{c.created_by ? `added by ${c.created_by.split("@")[0]}` : ""}</span>
                {admin && <button onClick={() => del(c.id, c.title)} className="ml-auto text-[12px] text-gray-300 hover:text-rose-500">Delete</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
