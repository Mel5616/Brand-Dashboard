"use client";

import { useEffect, useMemo, useState } from "react";

// Operations > Brand Assets — one place linking out to wherever each brand's
// assets actually live (Brandfolder, Dropbox, Drive, supplier portals).
// Admin adds/edits links inline; everyone gets the quick links.
type Link = { id: string; brand: string; label: string; url: string; notes: string | null; username?: string | null; password?: string | null };
type BrandRef = { name: string; color: string };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";

// Recognise the big asset platforms from the URL for a source badge.
function sourceOf(url: string): { name: string; icon: string; cls: string } {
  const u = url.toLowerCase();
  if (u.includes("brandfolder")) return { name: "Brandfolder", icon: "🗂️", cls: "bg-indigo-50 text-indigo-600" };
  if (u.includes("dropbox")) return { name: "Dropbox", icon: "📦", cls: "bg-sky-50 text-sky-600" };
  if (u.includes("drive.google") || u.includes("docs.google")) return { name: "Google Drive", icon: "🟢", cls: "bg-emerald-50 text-emerald-600" };
  if (u.includes("sharepoint") || u.includes("onedrive")) return { name: "SharePoint", icon: "🔷", cls: "bg-blue-50 text-blue-600" };
  if (u.includes("canva")) return { name: "Canva", icon: "🎨", cls: "bg-violet-50 text-violet-600" };
  if (u.includes("figma")) return { name: "Figma", icon: "✏️", cls: "bg-rose-50 text-rose-600" };
  if (u.includes("wetransfer")) return { name: "WeTransfer", icon: "📮", cls: "bg-cyan-50 text-cyan-600" };
  return { name: new URL(url).hostname.replace(/^www\./, ""), icon: "🔗", cls: "bg-gray-50 text-gray-500" };
}

