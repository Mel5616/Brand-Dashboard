"use client";

import { useEffect, useMemo, useState } from "react";

// Social Writing (Owned & Earned > Social Writing) — caption/hashtags/visual
// direction drafts written in-brand from a one-line brief, reviewed here,
// copied out to whatever posts it (no publishing API exists for any
// platform), then marked posted. Structurally a close mirror of
// EmailStudio.tsx; see SOCIAL_VOICE in src/app/api/social-drafts/route.ts
// to add another brand.
type Draft = {
  id: string; brand_id: number; status: "draft" | "approved" | "posted" | "rejected";
  platform: string; format: string | null; caption: string; hashtags: string | null; visual_direction: string | null;
  brief: string | null; note: string | null; scheduled_for: string | null;
  campaign_id: string | null; campaign_name: string | null;
  created_by: string | null; approved_by: string | null; posted_at: string | null; created_at: string;
};

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-400 w-full";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1";
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Needs review", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", cls: "bg-sky-100 text-sky-700" },
  posted: { label: "Posted", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-gray-100 text-gray-400" },
};
const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  instagram: { label: "Instagram", icon: "📷" }, tiktok: { label: "TikTok", icon: "🎵" },
  facebook: { label: "Facebook", icon: "📘" }, pinterest: { label: "Pinterest", icon: "📌" },
};
const PLATFORMS = ["instagram", "tiktok", "facebook", "pinterest"];
const FORMATS = ["feed", "reel", "story", "carousel"];

