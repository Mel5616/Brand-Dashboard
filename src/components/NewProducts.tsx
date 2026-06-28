"use client";
import { useEffect, useRef, useState } from "react";
import { BRAND_LOGOS } from "./BrandCard";

const STATUSES: { id: string; label: string; bg: string }[] = [
  { id: "coming_soon", label: "Coming soon", bg: "#0891b2" },
  { id: "launching", label: "Launching", bg: "#d97706" },
  { id: "launched", label: "Available now", bg: "#16a34a" },
  { id: "archived", label: "Archived", bg: "#64748b" },
];
const statusOf = (s: string) => STATUSES.find(x => x.id === s) ?? STATUSES[0];
const fmtDate = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null;

export function NewProducts({ brands, canEdit = false }: { brands: { id: number; name: string }[]; canEdit?: boolean }) {
  const [products, setProducts] = useState<any[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  async function load() {
    const d = await fetch("/api/new-products").then(r => r.json()).catch(() => ({ products: [] }));
    setNeedsSetup(!!d.needsSetup);
    setProducts(d.products || []);
  }
  useEffect(() => { load(); }, []);

  const open = products.find(p => p.id === openId) || null;
  useEffect(() => { setEdit(open ? { ...open } : null); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy("import"); setMsg("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
      const headers = (grid[0] || []).map((h: any) => String(h).trim());
      const idx = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      const iN = idx("Name"), iC = idx("Code"), iD = idx("Product Description"), iB = idx("Barcode"), iW = idx("Gross Weight"), iL = idx("Length"), iWi = idx("Width"), iH = idx("Height");
      if (iN < 0 || iC < 0) { setMsg("Couldn't find the Name and Code columns in that sheet."); setBusy(""); return; }
      const rows = grid.slice(1).filter((r: any) => String(r[iN] ?? "").trim()).map((r: any) => ({
        name: r[iN], sku: r[iC], source_description: iD >= 0 ? r[iD] : "", barcode: iB >= 0 ? r[iB] : "",
        weight: iW >= 0 ? r[iW] : "", length: iL >= 0 ? r[iL] : "", width: iWi >= 0 ? r[iWi] : "", height: iH >= 0 ? r[iH] : "",
      }));
      const res = await fetch("/api/new-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const j = await res.json();
      if (j.error) setMsg(j.error);
      else { setMsg(`Imported ${j.imported} new product${j.imported === 1 ? "" : "s"} (${j.received} in file).`); await load(); }
    } catch { setMsg("Could not read that file."); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function save() {
    if (!edit) return;
    setBusy("save");
    const res = await fetch(`/api/new-products/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: edit.name, long_description: edit.long_description, short_description: edit.short_description, whats_in_box: edit.whats_in_box, features: edit.features, status: edit.status, launch_date: edit.launch_date || null }) });
    const j = await res.json(); setBusy("");
    if (j.error) setMsg(j.error);
    else { setProducts(prev => prev.map(p => p.id === j.product.id ? j.product : p)); setMsg("Saved."); }
  }

  async function draft() {
    if (!edit) return;
    setBusy("draft"); setMsg("");
    const res = await fetch(`/api/new-products/${edit.id}/draft`, { method: "POST" });
    const j = await res.json(); setBusy("");
    if (j.error) setMsg(j.detail ? `${j.error}: ${j.detail}` : j.error);
    else setEdit((e: any) => ({ ...e, ...j.draft }));
  }

  async function del() {
    if (!edit || !confirm("Delete this product?")) return;
    await fetch(`/api/new-products/${edit.id}`, { method: "DELETE" });
    setProducts(prev => prev.filter(p => p.id !== edit.id)); setOpenId(null);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !edit) return;
    setBusy("image"); setMsg("");
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch(`/api/new-products/${edit.id}/image`, { method: "POST", body: fd });
    const j = await res.json(); setBusy(""); if (imgRef.current) imgRef.current.value = "";
    if (j.error) setMsg(j.error);
    else { setEdit((p: any) => ({ ...p, attrs: j.product.attrs })); setProducts(prev => prev.map(p => p.id === j.product.id ? j.product : p)); }
  }

  function copyShare() {
    if (!open) return;
    navigator.clipboard?.writeText(`${window.location.origin}/p/${open.share_token}`);
    setMsg("Share link copied.");
  }

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
      <p className="text-sm text-gray-500 font-medium">New Products isn’t set up yet</p>
      <p className="text-xs text-gray-400 mt-1">Run <code className="bg-gray-50 px-1 rounded">supabase/add_new_products.sql</code>, then upload your Excel.</p>
    </div>
  );

  const ta = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-gray-400">{products.length} product{products.length === 1 ? "" : "s"}{msg && <span className="ml-2 text-indigo-500 font-medium">{msg}</span>}</div>
        {canEdit && (
          <div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={busy === "import"} className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 disabled:opacity-60">
              {busy === "import" ? "Importing…" : "Upload Excel"}
            </button>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
          Upload your New Products Excel to get started. Only the highlighted columns (name, code, description, barcode, dimensions) are imported.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map(p => {
            const st = statusOf(p.status); const filled = !!p.long_description;
            return (
              <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow hover:border-indigo-200 transition p-3">
                <div className="flex items-center justify-between mb-1.5">
                  {p.brand_id != null && BRAND_LOGOS[p.brand_id]
                    ? <img src={BRAND_LOGOS[p.brand_id]} alt="" className="h-4 max-w-[64px] object-contain" />
                    : <span className="text-[10px] text-gray-400">—</span>}
                  <span className="text-[9px] font-semibold text-white rounded-full px-1.5 py-0.5" style={{ background: st.bg }}>{st.label}</span>
                </div>
                {p.attrs?.image_url && <img src={p.attrs.image_url} alt="" className="w-full h-20 object-contain rounded-md bg-gray-50 mb-1.5" />}
                <p className="text-sm font-medium text-slate-700 leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400">{p.sku}</span>
                  {fmtDate(p.launch_date) ? <span className="text-[10px] text-indigo-500">{fmtDate(p.launch_date)}</span> : <span className={`text-[10px] ${filled ? "text-emerald-500" : "text-amber-500"}`}>{filled ? "copy ready" : "needs copy"}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && edit && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpenId(null)} aria-hidden />
          <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <input value={edit.name ?? ""} readOnly={!canEdit} onChange={e => setEdit({ ...edit, name: e.target.value })} className="flex-1 text-lg font-bold text-slate-900 bg-transparent rounded px-1 -ml-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button onClick={() => setOpenId(null)} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100">✕</button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                {canEdit
                  ? <select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })} className="text-xs font-semibold text-white rounded-full px-2.5 py-1" style={{ background: statusOf(edit.status).bg }}>{STATUSES.map(s => <option key={s.id} value={s.id} className="text-slate-700 bg-white">{s.label}</option>)}</select>
                  : <span className="text-xs font-semibold text-white rounded-full px-2.5 py-1" style={{ background: statusOf(edit.status).bg }}>{statusOf(edit.status).label}</span>}
                <span className="text-gray-400 text-xs">Launch</span>
                <input type="date" value={edit.launch_date ? String(edit.launch_date).slice(0, 10) : ""} readOnly={!canEdit} onChange={e => setEdit({ ...edit, launch_date: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1" />
              </div>

              <div>
                <input ref={imgRef} type="file" accept="image/*" onChange={uploadImage} className="hidden" />
                {edit.attrs?.image_url
                  ? <img src={edit.attrs.image_url} alt="" className="w-full max-h-56 object-contain rounded-lg border border-gray-100 bg-gray-50" />
                  : <div className="w-full h-28 rounded-lg border border-dashed border-gray-200 bg-gray-50 grid place-items-center text-xs text-gray-400">No image</div>}
                {canEdit && (
                  <button onClick={() => imgRef.current?.click()} disabled={busy === "image"} className="mt-1.5 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-60">
                    {busy === "image" ? "Uploading…" : edit.attrs?.image_url ? "Replace image" : "Upload image"}
                  </button>
                )}
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500 grid grid-cols-2 gap-x-4 gap-y-1">
                <span>SKU: <b className="text-slate-600">{open.sku || "—"}</b></span>
                <span>Barcode: <b className="text-slate-600">{open.barcode || "—"}</b></span>
                <span>Dimensions: <b className="text-slate-600">{[open.length, open.width, open.height].every((v: any) => v != null) ? `${open.length}×${open.width}×${open.height} cm` : "—"}</b></span>
                <span>Weight: <b className="text-slate-600">{open.weight != null ? `${open.weight} kg` : "—"}</b></span>
                {open.source_description && <span className="col-span-2 mt-1">Supplier note: <span className="text-slate-600">{open.source_description}</span></span>}
              </div>

              {canEdit && (
                <button onClick={draft} disabled={busy === "draft"} className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 disabled:opacity-60">
                  {busy === "draft" && <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />}
                  {busy === "draft" ? "Drafting…" : "✨ Draft copy with Claude"}
                </button>
              )}

              {([["short_description", "Short description", 2], ["long_description", "Long description (website body)", 6], ["features", "Key features (one per line)", 5], ["whats_in_box", "What's in the box (one per line)", 3]] as const).map(([k, label, rows]) => (
                <div key={k}>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</label>
                  <textarea value={edit[k] ?? ""} readOnly={!canEdit} rows={rows} onChange={e => setEdit({ ...edit, [k]: e.target.value })} className={ta} />
                </div>
              ))}

              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  <button onClick={save} disabled={busy === "save"} className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 disabled:opacity-60">{busy === "save" ? "Saving…" : "Save"}</button>
                  <a href={`/new-products/${open.id}/print`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-700 border border-gray-200 hover:bg-gray-50 rounded-lg px-4 py-2">PDF</a>
                  <button onClick={copyShare} className="text-sm font-medium text-slate-700 border border-gray-200 hover:bg-gray-50 rounded-lg px-4 py-2">Copy share link</button>
                  <button onClick={del} className="text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg px-3 py-2 ml-auto">Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