export function BrandAssets({ brands = [], admin }: { brands?: BrandRef[]; admin: boolean }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [err, setErr] = useState("");
  const [addFor, setAddFor] = useState<string | null>(null);   // brand name, or "__new__"
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ brand: "", label: "", url: "", notes: "", username: "", password: "" });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/brand-assets").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) setLinks(d.links ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Link[]>();
    for (const l of links) m.set(l.brand, [...(m.get(l.brand) ?? []), l]);
    // Brands in dashboard order first, then any extra names alphabetically.
    const order = [...brands.map(b => b.name).filter(n => m.has(n)), ...[...m.keys()].filter(n => !brands.some(b => b.name === n)).sort()];
    return order.map(n => ({ brand: n, links: m.get(n)! }));
  }, [links, brands]);
  const color = (name: string) => brands.find(b => b.name.toLowerCase() === name.toLowerCase())?.color ?? "#94a3b8";

  function startAdd(brand: string) {
    setEditId(null); setAddFor(brand);
    setF({ brand: brand === "__new__" ? "" : brand, label: "", url: "", notes: "", username: "", password: "" });
  }
  function startEdit(l: Link) {
    setAddFor(null); setEditId(l.id);
    setF({ brand: l.brand, label: l.label, url: l.url, notes: l.notes ?? "", username: l.username ?? "", password: l.password ?? "" });
  }
  async function save() {
    setBusy(true); setErr("");
    const d = await fetch("/api/brand-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: editId ?? undefined }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setLinks(p => editId ? p.map(l => l.id === editId ? d.item : l) : [...p, d.item]);
      setAddFor(null); setEditId(null);
    } else setErr(d?.error || (d?.needsSetup ? "Run add_brand_asset_links.sql first" : "Couldn't save."));
  }
  async function del(id: string) {
    const d = await fetch("/api/brand-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) }).then(r => r.json());
    if (d.ok) setLinks(p => p.filter(l => l.id !== id));
  }

  const Form = (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-2">
      {(addFor === "__new__" || editId) && (
        <input value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} placeholder="Brand" list="asset-brands" className={inp} />
      )}
      <input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Label (e.g. Brandfolder — logos & imagery)" className={`${inp} lg:col-span-2`} />
      <input value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="Link (https://…)" className={`${inp} ${addFor === "__new__" || editId ? "" : "lg:col-span-2"}`} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
        <button onClick={() => { setAddFor(null); setEditId(null); }} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
      </div>
      <input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} placeholder="Username / email (optional)" className={`${inp} sm:col-span-1 lg:col-span-2`} autoComplete="off" />
      <input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} placeholder="Password (optional — visible to all dashboard users)" className={`${inp} sm:col-span-1 lg:col-span-3`} autoComplete="off" />
      <input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional — what's in there…)" className={`${inp} sm:col-span-2 lg:col-span-5`} />
      <datalist id="asset-brands">{brands.map(b => <option key={b.name} value={b.name} />)}</datalist>
    </div>
  );

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_brand_asset_links.sql</code> first.</div>;

  return (
    <div className="space-y-4 max-w-[1000px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Brand assets</h1>
          <p className="text-sm text-gray-400">Where every brand&apos;s assets live — Brandfolder, Dropbox, Drive and the rest. One click out.</p>
        </div>
        {admin && <button onClick={() => startAdd("__new__")} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">+ Add link</button>}
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
      {addFor === "__new__" && Form}

      {grouped.length === 0 && addFor !== "__new__" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No links yet{admin ? " — click + Add link to start (e.g. Frida → Brandfolder)." : "."}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {grouped.map(g => (
          <div key={g.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-t-2xl" style={{ background: `linear-gradient(120deg, ${color(g.brand)}, ${color(g.brand)}99)` }}>
              <span className="w-9 h-9 rounded-full bg-white/90 grid place-items-center text-[13px] font-black shrink-0" style={{ color: color(g.brand) }}>
                {g.brand.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-white leading-tight">{g.brand}</p>
                <p className="text-[10.5px] text-white/70">{g.links.length} {g.links.length === 1 ? "source" : "sources"}</p>
              </div>
              {admin && <button onClick={() => startAdd(g.brand)} className="ml-auto w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-[15px] leading-none font-bold grid place-items-center" title="Add a link for this brand">＋</button>}
            </div>
            <div className="px-4 py-2 divide-y divide-gray-50">
              {g.links.map(l => {
                const src = sourceOf(l.url);
                return (
                  <div key={l.id} className="py-2 group">
                    <div className="flex items-center gap-2">
                      <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80">
                        <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${src.cls}`}>{src.icon} {src.name}</span>
                        <span className="text-[13.5px] font-medium text-slate-700 truncate">{l.label}</span>
                        <span className="text-[12px] text-emerald-600 shrink-0">↗</span>
                      </a>
                      {admin && (
                        <span className="flex gap-2 opacity-0 group-hover:opacity-100 shrink-0">
                          <button onClick={() => startEdit(l)} className="text-[11px] text-gray-400 hover:text-slate-600">edit</button>
                          <button onClick={() => del(l.id)} className="text-[11px] text-gray-400 hover:text-rose-500">remove</button>
                        </span>
                      )}
                    </div>
                    {(l.username || l.password) && (
                      <div className="flex items-center gap-2 flex-wrap mt-1 pl-1">
                        {l.username && (
                          <button onClick={() => navigator.clipboard?.writeText(l.username!)} title="Click to copy"
                            className="text-[11px] text-slate-500 bg-gray-50 hover:bg-gray-100 rounded-full px-2 py-0.5">👤 {l.username} ⧉</button>
                        )}
                        {l.password && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-gray-50 rounded-full px-2 py-0.5">
                            🔑 {revealed.has(l.id) ? l.password : "••••••••"}
                            <button onClick={() => setRevealed(prev => { const n = new Set(prev); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} className="text-gray-400 hover:text-slate-600" title={revealed.has(l.id) ? "Hide" : "Reveal"}>{revealed.has(l.id) ? "🙈" : "👁"}</button>
                            <button onClick={() => navigator.clipboard?.writeText(l.password!)} className="text-gray-400 hover:text-slate-600" title="Copy password">⧉</button>
                          </span>
                        )}
                      </div>
                    )}
                    {l.notes && <p className="text-[11.5px] text-gray-400 mt-0.5 pl-1">{l.notes}</p>}
                    {editId === l.id && Form}
                  </div>
                );
              })}
              {addFor === g.brand && <div className="py-2">{Form}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