export function SocialStudio({ brands, admin, openDraftId, onOpened }: { brands: { id: number; name: string }[]; admin: boolean; openDraftId?: string | null; onOpened?: () => void }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [voices, setVoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Draft>>({});
  const [statusF, setStatusF] = useState<"all" | Draft["status"]>("draft");

  const voiceBrands = useMemo(() => brands.filter(b => voices[b.name]), [brands, voices]);
  const [form, setForm] = useState({ brand_name: "", brief: "", platform: "instagram", format: "feed", scheduled_for: "" });

  async function load() {
    const res = await fetch("/api/social-drafts").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setVoices(res.socialVoices || {}); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!form.brand_name && voiceBrands.length) setForm(p => ({ ...p, brand_name: voiceBrands[0].name }));
  }, [voiceBrands]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openDraftId) return;
    const d = items.find(i => i.id === openDraftId);
    if (!d) return;
    setStatusF(d.status); setOpenId(d.id); setEdit(d); onOpened?.();
  }, [openDraftId, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const brandOf = (id: number) => brands.find(b => b.id === id);

  async function generate() {
    setMsg("");
    if (!form.brand_name || !form.brief.trim()) { setMsg("Pick a brand and give it a topic/brief."); return; }
    const brandId = brands.find(b => b.name === form.brand_name)?.id;
    if (brandId == null) { setMsg("Unknown brand."); return; }
    setBusy(true); setMsg("Writing…");
    const d = await fetch("/api/social-drafts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: brandId, brand_name: form.brand_name, brief: form.brief, platform: form.platform, format: form.format, scheduled_for: form.scheduled_for || null }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setForm(p => ({ ...p, brief: "", scheduled_for: "" })); load(); setMsg("Draft ready — review it below."); setStatusF("draft"); setOpenId(d.item.id); setEdit(d.item);
    } else { setNeedsSetup(!!d?.needsSetup); setMsg(d?.error || "Couldn't generate that draft."); }
  }

  function openDraft(d: Draft) { setOpenId(d.id === openId ? null : d.id); setEdit(d); setMsg(""); setConfirmDeleteId(null); setShowReject(false); setRejectNote(""); }

  async function saveEdit() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/social-drafts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: openId, action: "edit", caption: edit.caption, hashtags: edit.hashtags, visual_direction: edit.visual_direction, scheduled_for: edit.scheduled_for }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setMsg("Saved."); load(); } else setMsg(d?.error || "Couldn't save.");
  }

  async function markPosted() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/social-drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openId, action: "mark-posted" }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setMsg("Marked posted ✓"); setOpenId(null); load(); } else setMsg(d?.error || "Couldn't update.");
  }

  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  async function reject() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/social-drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openId, action: "reject", note: rejectNote }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setOpenId(null); setShowReject(false); setRejectNote(""); load(); } else setMsg(d?.error || "Couldn't reject.");
  }

  const [copiedId, setCopiedId] = useState<string | null>(null);
  async function copyPost(d: Draft) {
    const text = `${edit.caption ?? d.caption}\n\n${edit.hashtags ?? d.hashtags ?? ""}`.trim();
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); setCopiedId(d.id); setTimeout(() => setCopiedId(null), 2500); return; }
    } catch { /* fall through */ }
    setMsg("Couldn't copy automatically — select the caption below and copy it manually.");
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  async function remove(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    await fetch(`/api/social-drafts?id=${id}`, { method: "DELETE" });
    if (openId === id) setOpenId(null);
    load();
  }

  const rows = items.filter(i => statusF === "all" || i.status === statusF)
    .sort((a, b) => (a.scheduled_for || "9999").localeCompare(b.scheduled_for || "9999") || b.created_at.localeCompare(a.created_at));

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Social Writing isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_social_drafts.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-pink-600 mb-1">New social draft</p>
        <p className="text-xs text-gray-400 mb-3">Written to that brand&apos;s voice from a one-line brief. Nothing posts itself — copy it out when it's ready.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className={lbl}>Brand</div>
            <select value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))} className={inp}>
              {voiceBrands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div className={lbl}>Platform</div>
            <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} className={inp}>
              {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_META[p].icon} {PLATFORM_META[p].label}</option>)}
            </select>
          </div>
          <div>
            <div className={lbl}>Format</div>
            <select value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))} className={inp}>
              {FORMATS.map(f => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <div className={lbl}>Target post date (optional)</div>
            <input type="date" value={form.scheduled_for} onChange={e => setForm(p => ({ ...p, scheduled_for: e.target.value }))} className={inp} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <div className={lbl}>Topic / brief *</div>
            <textarea value={form.brief} onChange={e => setForm(p => ({ ...p, brief: e.target.value }))} rows={2} placeholder="e.g. Real bag unpacking — used every day vs never opened, checklist CTA in bio." className={inp} />
          </div>
        </div>
        {msg && <p className="text-[13px] text-slate-500 mt-2">{msg}</p>}
        <button onClick={generate} disabled={busy || !voiceBrands.length} className="mt-3 text-sm font-semibold text-white bg-pink-500 hover:bg-pink-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Working…" : "Generate draft"}</button>
        {!voiceBrands.length && <p className="text-xs text-amber-600 mt-2">No brand voice guides are wired up yet.</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["draft", "approved", "posted", "rejected", "all"] as const).map(s => (
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
            const pm = PLATFORM_META[d.platform] ?? PLATFORM_META.instagram;
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => openDraft(d)} className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50/60">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 shrink-0 ${STATUS_META[d.status].cls}`}>{STATUS_META[d.status].label}</span>
                  <span className="text-base shrink-0" title={pm.label}>{pm.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{d.caption.split("\n")[0]}</p>
                    <p className="text-[12px] text-gray-400 truncate">
                      {brand?.name ?? "—"} · {pm.label}{d.format ? ` (${d.format})` : ""} · {d.scheduled_for ? fmtD(d.scheduled_for) : fmtD(d.created_at)}
                      {d.campaign_id && <span className="font-semibold text-fuchsia-600"> · Part of {d.campaign_name ?? "a campaign"}</span>}
                    </p>
                  </div>
                  <span className="text-gray-300 text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                    <div>
                      <div className={lbl}>Caption</div>
                      <textarea value={edit.caption ?? ""} onChange={e => setEdit(p => ({ ...p, caption: e.target.value }))} rows={5} className={inp + " resize-y leading-relaxed"} disabled={!admin && d.status !== "draft"} />
                    </div>
                    <div>
                      <div className={lbl}>Hashtags</div>
                      <input value={edit.hashtags ?? ""} onChange={e => setEdit(p => ({ ...p, hashtags: e.target.value }))} className={inp} disabled={!admin && d.status !== "draft"} />
                    </div>
                    <div>
                      <div className={lbl}>Visual direction <span className="font-normal lowercase text-gray-300">· briefs whoever shoots/designs it</span></div>
                      <textarea value={edit.visual_direction ?? ""} onChange={e => setEdit(p => ({ ...p, visual_direction: e.target.value }))} rows={2} className={inp} disabled={!admin && d.status !== "draft"} />
                    </div>
                    {d.note && <p className="text-xs text-rose-500">Rejected: {d.note}</p>}
                    {d.posted_at && <p className="text-xs text-emerald-600">Posted {fmtD(d.posted_at)}{d.approved_by ? ` by ${d.approved_by}` : ""}</p>}

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => copyPost(d)} className="text-sm font-semibold text-pink-700 bg-pink-50 border border-pink-200 hover:bg-pink-100 rounded-lg px-4 py-2">{copiedId === d.id ? "Copied ✓" : "Copy caption + hashtags"}</button>
                      {d.status !== "posted" && d.status !== "rejected" && (
                        <>
                          <button onClick={saveEdit} disabled={busy} className="text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-4 py-2 disabled:opacity-60">Save changes</button>
                          <button onClick={markPosted} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">Mark posted</button>
                          {admin && <button onClick={() => setShowReject(s => !s)} className="text-sm font-semibold text-gray-500 hover:text-rose-600 rounded-lg px-3 py-2">Reject</button>}
                        </>
                      )}
                      <button onClick={() => remove(d.id)} className={`text-sm font-semibold rounded-lg px-3 py-2 ${confirmDeleteId === d.id ? "text-white bg-rose-600 hover:bg-rose-700" : "text-gray-400 hover:text-rose-500"}`}>{confirmDeleteId === d.id ? "Confirm delete" : "Delete"}</button>
                    </div>
                    {showReject && (
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-2">
                        <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Why? (optional, visible only here)" rows={2} className={inp} />
                        <div className="flex gap-2">
                          <button onClick={reject} disabled={busy} className="text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-4 py-2">Confirm reject</button>
                          <button onClick={() => setShowReject(false)} className="text-sm font-semibold text-gray-500 rounded-lg px-3 py-2">Cancel</button>
                        </div>
                      </div>
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
