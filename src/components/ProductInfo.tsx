"use client";

import { useEffect, useState } from "react";

type Sheet = { id: string; brand_name: string; html_url: string | null; pdf_url: string | null; last_updated: string; version: string; status: string; created_at: string };
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function ProductInfo({ brandNames = [], admin = false }: { brandNames?: string[]; admin?: boolean }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  // upload form
  const [brand, setBrand] = useState(brandNames[0] ?? "");
  const [version, setVersion] = useState("1");
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const r = await fetch(`/api/fact-sheets?all=${showArchived ? 1 : 0}`, { cache: "no-store" }).then(x => x.json()).catch(() => ({ ok: false }));
    if (r.needsSetup) { setState("needsSetup"); return; }
    if (!r.ok) { setState("error"); return; }
    setSheets(r.sheets || []); setState("ready");
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showArchived]);

  async function upload() {
    if (!brand || (!htmlFile && !pdfFile)) { setErr("Pick a brand and attach the HTML and/or PDF."); return; }
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.set("brand_name", brand); fd.set("version", version);
    if (htmlFile) fd.set("html", htmlFile);
    if (pdfFile) fd.set("pdf", pdfFile);
    const r = await fetch("/api/fact-sheets", { method: "POST", body: fd }).then(x => x.json()).catch(() => ({ ok: false, error: "Upload failed" }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Upload failed"); return; }
    setAdding(false); setHtmlFile(null); setPdfFile(null); setVersion("1"); load();
  }
  async function remove(id: string, brandName: string) {
    if (!window.confirm(`Remove this fact sheet (${brandName})?`)) return;
    await fetch(`/api/fact-sheets?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const current = sheets.filter(s => s.status === "current");
  const archived = sheets.filter(s => s.status === "archived");

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_product_fact_sheets.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load fact sheets.</div>;

  const Row = ({ s }: { s: Sheet }) => (
    <tr className="hover:bg-slate-50/50">
      <td className="px-4 py-3 font-medium text-slate-700">{s.brand_name}{s.status === "archived" && <span className="ml-2 text-[10px] font-semibold text-gray-400 uppercase">archived</span>}</td>
      <td className="px-4 py-3 text-slate-500">{fmtDate(s.last_updated)}</td>
      <td className="px-4 py-3 text-slate-500">v{s.version}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {s.html_url && <a href={s.html_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg px-3 py-1.5 hover:bg-teal-100 mr-2">Open</a>}
        {s.pdf_url && <a href={s.pdf_url} target="_blank" rel="noopener noreferrer" download className="text-xs font-semibold text-slate-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 mr-2">Download PDF</a>}
        {admin && <button onClick={() => remove(s.id, s.brand_name)} className="text-xs text-rose-400 hover:underline">Delete</button>}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-gray-400">{current.length} brand fact sheet{current.length === 1 ? "" : "s"}</p>
        <label className="text-[11px] text-gray-400 flex items-center gap-1 ml-2"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> show archived versions</label>
        {admin && <button onClick={() => setAdding(a => !a)} className="ml-auto text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">{adding ? "Close" : "+ Upload fact sheet"}</button>}
      </div>

      {adding && admin && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Upload / update a fact sheet</h3>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Brand</label>
              <select value={brand} onChange={e => setBrand(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">{brandNames.map(b => <option key={b}>{b}</option>)}</select></div>
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
            <button onClick={upload} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Uploading…" : "Save fact sheet"}</button>
          </div>
          <p className="text-[11px] text-gray-400">Uploading a new sheet for a brand archives the previous version. Files up to 20MB each.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
            <tr><th className="text-left font-semibold px-4 py-3">Brand</th><th className="text-left font-semibold px-4 py-3">Last updated</th><th className="text-left font-semibold px-4 py-3">Version</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {current.map(s => <Row key={s.id} s={s} />)}
            {showArchived && archived.map(s => <Row key={s.id} s={s} />)}
            {current.length === 0 && !showArchived && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-300">No fact sheets uploaded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
