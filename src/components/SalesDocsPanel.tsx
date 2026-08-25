"use client";

// Retailer Hub document library panel — one component drives Price Lists, Brand
// Overviews and Trading Terms (category prop). Upload a self-contained HTML
// and/or PDF per brand (new version archives the old), then send to a customer
// with open tracking via HubSendModal. Mirrors ProductInfo's chunked upload.
import { useEffect, useState } from "react";
import { HubSendModal, SendRow, type SendItem } from "./HubSendModal";

type Doc = { id: string; category: string; brand_name: string | null; title: string; version: string; html_url: string | null; pdf_url: string | null; status: string; created_at: string };
type Category = "price_list" | "brand_overview" | "terms";

const COPY: Record<Category, { noun: string; empty: string; hint: string }> = {
  price_list: { noun: "price list", empty: "No price lists uploaded yet.", hint: "Upload each brand's wholesale price list (self-contained HTML and/or PDF). Uploading again for the same brand archives the previous version." },
  brand_overview: { noun: "brand overview", empty: "No brand overviews uploaded yet.", hint: "Upload each brand's overview / sell-in document. Uploading again for the same brand archives the previous version." },
  terms: { noun: "terms document", empty: "No trading terms uploaded yet.", hint: "Upload your standard trading terms. Leave brand blank for the company-wide document; uploading again archives the previous version." },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function SalesDocsPanel({ category, brandNames, canEdit, admin }: { category: Category; brandNames: string[]; canEdit: boolean; admin: boolean }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [showArchived, setShowArchived] = useState(false);
  const [showSends, setShowSends] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sendDoc, setSendDoc] = useState<Doc | null>(null);
  // upload form
  const [brand, setBrand] = useState(category === "terms" ? "" : brandNames[0] ?? "");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1");
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const r = await fetch(`/api/sales-docs?category=${category}&all=${showArchived ? 1 : 0}`, { cache: "no-store" }).then(x => x.json()).catch(() => ({ ok: false }));
    if (r.needsSetup) { setState("needsSetup"); return; }
    if (!r.ok) { setState("error"); return; }
    setDocs(r.docs || []); setState("ready");
  }
  async function loadSends() {
    const r = await fetch(`/api/hub-send?kind=${category}`, { cache: "no-store" }).then(x => x.json()).catch(() => ({ ok: false }));
    if (r.ok) setSends(r.sends || []);
  }
  useEffect(() => { load(); loadSends(); /* eslint-disable-next-line */ }, [showArchived, category]);

  async function upload() {
    if (!title.trim() || (!htmlFile && !pdfFile)) { setErr("Give it a title and attach the HTML and/or PDF."); return; }
    for (const f of [htmlFile, pdfFile]) if (f && f.size > 20 * 1024 * 1024) { setErr(`${f.name} is over 20MB.`); return; }
    setBusy(true); setErr("");
    const CHUNK = 3 * 1024 * 1024;
    const DIRECT_MAX = 1.5 * 1024 * 1024;
    const uploadId = crypto.randomUUID();

    async function chunkUpload(file: File, slot: "html" | "pdf"): Promise<number> {
      const parts = Math.ceil(file.size / CHUNK);
      for (let i = 0; i < parts; i++) {
        setErr(`Uploading ${slot.toUpperCase()}… part ${i + 1} of ${parts}`);
        const fd = new FormData();
        fd.append("action", "part"); fd.append("upload_id", uploadId); fd.append("slot", slot); fd.append("seq", String(i));
        fd.append("part", file.slice(i * CHUNK, (i + 1) * CHUNK));
        const r = await fetch("/api/sales-docs", { method: "POST", body: fd }).then(x => x.json()).catch(() => null);
        if (!r?.ok) throw new Error(r?.error || `Upload failed at ${slot} part ${i + 1} — try again.`);
      }
      return parts;
    }

    try {
      const fd = new FormData();
      fd.set("action", "finish"); fd.set("upload_id", uploadId);
      fd.set("category", category); fd.set("brand_name", category === "terms" ? "" : brand); fd.set("title", title.trim()); fd.set("version", version);
      if (htmlFile) { if (htmlFile.size <= DIRECT_MAX) fd.set("html", htmlFile); else fd.set("html_parts", String(await chunkUpload(htmlFile, "html"))); }
      if (pdfFile) { if (pdfFile.size <= DIRECT_MAX) fd.set("pdf", pdfFile); else fd.set("pdf_parts", String(await chunkUpload(pdfFile, "pdf"))); }
      setErr("Assembling…");
      const r = await fetch("/api/sales-docs", { method: "POST", body: fd }).then(x => x.json()).catch(() => ({ ok: false, error: "Upload failed" }));
      if (!r.ok) { setErr(r.error || "Upload failed"); setBusy(false); return; }
      setAdding(false); setHtmlFile(null); setPdfFile(null); setTitle(""); setVersion("1"); setErr(""); load();
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Doc) {
    if (!window.confirm(`Remove "${d.title}"?`)) return;
    await fetch(`/api/sales-docs?id=${d.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this link? The recipient's link will stop working.")) return;
    await fetch(`/api/hub-send?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadSends();
  }

  const c = COPY[category];
  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_retailer_hub.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load.</div>;

  const shown = showArchived ? docs : docs.filter(d => d.status === "current");
  const groups = category === "terms" ? [null] : Array.from(new Set(shown.map(d => d.brand_name))).sort((a, b) => String(a).localeCompare(String(b)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-gray-400">{shown.filter(d => d.status === "current").length} current {c.noun}{shown.filter(d => d.status === "current").length === 1 ? "" : "s"}</p>
        <label className="text-[11px] text-gray-400 flex items-center gap-1 ml-2"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> show archived</label>
        <button onClick={() => setShowSends(s => !s)} className="text-[11px] font-semibold text-sky-600 hover:underline ml-2">{showSends ? "Hide" : "Show"} sent &amp; tracked ({sends.length})</button>
        {canEdit && <button onClick={() => setAdding(a => !a)} className="ml-auto text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">{adding ? "Close" : `+ Upload ${c.noun}`}</button>}
      </div>

      {showSends && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Sent &amp; tracked</h3>
          {sends.length === 0 ? <p className="text-sm text-slate-300 py-2">Nothing sent yet.</p> : sends.map(s => <SendRow key={s.id} s={s} admin={admin} onRevoke={revoke} />)}
        </div>
      )}

      {adding && canEdit && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Upload a {c.noun}</h3>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            {category !== "terms" && (
              <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Brand</label>
                <select value={brand} onChange={e => setBrand(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">{brandNames.map(b => <option key={b}>{b}</option>)}</select></div>
            )}
            <div className={category === "terms" ? "md:col-span-2" : ""}><label className="text-[10px] font-semibold text-slate-400 uppercase">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={category === "terms" ? "Trading Terms & Conditions" : `${brand || "Brand"} ${category === "price_list" ? "Price List" : "Brand Overview"}`} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Version</label>
              <input value={version} onChange={e => setVersion(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">HTML file (self-contained)</label>
              <input type="file" accept=".html,text/html" onChange={e => setHtmlFile(e.target.files?.[0] ?? null)} className="w-full text-xs" /></div>
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">PDF file</label>
              <input type="file" accept="application/pdf,.pdf" onChange={e => setPdfFile(e.target.files?.[0] ?? null)} className="w-full text-xs" /></div>
          </div>
          {err && <p className="text-[13px] text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
            <button onClick={upload} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Uploading…" : "Save"}</button>
          </div>
          <p className="text-[11px] text-gray-400">{c.hint} Files up to 20MB each.</p>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">{c.empty}</div>
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <div key={g ?? "company"}>
              {category !== "terms" && (
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{g}</span>
                  <span className="flex-1 h-px bg-slate-100" />
                </div>
              )}
              <div className="space-y-2">
                {shown.filter(d => (category === "terms" ? true : d.brand_name === g)).map(d => {
                  const docSends = sends.filter(s => s.doc_id === d.id);
                  const opens = docSends.reduce((t, s) => t + (s.open_count || 0), 0);
                  return (
                    <div key={d.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{d.title}</p>
                        <p className="text-[11.5px] text-slate-400">v{d.version} · {fmtDate(d.created_at)}{d.status === "archived" ? " · archived" : ""}{docSends.length > 0 ? ` · sent ${docSends.length}× · ${opens} open${opens === 1 ? "" : "s"}` : ""}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-3 text-[12.5px] font-semibold">
                        {d.html_url && <a href={d.html_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">Preview</a>}
                        {d.pdf_url && <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">PDF</a>}
                        {d.status === "current" && <button onClick={() => setSendDoc(d)} className="text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-3 py-1.5">Send →</button>}
                        {canEdit && <button onClick={() => remove(d)} className="text-rose-400 hover:underline font-normal">Delete</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {sendDoc && (
        <HubSendModal
          items={[{ kind: category, id: sendDoc.id, title: sendDoc.title, brand: sendDoc.brand_name } as SendItem]}
          onClose={() => setSendDoc(null)}
          onSent={loadSends}
        />
      )}
    </div>
  );
}
