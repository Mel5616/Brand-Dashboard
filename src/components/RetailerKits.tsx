"use client";

import { useEffect, useMemo, useState } from "react";

// Builder for per-brand "Retailer Kit" packs — brand overview, product
// showcase, price list, order info and a scored staff-training quiz —
// shared as one tracked public link at /kit/[token]. Admin only; anyone
// with a session can view (read-only, no edit controls) is not needed here
// since this whole tab is gated behind Operations for admins.

type Brand = { id: number; name: string; live?: boolean; color?: string };
type Kit = {
  id: string; brand_id: number; title: string; tagline: string | null; hero_image_url: string | null;
  overview: string | null; order_info: string | null; status: "draft" | "published"; share_token: string;
  open_count: number; updated_at: string;
};
type Attempt = { kit_id: string; score: number; total: number };
type Product = { id: string; kit_id: string; name: string; image_url: string | null; description: string | null; sort_order: number };
type PriceRow = { id: string; kit_id: string; sku: string | null; product_name: string; rrp: number | null; wholesale_price: number | null; moq: number | null; sort_order: number };
type Question = { id: string; kit_id: string; question: string; options: { text: string; correct: boolean }[]; sort_order: number };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const btn = "text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-40";
const origin = typeof window !== "undefined" ? window.location.origin : "";

