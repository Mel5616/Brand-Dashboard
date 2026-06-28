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

// Variants share a base SKU (the part before the last hyphen, e.g. GSBW-G -> GSBW).
const groupKeyOf = (p: any) => { const s = String(p.sku || "").trim(); return (s.includes("-") ? s.slice(0, s.lastIndexOf("-")) : (s || p.id)).toUpperCase(); };
// Longest shared word-prefix across the variant names — the product line title.
function commonPrefix(names: string[]): string {
  if (!names.length) return "";
  const split = names.map(n => n.trim().split(/\s+/));
  const out: string[] = [];
  for (let i = 0; i < split[0].length; i++) { const w = split[0][i]; if (split.every(s => s[i] === w)) out.push(w); else break; }
  return out.join(" ").trim() || names[0];
}

export function NewProducts({ brands, canEdit = false }: { brands: { id: number; name: string }[]; canEdit?: boolean }) {
  const [products, setProducts] = useState<any[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);          // shared copy fields (from the representative)
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const imgTarget = useRef<string | null>(null);        // which variant id an uploaded image is for

  async function load() {
    const d = await fetch("/api/new-products").then(r => r.json()).catch(() => ({ products: [] }));
    setNeedsSetup(!!d.needsSetup); setProducts(d.products || []);
  }
  useEffect(() => { load(); }, []);

  // Group products into product lines.
  const map = new Map<string, any[]>();
  for (const p of products) { const k = groupKeyOf(p); (map.get(k) ?? map.set(k, []).get(k)!).push(p); }
  const groups = [...map.entries()].map(([key, members]) => ({ key, members, title: commonPrefix(members.map(m => m.name)) }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const open = groups.find(g => g.key === openKey) || null;
  const rep = open?.members[0];
  useEffect(() => { setEdit(rep ? { ...rep } : null); }, [openKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const variantLabel = (name: string, title: string) => name.replace(title, "").trim() || name;

  async function save() {
    if (!open || !edit) return;
    setBusy("save");
    const payload = { long_description: edit.long_description, short_description: edit.short_description, whats_in_box: edit.whats_in_box, features: edit.features, status: edit.status, launch_date: edit.launch_date || null, brand_id: edit.brand_id ?? null };
    const res = await Promise.all(open.members.map(m => fetch(`/api/new-products/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json())));
    setProducts(prev => prev.map(p => { const u = res.find(x => x.product?.id === p.id); return u?.product ?? p; }));
    setBusy(""); setMsg(`Saved to ${open.members.length} colour${open.members.length === 1 ? "" : "s"}.`);
  }

  async function draft() {
    if (!rep) return;
    setBusy("draft"); setMsg("");
    const j = await fetch(`/api/new-products/${rep.id}/draft`, { method: "POST" }).then(r => r.json());
    setBusy("");
    if (j.error) setMsg(j.detail ? `${j.error}: ${j.detail}` : j.error);
    else setEdit((e: any) => ({ ...e, ...j.draft }));
  }

  function pickImage(targetId: string) { imgTarget.current = targetId; imgRef.current?.click(); }
  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; const id = imgTarget.current; if (!f || !id) return;
    setBusy("image:" + id); setMsg("");
    const fd = new FormData(); fd.append("file", f);
    const j = await fetch(`/api/new-products/${id}/image`, { method: "POST", body: fd }).then(r => r.json());
    setBusy(""); if (imgRef.current) imgRef.current.value = "";
    if (j.error) setMsg(j.error);
    else setProducts(prev => prev.map(p => p.id === j.product.id ? j.product : p));
  }

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
      const j = await fetch("/api/new-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }).then(r => r.json());
      if (j.error) setMsg(j.error); else { setMsg(`Imported ${j.imported} new (${j.received} in file).`); await load(); }
    } catch { setMsg("Could not read that file."); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function delGroup() {
    if (!open || !confirm(`Delete this product and all ${open.members.length} colour(s)?`)) return;
    await Promise.all(open.members.map(m => fetch(`/api/new-products/${m.id}`, { method: "DELETE" })));
    setProducts(prev => prev.filter(p => !open.members.some(m => m.id === p.id))); setOpenKey(null);
  }

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
      <p className="text-sm text-gray-500 font-medium">New Products isn’t set up yet</p>
      <p className="text-xs text-gray-400 mt-1">Run <code className="bg-gray-50 px-1 rounded">supabase/add_new_products.sql</code>, then upload your Excel.</p>
    </div>
  );
  const ta = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y";

  return (
    <div className="space-y-4">
      <input ref={imgRef} type="file" accept="image/*" onChange={uploadImage} className="hidden" />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-gray-400">{groups.length} product line{groups.length === 1 ? "" : "s"}{msg && <span className="ml-2 text-emerald-500 font-medium">{msg}</span>}</div>
        {canEdit && (
          <div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={busy === "import"} className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 disabled:opacity-60">{busy === "import" ? "Importing…" : "Upload Excel"}</button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">Upload your New Products Excel to get started.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {groups.map(g => {
            const r = g.members[0]; const st = statusOf(r.status);
            const img = g.members.find(m => m.attrs?.image_url)?.attrs?.image_url;
            const ready = g.members.every(m => m.long_description);
            const colours = g.members.map(m => variantLabel(m.name, g.title)).filter(Boolean);
            return (
              <button key={g.key} onClick={() => setOpenKey(g.key)} className="text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow hover:border-emerald-200 transition p-3">
                <div className="flex items-center justify-between mb-1.5">
                  {r.brand_id != null && BRAND_LOGOS[r.brand_id] ? <img src={BRAND_LOGOS[r.brand_id]} alt="" className="h-4 max-w-[64px] object-contain" /> : <span className="text-[10px] text-gray-400">—</span>}
                  <span className="text-[9px] font-semibold text-white rounded-full px-1.5 py-0.5" style={{ background: st.bg }}>{st.label}</span>
                </div>
                {img && <img src={img} alt="" className="w-full h-20 object-contain rounded-md bg-gray-50 mb-1.5" />}
                <p className="text-sm font-medium text-slate-700 leading-snug line-clamp-2 min-h-[2.5rem]">{g.title}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400 truncate">{g.members.length > 1 ? `${g.members.length} colours` : r.sku}</span>
                  <span className={`text-[10px] ${ready ? "text-emerald-500" : "text-amber-500"}`}>{ready ? "copy ready" : "needs copy"}</span>
                </div>
                {colours.length > 1 && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{colours.join(", ")}</p>}
              </button>
            );
          })}
        </div>
      )}

      {open && edit && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpenKey(null)} aria-hidden />
          <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold text-slate-900">{open.title}</h2><p className="text-xs text-gray-400">{open.members.length} colour{open.members.length === 1 ? "" : "s"} · shared copy</p></div>
                <button onClick={() => setOpenKey(null)} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100">✕</button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                {canEdit
                  ? <select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })} className="text-xs font-semibold text-white rounded-full px-2.5 py-1" style={{ background: statusOf(edit.status).bg }}>{STATUSES.map(s => <option key={s.id} value={s.id} className="text-slate-700 bg-white">{s.label}</option>)}</select>
                  : <span className="text-xs font-semibold text-white rounded-full px-2.5 py-1" style={{ background: statusOf(edit.status).bg }}>{statusOf(edit.status).label}</span>}
                <span className="text-gray-400 text-xs">Launch</span>
                <input type="date" value={edit.launch_date ? String(edit.launch_date).slice(0, 10) : ""} readOnly={!canEdit} onChange={e => setEdit({ ...edit, launch_date: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1" />
                <span className="text-gray-400 text-xs">Brand</span>
                {canEdit
                  ? <select value={edit.brand_id ?? ""} onChange={e => setEdit({ ...edit, brand_id: e.target.value === "" ? null : Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white">
                      <option value="">— select —</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  : <span className="text-sm text-slate-600">{brands.find(b => b.id === edit.brand_id)?.name ?? "—"}</span>}
              </div>

              {canEdit && (
                <button onClick={draft} disabled={busy === "draft"} className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 disabled:opacity-60">
                  {busy === "draft" && <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" />}{busy === "draft" ? "Drafting…" : "✨ Draft copy with Claude"}
                </button>
              )}

              {([["short_description", "Short description", 2], ["long_description", "Long description (website body)", 6], ["features", "Key features (one per line)", 5], ["whats_in_box", "What's in the box (one per line)", 3]] as const).map(([k, label, rows]) => (
                <div key={k}>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label} <span className="font-normal lowercase tracking-normal text-gray-300">· shared across colours</span></label>
                  <textarea value={edit[k] ?? ""} readOnly={!canEdit} rows={rows} onChange={e => setEdit({ ...edit, [k]: e.target.value })} className={ta} />
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                {canEdit && <button onClick={save} disabled={busy === "save"} className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 disabled:opacity-60">{busy === "save" ? "Saving…" : `Save to all ${open.members.length > 1 ? open.members.length + " colours" : ""}`.trim()}</button>}
                {rep && <a href={`/new-products/${rep.id}/print`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-700 border border-gray-200 hover:bg-gray-50 rounded-lg px-4 py-2">PDF</a>}
                {rep && <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/p/${rep.share_token}`); setMsg("Share link copied."); }} className="text-sm font-medium text-slate-700 border border-gray-200 hover:bg-gray-50 rounded-lg px-4 py-2">Copy share link</button>}
                {canEdit && <button onClick={delGroup} className="text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg px-3 py-2 ml-auto">Delete</button>}
              </div>

              {/* Colours — per-variant SKU/dims/image/links */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Colours & details</p>
                <div className="space-y-2">
                  {open.members.map(m => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-2">
                      {m.attrs?.image_url
                        ? <img src={m.attrs.image_url} alt="" className="w-12 h-12 object-contain rounded bg-gray-50 shrink-0" />
                        : <div className="w-12 h-12 rounded bg-gray-50 border border-dashed border-gray-200 shrink-0 grid place-items-center text-[9px] text-gray-300">img</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{variantLabel(m.name, open.title) || m.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{m.sku}{m.barcode ? ` · ${m.barcode}` : ""}{[m.length, m.width, m.height].every((v: any) => v != null) ? ` · ${m.length}×${m.width}×${m.height}cm` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                        {canEdit && <button onClick={() => pickImage(m.id)} disabled={busy === "image:" + m.id} className="text-emerald-600 hover:underline disabled:opacity-60">{busy === "image:" + m.id ? "…" : m.attrs?.image_url ? "swap" : "image"}</button>}
                        <a href={`/new-products/${m.id}/print`} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">PDF</a>
                        <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/p/${m.share_token}`); setMsg("Link copied."); }} className="text-slate-500 hover:underline">link</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
