"use client";

import { useEffect, useMemo, useState } from "react";

// Blogging > AI Blog Writer — full-post drafts written in-brand from a
// one-line brief, reviewed here, and pushed straight to the right brand's
// Shopify blog on approval. Currently wired up for Frida and smarTrike;
// see BRAND_VOICE in src/app/api/blog-drafts/route.ts to add another brand.
type Draft = {
  id: string; brand_id: number; status: "planned" | "draft" | "published" | "rejected"; blog_key: string | null;
  title: string; slug: string | null; meta_title: string | null; meta_description: string | null;
  target_keyword: string | null; intent: string | null; site_role: string | null; body_html: string;
  brief: string | null; note: string | null; published_url: string | null; scheduled_for: string | null; image_url: string | null;
  created_by: string | null; approved_by: string | null; published_at: string | null; created_at: string;
};
type BlogDef = { key: string; handle: string; label: string; audience: string; tieins: string };
type VoiceMap = Record<string, { blogs: BlogDef[]; voice: string }>;

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1";
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const STATUS_META: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "bg-sky-100 text-sky-700" },
  draft: { label: "Needs review", cls: "bg-amber-100 text-amber-700" },
  published: { label: "Published", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-gray-100 text-gray-400" },
};

export function BlogStudio({ brands, admin }: { brands: { id: number; name: string }[]; admin: boolean }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [voices, setVoices] = useState<VoiceMap>({});
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Draft>>({});
  const [statusF, setStatusF] = useState<"all" | Draft["status"]>("planned");

  const voiceBrands = useMemo(() => brands.filter(b => voices[b.name]), [brands, voices]);
  const [form, setForm] = useState({ brand_name: "", blog_key: "", brief: "", target_keyword: "", intent: "", site_role: "cluster" });
  const [supersedeId, setSupersedeId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ title: string; target_keyword: string; intent: string; site_role: string; why: string }[] | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  async function load() {
    const res = await fetch("/api/blog-drafts").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setVoices(res.brandVoices || {}); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!form.brand_name && voiceBrands.length) setForm(p => ({ ...p, brand_name: voiceBrands[0].name, blog_key: voices[voiceBrands[0].name]?.blogs[0]?.key || "" }));
  }, [voiceBrands, voices]);

  const brandBlogs = voices[form.brand_name]?.blogs ?? [];
  const brandOf = (id: number) => brands.find(b => b.id === id);

  async function suggestTopics() {
    if (!form.brand_name) return;
    const brandId = brands.find(b => b.name === form.brand_name)?.id;
    setSuggestBusy(true); setSuggestError(""); setSuggestions(null);
    const params = new URLSearchParams({ action: "suggest-topics", brand_name: form.brand_name, blog_key: form.blog_key, ...(brandId != null ? { brand_id: String(brandId) } : {}) });
    const d = await fetch(`/api/blog-drafts?${params}`).then(r => r.json()).catch(() => null);
    setSuggestBusy(false);
    if (d?.ok) setSuggestions(d.suggestions || []);
    else setSuggestError(d?.error || "Couldn't get suggestions.");
  }

  function useSuggestion(s: { title: string; target_keyword: string; intent: string; site_role: string }) {
    setForm(p => ({ ...p, brief: s.title, target_keyword: s.target_keyword || "", intent: s.intent || "", site_role: s.site_role === "hero" ? "hero" : "cluster" }));
    setSuggestions(null);
  }

  function useThisBrief(d: Draft) {
    const brandName = brandOf(d.brand_id)?.name ?? "";
    setForm({ brand_name: brandName, blog_key: d.blog_key || voices[brandName]?.blogs[0]?.key || "", brief: d.brief || d.title, target_keyword: d.target_keyword || "", intent: d.intent || "", site_role: d.site_role || "cluster" });
    setSupersedeId(d.id);
    setOpenId(null);
    setMsg(`Loaded "${d.title}" into the generator above — hit Generate draft when ready.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate() {
    setMsg("");
    if (!form.brand_name || !form.brief.trim()) { setMsg("Pick a brand and give it a topic/brief."); return; }
    const brandId = brands.find(b => b.name === form.brand_name)?.id;
    if (brandId == null) { setMsg("Unknown brand."); return; }
    setBusy(true); setMsg("Writing — this takes a minute…");
    const d = await fetch("/api/blog-drafts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: brandId, brand_name: form.brand_name, blog_key: form.blog_key, brief: form.brief, target_keyword: form.target_keyword, intent: form.intent, site_role: form.site_role }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      if (supersedeId) { await fetch(`/api/blog-drafts?id=${supersedeId}`, { method: "DELETE" }).catch(() => {}); setSupersedeId(null); }
      setForm(p => ({ ...p, brief: "", target_keyword: "", intent: "" })); load(); setMsg("Draft ready — review it below."); setStatusF("draft"); setOpenId(d.item.id); setEdit(d.item);
    } else { setNeedsSetup(!!d?.needsSetup); setMsg(d?.error || "Couldn't generate that draft."); }
  }

  function openDraft(d: Draft) { setOpenId(d.id === openId ? null : d.id); setEdit(d); setMsg(""); setConfirmingApprove(false); setApproveError(""); setConfirmDeleteId(null); setShowReject(false); setRejectNote(""); }

  async function saveEdit() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/blog-drafts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: openId, action: "edit", title: edit.title, slug: edit.slug, meta_title: edit.meta_title, meta_description: edit.meta_description, body_html: edit.body_html, target_keyword: edit.target_keyword, intent: edit.intent }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setMsg("Saved."); load(); } else setMsg(d?.error || "Couldn't save.");
  }

  async function uploadImage(id: string, file: File) {
    setUploadingId(id);
    setMsg("Uploading image…");
    // Straight to storage on a signed URL — not through this function's own
    // body, which Vercel caps around 4.5MB (a real phone photo often exceeds that).
    const init = await fetch("/api/blog-drafts/image", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init", id, fileName: file.name, contentType: file.type, bytes: file.size }),
    }).then(r => r.json()).catch(() => null);
    if (!init?.ok) { setUploadingId(null); setMsg(`Image upload failed: ${init?.error || "couldn't start the upload"}`); return; }
    const put = await fetch(init.signedUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file }).catch(() => null);
    if (!put?.ok) { setUploadingId(null); setMsg("Image upload failed: the file didn't reach storage — try again"); return; }
    const fin = await fetch("/api/blog-drafts/image", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", id, path: init.path }),
    }).then(r => r.json()).catch(() => null);
    setUploadingId(null);
    if (fin?.ok) { setMsg("Image uploaded ✓"); load(); }
    else setMsg(`Image upload failed: ${fin?.error || "unknown error"}`);
  }

  const [approveError, setApproveError] = useState("");
  async function approve() {
    if (!openId) return;
    setApproveError(""); setBusy(true); setMsg("Publishing…");
    const d = await fetch("/api/blog-drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openId, action: "approve" }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setConfirmingApprove(false);
      setMsg(d.item?.published_url ? `Published ✓ — live now: ${d.item.published_url}` : "Published ✓ — but no live link came back, check Shopify directly.");
      load();
    } else {
      // Keep the confirm panel open so the error shows right where you're looking, not in a message box off-screen.
      setApproveError(d?.error || "Couldn't publish — the draft is still saved, try again.");
    }
  }

  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  async function reject() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/blog-drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openId, action: "reject", note: rejectNote }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setOpenId(null); setShowReject(false); setRejectNote(""); load(); } else setMsg(d?.error || "Couldn't reject.");
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  async function remove(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    await fetch(`/api/blog-drafts?id=${id}`, { method: "DELETE" });
    if (openId === id) setOpenId(null);
    load();
  }

  const rows = items.filter(i => statusF === "all" || i.status === statusF)
    .sort((a, b) => statusF === "planned" ? (a.scheduled_for || "9999").localeCompare(b.scheduled_for || "9999") : 0);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        AI Blog Writer isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_blog_drafts.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-1">New blog draft</p>
        <p className="text-xs text-gray-400 mb-3">Written to the house content guidelines and that brand&apos;s voice/compliance rules — a full, structured, SEO-ready post from a one-line brief. Nothing goes live until you approve it below.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className={lbl}>Brand</div>
            <select value={form.brand_name} onChange={e => { const bn = e.target.value; setForm(p => ({ ...p, brand_name: bn, blog_key: voices[bn]?.blogs[0]?.key || "" })); setSuggestions(null); setSuggestError(""); }} className={inp}>
              {voiceBrands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div className={lbl}>Blog</div>
            <select value={form.blog_key} onChange={e => { setForm(p => ({ ...p, blog_key: e.target.value })); setSuggestions(null); setSuggestError(""); }} className={inp}>
              {brandBlogs.map(bl => <option key={bl.key} value={bl.key}>{bl.label}</option>)}
            </select>
          </div>
          <div>
            <div className={lbl}>Target keyword</div>
            <input value={form.target_keyword} onChange={e => setForm(p => ({ ...p, target_keyword: e.target.value }))} placeholder="optional" className={inp} />
          </div>
          <div>
            <div className={lbl}>Site role</div>
            <select value={form.site_role} onChange={e => setForm(p => ({ ...p, site_role: e.target.value }))} className={inp}>
              <option value="cluster">Cluster (product-specific)</option>
              <option value="hero">Hero (broad buying guide)</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between mb-1">
              <div className={lbl + " mb-0"}>Topic / brief *</div>
              <button type="button" onClick={suggestTopics} disabled={suggestBusy || !form.brand_name} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                {suggestBusy ? "Thinking…" : "✨ Suggest SEO topics"}
              </button>
            </div>
            <textarea value={form.brief} onChange={e => setForm(p => ({ ...p, brief: e.target.value }))} rows={2} placeholder="e.g. Is the Frida Mom Postpartum Recovery Kit worth it? What's actually in it and who it's for." className={inp} />
          </div>
        </div>

        {suggestError && <p className="text-[13px] text-red-500 mt-2">{suggestError}</p>}
        {suggestions && (
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => useSuggestion(s)} className="text-left bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 transition-colors">
                <p className="text-[13px] font-semibold text-slate-700 leading-snug">{s.title}</p>
                <p className="text-[11px] text-emerald-700 mt-1">{s.target_keyword}{s.intent ? ` · ${s.intent}` : ""}</p>
                <p className="text-[11px] text-gray-400 mt-1">{s.why}</p>
              </button>
            ))}
          </div>
        )}

        {msg && <p className="text-[13px] text-slate-500 mt-2">{msg}</p>}
        <button onClick={generate} disabled={busy || !voiceBrands.length} className="mt-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Working…" : "Generate draft"}</button>
        {!voiceBrands.length && <p className="text-xs text-amber-600 mt-2">No brand voice guides are wired up yet.</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["planned", "draft", "published", "rejected", "all"] as const).map(s => (
          <button key={s} onClick={() => setStatusF(s)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${statusF === s ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            {s === "all" ? "All" : STATUS_META[s].label} ({s === "all" ? items.length : items.filter(i => i.status === s).length})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(d => {
            const isOpen = openId === d.id;
            const brand = brandOf(d.brand_id);
            const blogLabel = voices[brand?.name ?? ""]?.blogs.find(bl => bl.key === d.blog_key)?.label ?? d.blog_key;
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => openDraft(d)} className="w-full text-left px-5 py-3.5 flex items-center gap-3">
                  <span className={`text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0 ${STATUS_META[d.status].cls}`}>{STATUS_META[d.status].label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 truncate">{d.title}</div>
                    <div className="text-xs text-gray-400">
                      {brand?.name ?? "—"} · {blogLabel} · {d.status === "planned" && d.scheduled_for ? <span className="font-semibold text-sky-600">Suggested {fmtD(d.scheduled_for)}</span> : fmtD(d.created_at)}
                      {d.target_keyword ? ` · "${d.target_keyword}"` : ""}
                    </div>
                  </div>
                  {d.status === "planned" && <button onClick={e => { e.stopPropagation(); useThisBrief(d); }} className="text-xs font-semibold text-emerald-600 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 shrink-0">Use this brief ↑</button>}
                  {d.published_url && <a href={d.published_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs font-semibold text-indigo-600 hover:underline shrink-0">View live ↗</a>}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                    {d.status === "planned" ? (
                      <>
                        <p className="text-sm text-slate-600">{d.brief}</p>
                        {d.intent && <p className="text-xs text-gray-400">Intent: {d.intent}</p>}
                        <div className="flex items-center gap-2">
                          <button onClick={() => useThisBrief(d)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">Use this brief ↑</button>
                          <button onClick={() => remove(d.id)} className={`text-sm font-semibold ${confirmDeleteId === d.id ? "text-rose-600" : "text-gray-300 hover:text-rose-500"}`}>{confirmDeleteId === d.id ? "Click again to delete" : "Delete"}</button>
                        </div>
                      </>
                    ) : d.status === "draft" ? (
                      <>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div><div className={lbl}>Title</div><input value={edit.title ?? ""} onChange={e => setEdit(p => ({ ...p, title: e.target.value }))} className={inp} /></div>
                          <div><div className={lbl}>Slug</div><input value={edit.slug ?? ""} onChange={e => setEdit(p => ({ ...p, slug: e.target.value }))} className={inp} /></div>
                          <div><div className={lbl}>Meta title</div><input value={edit.meta_title ?? ""} onChange={e => setEdit(p => ({ ...p, meta_title: e.target.value }))} className={inp} /></div>
                          <div><div className={lbl}>Target keyword</div><input value={edit.target_keyword ?? ""} onChange={e => setEdit(p => ({ ...p, target_keyword: e.target.value }))} className={inp} /></div>
                          <div className="sm:col-span-2"><div className={lbl}>Meta description</div><input value={edit.meta_description ?? ""} onChange={e => setEdit(p => ({ ...p, meta_description: e.target.value }))} className={inp} /></div>
                        </div>
                        <div>
                          <div className={lbl}>Featured image</div>
                          <div className="flex items-center gap-3">
                            {d.image_url && <img src={d.image_url} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-200 shrink-0" />}
                            <label className="text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 cursor-pointer">
                              {uploadingId === d.id ? "Uploading…" : d.image_url ? "Replace image" : "Upload image"}
                              <input type="file" accept="image/*" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) uploadImage(d.id, f); ev.currentTarget.value = ""; }} />
                            </label>
                            <span className="text-[11px] text-gray-400">This becomes the article's featured image on Shopify — inline images inside the body still need adding in Shopify's editor.</span>
                          </div>
                          {uploadingId === d.id || (openId === d.id && msg && /image/i.test(msg)) ? <p className={`text-xs mt-1.5 ${msg.startsWith("Image upload failed") ? "text-rose-500" : "text-emerald-600"}`}>{msg}</p> : null}
                        </div>
                        <div>
                          <div className={lbl}>Body (HTML — as it'll appear on Shopify)</div>
                          <textarea value={edit.body_html ?? ""} onChange={e => setEdit(p => ({ ...p, body_html: e.target.value }))} rows={16} className={`${inp} font-mono text-xs`} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button onClick={saveEdit} disabled={busy} className="text-sm font-semibold text-slate-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-2">Save changes</button>
                          {admin && !confirmingApprove && <button onClick={() => setConfirmingApprove(true)} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">Approve & publish live</button>}
                          {!admin && <span className="text-xs text-gray-400">Only an admin can publish this live.</span>}
                          {!showReject && <button onClick={() => setShowReject(true)} disabled={busy} className="text-sm font-semibold text-rose-500 hover:text-rose-600 ml-auto">Reject</button>}
                          <button onClick={() => remove(d.id)} disabled={busy} className={`text-sm font-semibold ${confirmDeleteId === d.id ? "text-rose-600" : "text-gray-300 hover:text-rose-500"}`}>{confirmDeleteId === d.id ? "Click again to delete" : "Delete"}</button>
                        </div>
                        {confirmingApprove && (
                          <div className={`border rounded-lg p-3 space-y-2 ${approveError ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-sm text-emerald-800">Publish this live to the brand&apos;s blog right now? This is the only approval step — there&apos;s no draft stage on Shopify.</span>
                              <div className="flex gap-2 ml-auto">
                                <button onClick={approve} disabled={busy} className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 whitespace-nowrap">{busy ? "Publishing…" : approveError ? "Try again" : "Yes, publish now"}</button>
                                <button onClick={() => { setConfirmingApprove(false); setApproveError(""); }} disabled={busy} className="text-sm font-semibold text-gray-500 hover:text-gray-700 px-3">Cancel</button>
                              </div>
                            </div>
                            {approveError && <p className="text-sm text-rose-700 font-medium">Publish failed: {approveError}</p>}
                          </div>
                        )}
                        {showReject && (
                          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
                            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} placeholder="Why is this getting rejected? (optional — helps refine future briefs)" className={`${inp} bg-white`} />
                            <div className="flex gap-2 justify-end">
                              <button onClick={reject} disabled={busy} className="text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-4 py-2">{busy ? "Rejecting…" : "Confirm reject"}</button>
                              <button onClick={() => { setShowReject(false); setRejectNote(""); }} disabled={busy} className="text-sm font-semibold text-gray-500 hover:text-gray-700 px-3">Cancel</button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {d.status === "published" && (
                          <p className="text-xs text-gray-500">Published {d.published_at ? fmtD(d.published_at) : ""} by {d.approved_by} — {d.published_url ? <a href={d.published_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{d.published_url}</a> : "no live link recorded"}</p>
                        )}
                        {d.status === "rejected" && d.note && <p className="text-xs text-rose-500">Rejected: {d.note}</p>}
                        {d.image_url && <img src={d.image_url} alt="" className="w-full max-w-xs rounded-lg object-cover border border-gray-200" />}
                        <div className="prose-sm max-w-none text-sm text-slate-700 bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: d.body_html }} />
                        <button onClick={() => remove(d.id)} className={`text-xs font-semibold ${confirmDeleteId === d.id ? "text-rose-600" : "text-gray-300 hover:text-rose-500"}`}>{confirmDeleteId === d.id ? "Click again to delete" : "Delete"}</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