export function RetailerKits({ brands }: { brands: Brand[] }) {
  const live = brands.filter(b => b.live !== false);
  const [kits, setKits] = useState<Kit[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [newTitle, setNewTitle] = useState("");

  function reload() {
    setLoading(true);
    fetch("/api/retailer-kits").then(r => r.json()).then(d => {
      if (d.needsSetup) { setNeedsSetup(true); return; }
      setKits(d.kits ?? []); setAttempts(d.attempts ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function createKit() {
    if (!newBrand || !newTitle.trim()) return;
    const d = await fetch("/api/retailer-kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: Number(newBrand), title: newTitle.trim() }) }).then(r => r.json());
    if (d.ok) { setKits(p => [d.kit, ...p]); setOpenId(d.kit.id); setShowNew(false); setNewBrand(""); setNewTitle(""); }
  }
  async function patchKit(id: string, fields: Partial<Kit>) {
    setKits(p => p.map(k => k.id === id ? { ...k, ...fields } : k));
    await fetch("/api/retailer-kits", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
  }
  async function removeKit(id: string) {
    if (!confirm("Delete this kit and everything in it? This can't be undone.")) return;
    const d = await fetch(`/api/retailer-kits?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) { setKits(p => p.filter(k => k.id !== id)); if (openId === id) setOpenId(null); }
  }

  const brandOf = (id: number) => brands.find(b => b.id === id);

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_retailer_kits.sql</code> to enable Retailer Kits.</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 max-w-2xl">Build a shareable pack for a new retailer — brand overview, products, price list, order info and a scored staff-training quiz — as one tracked link.</p>
        <button onClick={() => setShowNew(v => !v)} className={btn + " shrink-0"}>{showNew ? "Close" : "+ New kit"}</button>
      </div>

      {showNew && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">Brand
            <select value={newBrand} onChange={e => setNewBrand(e.target.value)} className={inp}>
              <option value="">Select brand…</option>
              {live.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 flex-1 min-w-[220px]">Kit title
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Frida Australia — Retailer Kit" className={inp} />
          </label>
          <button onClick={createKit} disabled={!newBrand || !newTitle.trim()} className={btn}>Create</button>
        </div>
      )}

      {kits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No kits yet — create one to get started.</div>
      ) : (
        <div className="space-y-3">
          {kits.map(k => {
            const brand = brandOf(k.brand_id);
            const kitAttempts = attempts.filter(a => a.kit_id === k.id);
            const avg = kitAttempts.length ? Math.round(kitAttempts.reduce((s, a) => s + a.score / a.total, 0) / kitAttempts.length * 100) : null;
            return (
              <div key={k.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => setOpenId(openId === k.id ? null : k.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brand?.color || "#94a3b8" }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate">{k.title}</p>
                    <p className="text-xs text-gray-400">{brand?.name ?? "—"}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ${k.status === "published" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{k.status}</span>
                  <span className="text-xs text-gray-400 w-20 text-right">{k.open_count} open{k.open_count === 1 ? "" : "s"}</span>
                  <span className="text-xs text-gray-400 w-28 text-right">{kitAttempts.length ? `${kitAttempts.length} trained · ${avg}% avg` : "no training yet"}</span>
                  <span className="text-gray-300">{openId === k.id ? "▲" : "▼"}</span>
                </button>
                {openId === k.id && <KitEditor kit={k} brand={brand} onPatch={f => patchKit(k.id, f)} onDelete={() => removeKit(k.id)} attempts={kitAttempts} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KitEditor({ kit, brand, onPatch, onDelete, attempts }: { kit: Kit; brand?: Brand; onPatch: (f: Partial<Kit>) => void; onDelete: () => void; attempts: Attempt[] }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  function reload() {
    fetch(`/api/retailer-kits/items?kit_id=${kit.id}`).then(r => r.json()).then(d => {
      setProducts(d.products ?? []); setPriceRows(d.priceRows ?? []); setQuestions(d.questions ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, [kit.id]);

  const link = `${origin}/kit/${kit.share_token}`;
  function copyLink() { navigator.clipboard?.writeText(link); setMsg("Link copied."); setTimeout(() => setMsg(""), 2500); }

  async function itemAdd(resource: string, row: any, onOk: (item: any) => void) {
    const d = await fetch("/api/retailer-kits/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, kit_id: kit.id, ...row }) }).then(r => r.json());
    if (d.ok) onOk(d.item); else setMsg(d.error || "Couldn't save.");
  }
  async function itemSave(resource: string, id: string, fields: any) {
    await fetch("/api/retailer-kits/items", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, id, ...fields }) });
  }
  async function itemRemove(resource: string, id: string, onOk: () => void) {
    const d = await fetch(`/api/retailer-kits/items?resource=${resource}&id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) onOk();
  }

  const [draftVersion, setDraftVersion] = useState(0);
  const [drafting, setDrafting] = useState(false);
  async function draftWithAI() {
    setDrafting(true); setMsg("");
    const d = await fetch("/api/retailer-kits/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kit_id: kit.id }) }).then(r => r.json()).catch(() => null);
    setDrafting(false);
    if (!d || d.error) { setMsg(d?.error || "Couldn't draft — try again."); return; }
    onPatch({ tagline: d.draft.tagline, overview: d.draft.overview });
    setDraftVersion(v => v + 1);
    const base = products.length;
    const draftProducts = d.draft.products as { name: string; description: string }[];
    for (let i = 0; i < draftProducts.length; i++) {
      const p = draftProducts[i];
      await itemAdd("product", { name: p.name, description: p.description, sort_order: base + i }, item => setProducts(prev => [...prev, item]));
    }
    const used = [d.sources?.profile && "brand profile", d.sources?.siteFeed && "live site feed", d.sources?.factSheet && "fact sheet"].filter(Boolean).join(", ");
    setMsg(`Drafted from ${used || "available brand material"} — review everything below before publishing.`);
  }

  if (loading) return <div className="px-5 pb-5 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="border-t border-gray-100 px-5 py-5 space-y-5 bg-gray-50/50">
      {msg && <p className="text-xs text-emerald-600">{msg}</p>}

      {/* overview + publish */}
      <Section title="Overview & sharing">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 max-w-md">Pulls from this brand's Briefing Engine profile, live site feed and Product Information fact sheet — nothing is invented. Review before publishing.</p>
          <button onClick={draftWithAI} disabled={drafting} className="text-xs font-semibold text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg px-3.5 py-2 shrink-0">{drafting ? "Drafting…" : "✨ Draft with AI"}</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <input key={`title-${draftVersion}`} defaultValue={kit.title} onBlur={e => onPatch({ title: e.target.value })} placeholder="Kit title" className={inp} />
          <input key={`tagline-${draftVersion}`} defaultValue={kit.tagline ?? ""} onBlur={e => onPatch({ tagline: e.target.value })} placeholder="Tagline (optional)" className={inp} />
        </div>
        <textarea key={`overview-${draftVersion}`} defaultValue={kit.overview ?? ""} onBlur={e => onPatch({ overview: e.target.value })} rows={5} placeholder="Brand overview — story, positioning, what makes it worth stocking…" className={inp + " w-full"} />
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer">
            {kit.hero_image_url ? "Change hero image" : "+ Add hero image"}
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadKitImage(kit.id, "kit", f, url => onPatch({ hero_image_url: url })); e.currentTarget.value = ""; }} />
          </label>
          {kit.hero_image_url && <img src={kit.hero_image_url} alt="" className="h-10 rounded object-cover" />}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
          <select value={kit.status} onChange={e => onPatch({ status: e.target.value as any })} className={inp}>
            <option value="draft">Draft (link inactive)</option>
            <option value="published">Published (link live)</option>
          </select>
          <input readOnly value={link} className={inp + " flex-1 min-w-[240px] bg-white text-gray-400"} onFocus={e => e.target.select()} />
          <button onClick={copyLink} className="text-xs font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-2">Copy link</button>
          <a href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-2">Preview</a>
          <button onClick={onDelete} className="text-xs font-semibold text-rose-500 hover:underline ml-auto">Delete kit</button>
        </div>
      </Section>

      {/* products */}
      <Section title={`Products (${products.length})`}>
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
              {p.image_url ? <img src={p.image_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" /> : <div className="w-12 h-12 rounded bg-gray-100 shrink-0" />}
              <div className="flex-1 min-w-0">
                <input defaultValue={p.name} onBlur={e => itemSave("product", p.id, { name: e.target.value })} className={inp + " w-full mb-1"} />
                <input defaultValue={p.description ?? ""} onBlur={e => itemSave("product", p.id, { description: e.target.value })} placeholder="Short description" className={inp + " w-full"} />
              </div>
              <label className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer shrink-0">Photo
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadKitImage(p.id, "product", f, url => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, image_url: url } : x))); e.currentTarget.value = ""; }} />
              </label>
              <button onClick={() => itemRemove("product", p.id, () => setProducts(prev => prev.filter(x => x.id !== p.id)))} className="text-xs font-semibold text-rose-500 hover:underline shrink-0">Remove</button>
            </div>
          ))}
        </div>
        <button onClick={() => itemAdd("product", { name: "New product", sort_order: products.length }, item => setProducts(p => [...p, item]))} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add product</button>
      </Section>

      {/* price list */}
      <Section title={`Price list (${priceRows.length})`}>
        <div className="space-y-2">
          {priceRows.map(r => (
            <div key={r.id} className="grid grid-cols-[1fr_2fr_100px_100px_80px_auto] gap-2 items-center">
              <input defaultValue={r.sku ?? ""} onBlur={e => itemSave("price_row", r.id, { sku: e.target.value })} placeholder="SKU" className={inp} />
              <input defaultValue={r.product_name} onBlur={e => itemSave("price_row", r.id, { product_name: e.target.value })} placeholder="Product" className={inp} />
              <input defaultValue={r.rrp ?? ""} onBlur={e => itemSave("price_row", r.id, { rrp: e.target.value ? Number(e.target.value) : null })} placeholder="RRP" inputMode="decimal" className={inp} />
              <input defaultValue={r.wholesale_price ?? ""} onBlur={e => itemSave("price_row", r.id, { wholesale_price: e.target.value ? Number(e.target.value) : null })} placeholder="Wholesale" inputMode="decimal" className={inp} />
              <input defaultValue={r.moq ?? ""} onBlur={e => itemSave("price_row", r.id, { moq: e.target.value ? Number(e.target.value) : null })} placeholder="MOQ" inputMode="numeric" className={inp} />
              <button onClick={() => itemRemove("price_row", r.id, () => setPriceRows(prev => prev.filter(x => x.id !== r.id)))} className="text-xs font-semibold text-rose-500 hover:underline">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => itemAdd("price_row", { product_name: "New line", sort_order: priceRows.length }, item => setPriceRows(p => [...p, item]))} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add price row</button>
      </Section>

      {/* order info */}
      <Section title="Order information">
        <textarea defaultValue={kit.order_info ?? ""} onBlur={e => onPatch({ order_info: e.target.value })} rows={5} placeholder="MOQs, lead times, ordering process, freight terms, key contacts…" className={inp + " w-full"} />
      </Section>

      {/* training */}
      <Section title={`Training quiz (${questions.length} question${questions.length === 1 ? "" : "s"}${attempts.length ? ` · ${attempts.length} completed` : ""})`}>
        <div className="space-y-3">
          {questions.map(q => (
            <QuestionEditor key={q.id} q={q} onSave={f => itemSave("question", q.id, f)} onRemove={() => itemRemove("question", q.id, () => setQuestions(prev => prev.filter(x => x.id !== q.id)))} />
          ))}
        </div>
        <button onClick={() => itemAdd("question", { question: "New question", options: [{ text: "Option A", correct: true }, { text: "Option B", correct: false }, { text: "Option C", correct: false }, { text: "Option D", correct: false }], sort_order: questions.length }, item => setQuestions(p => [...p, item]))} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add question</button>
        {attempts.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Completed by</p>
            <p className="text-xs text-gray-400">{attempts.length} staff member{attempts.length === 1 ? "" : "s"} · avg {Math.round(attempts.reduce((s, a) => s + a.score / a.total, 0) / attempts.length * 100)}%</p>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function QuestionEditor({ q, onSave, onRemove }: { q: Question; onSave: (f: any) => void; onRemove: () => void }) {
  const [options, setOptions] = useState(q.options);
  function setOption(i: number, text: string) {
    const next = options.map((o, oi) => oi === i ? { ...o, text } : o);
    setOptions(next); onSave({ options: next });
  }
  function setCorrect(i: number) {
    const next = options.map((o, oi) => ({ ...o, correct: oi === i }));
    setOptions(next); onSave({ options: next });
  }
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <input defaultValue={q.question} onBlur={e => onSave({ question: e.target.value })} placeholder="Question" className={inp + " flex-1"} />
        <button onClick={onRemove} className="text-xs font-semibold text-rose-500 hover:underline shrink-0">Remove</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {options.map((o, i) => (
          <label key={i} className="flex items-center gap-2">
            <input type="radio" checked={o.correct} onChange={() => setCorrect(i)} title="Correct answer" />
            <input defaultValue={o.text} onBlur={e => setOption(i, e.target.value)} className={inp + " flex-1"} />
          </label>
        ))}
      </div>
      <p className="text-[10px] text-gray-400">Select the radio button next to the correct answer.</p>
    </div>
  );
}

async function uploadKitImage(id: string, target: "kit" | "product", file: File, onOk: (url: string) => void) {
  const fd = new FormData(); fd.append("file", file); fd.append("id", id); fd.append("target", target);
  const d = await fetch("/api/retailer-kits/image", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
  if (d?.ok) onOk(d.url);
}
