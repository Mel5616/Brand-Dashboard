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

      {/* Per-product thumbnail previews, grouped by brand */}
      {(() => {
        const shown = showArchived ? [...current, ...archived] : current;
        if (shown.length === 0) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No fact sheets uploaded yet.</div>;
        const brands = Array.from(new Set(shown.map(s => s.brand_name))).sort();
        return (
          <div className="space-y-8">
            {brands.map(b => (
              <div key={b}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{b}</span>
                  <span className="flex-1 h-px bg-slate-100" />
                </div>
                {shown.filter(s => s.brand_name === b).map(s => (
                  <div key={s.id} className="mb-5">
                    <div className="flex flex-wrap items-center gap-3 text-[12px] text-gray-400 mb-2.5">
                      <span>v{s.version} · {fmtDate(s.last_updated)}{s.status === "archived" ? " · archived" : ""}</span>
                      {s.html_url && <a href={`/api/fact-sheets/view?id=${s.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 hover:underline">Open full sheet</a>}
                      {s.pdf_url && <a href={s.pdf_url} target="_blank" rel="noopener noreferrer" download className="font-semibold text-slate-500 hover:underline">PDF</a>}
                      {admin && <button onClick={() => remove(s.id, s.brand_name)} className="text-rose-400 hover:underline ml-auto">Delete</button>}
                    </div>
                    <SheetThumbs sheet={s} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// Splits a fact sheet's HTML into per-product page thumbnails. The sheet is one
// product per A4 .page; we isolate each page (with the shared <style>) and render
// it scaled into an iframe, with the product name (.pname) underneath.
function SheetThumbs({ sheet }: { sheet: Sheet }) {
  const [pages, setPages] = useState<{ name: string; html: string }[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!sheet.html_url) { setPages([]); return; }
    fetch(`/api/fact-sheets/view?id=${sheet.id}`).then(r => r.text()).then(txt => {
      if (!alive) return;
      try {
        const doc = new DOMParser().parseFromString(txt, "text/html");
        const styles = Array.from(doc.querySelectorAll("style")).map(s => s.outerHTML).join("");
        const ps = Array.from(doc.querySelectorAll(".page")).map(p => ({
          name: (p.querySelector(".pname")?.textContent || "").trim(),
          html: `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body style="margin:0">${(p as HTMLElement).outerHTML}</body></html>`,
        }));
        setPages(ps);
      } catch { setErr(true); }
    }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [sheet.id, sheet.html_url]);

  if (sheet.html_url && pages === null && !err) return <p className="text-xs text-gray-300 py-2">Loading previews…</p>;
  if (err) return <p className="text-xs text-gray-300 py-2">Couldn’t load previews{sheet.pdf_url ? " — PDF available above." : "."}</p>;
  if (pages && pages.length === 0) return <p className="text-xs text-gray-300 py-2">No page previews{sheet.pdf_url ? " (PDF available above)." : "."}</p>;

  return (
    <div className="flex flex-wrap gap-4">
      {pages!.map((pg, i) => (
        <div key={i} className="w-[180px]">
          <a href={`/api/fact-sheets/view?id=${sheet.id}`} target="_blank" rel="noopener noreferrer" className="block relative bg-white border border-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow" style={{ width: 180, height: 255 }}>
            <iframe srcDoc={pg.html} title={pg.name || `Page ${i + 1}`} loading="lazy" scrolling="no" tabIndex={-1} aria-hidden
              className="absolute top-0 left-0 border-0 pointer-events-none" style={{ width: 794, height: 1123, transform: "scale(0.2267)", transformOrigin: "top left" }} />
          </a>
          <p className="text-[11.5px] font-medium text-slate-600 mt-1.5 leading-snug line-clamp-2">{pg.name || `Page ${i + 1}`}</p>
        </div>
      ))}
    </div>
  );
}
