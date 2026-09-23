"use client";

import { useEffect, useMemo, useState } from "react";
import { KlaviyoSendPanel } from "./KlaviyoSend";

// Email Writing (Owned & Earned > Email Writing) — full EDM drafts written
// in-brand from a one-line brief, reviewed here, then pushed straight to
// Klaviyo via the existing KlaviyoSendPanel on approval. Structurally a
// close mirror of BlogStudio.tsx; see EMAIL_VOICE in
// src/app/api/edm-drafts/route.ts to add another brand.
type Draft = {
  id: string; brand_id: number; status: "planned" | "draft" | "sent" | "rejected";
  channel: "email" | "sms";
  subject: string; preview_text: string | null; body_html: string; sms_text: string | null;
  brief: string | null; note: string | null; scheduled_for: string | null; image_url: string | null;
  klaviyo_campaign_id: string | null; published_url: string | null;
  campaign_id: string | null; campaign_name: string | null;
  created_by: string | null; approved_by: string | null; published_at: string | null; created_at: string;
};

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1";
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const STATUS_META: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "bg-sky-100 text-sky-700" },
  draft: { label: "Needs review", cls: "bg-amber-100 text-amber-700" },
  sent: { label: "Sent", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-gray-100 text-gray-400" },
};

export function EmailStudio({ brands, admin, openDraftId, onOpened }: { brands: { id: number; name: string }[]; admin: boolean; openDraftId?: string | null; onOpened?: () => void }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [voices, setVoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Draft>>({});
  const [statusF, setStatusF] = useState<"all" | Draft["status"]>("draft");
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);

  const voiceBrands = useMemo(() => brands.filter(b => voices[b.name]), [brands, voices]);
  const [form, setForm] = useState({ brand_name: "", brief: "", scheduled_for: "", image_url: "", channel: "email" as "email" | "sms" });
  const [supersedeId, setSupersedeId] = useState<string | null>(null);
  const [uploadingNew, setUploadingNew] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/edm-drafts/upload-image", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    return res?.ok ? res.url : null;
  }

  async function load() {
    const res = await fetch("/api/edm-drafts").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setVoices(res.emailVoices || {}); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!form.brand_name && voiceBrands.length) setForm(p => ({ ...p, brand_name: voiceBrands[0].name }));
  }, [voiceBrands]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jumped here from "Send as EDM →" in Blog Writing — open that new draft
  // as soon as it shows up in the loaded list, then clear the pending id.
  useEffect(() => {
    if (!openDraftId) return;
    const d = items.find(i => i.id === openDraftId);
    if (!d) return;
    setStatusF(d.status); setOpenId(d.id); setEdit(d); onOpened?.();
  }, [openDraftId, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const brandOf = (id: number) => brands.find(b => b.id === id);

  function useThisBrief(d: Draft) {
    const brandName = brandOf(d.brand_id)?.name ?? "";
    setForm({ brand_name: brandName, brief: d.brief || d.subject, scheduled_for: d.scheduled_for || "", image_url: "", channel: d.channel ?? "email" });
    setSupersedeId(d.id);
    setOpenId(null);
    setMsg(`Loaded "${d.subject}" into the generator above — hit Generate draft when ready.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate() {
    setMsg("");
    if (!form.brand_name || !form.brief.trim()) { setMsg("Pick a brand and give it a topic/brief."); return; }
    const brandId = brands.find(b => b.name === form.brand_name)?.id;
    if (brandId == null) { setMsg("Unknown brand."); return; }
    setBusy(true); setMsg(form.channel === "sms" ? "Writing…" : "Writing — this takes a minute…");
    const d = await fetch("/api/edm-drafts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: brandId, brand_name: form.brand_name, brief: form.brief, scheduled_for: form.scheduled_for || null, source_image_url: form.image_url || undefined, channel: form.channel }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      if (supersedeId) { await fetch(`/api/edm-drafts?id=${supersedeId}`, { method: "DELETE" }).catch(() => {}); setSupersedeId(null); }
      setForm(p => ({ ...p, brief: "", scheduled_for: "", image_url: "" })); load(); setMsg("Draft ready — review it below."); setStatusF("draft"); setOpenId(d.item.id); setEdit(d.item);
    } else { setNeedsSetup(!!d?.needsSetup); setMsg(d?.error || "Couldn't generate that draft."); }
  }

  function openDraft(d: Draft) { setOpenId(d.id === openId ? null : d.id); setEdit(d); setMsg(""); setConfirmDeleteId(null); setShowReject(false); setRejectNote(""); }

  async function replaceHeroImage(d: Draft, file: File) {
    setUploadingFor(d.id);
    const url = await uploadImage(file);
    setUploadingFor(null);
    if (!url) { setMsg("Couldn't upload that image — try again."); return; }
    const currentBody = edit.body_html ?? d.body_html;
    const currentImage = edit.image_url ?? d.image_url;
    const newBody = currentImage ? currentBody.split(currentImage).join(url) : currentBody;
    setEdit(p => ({ ...p, image_url: url, body_html: newBody }));
    setBusy(true);
    const res = await fetch("/api/edm-drafts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, action: "edit", image_url: url, body_html: newBody }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) { setMsg(currentImage ? "Hero image swapped." : "Image uploaded — add it into the Body HTML below if it didn't have one already."); load(); }
    else setMsg(res?.error || "Couldn't save the new image.");
  }

  async function saveEdit() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/edm-drafts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: openId, action: "edit", subject: edit.subject, preview_text: edit.preview_text, body_html: edit.body_html, sms_text: edit.sms_text, scheduled_for: edit.scheduled_for }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setMsg("Saved."); load(); } else setMsg(d?.error || "Couldn't save.");
  }

  async function markSent(openIdAtSend: string, sent: { item?: any }) {
    const d = await fetch("/api/edm-drafts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: openIdAtSend, action: "mark-sent", klaviyo_campaign_id: sent.item?.campaign_id ?? null }),
    }).then(r => r.json()).catch(() => null);
    if (d?.ok) { setMsg("Sent ✓ — pushed to Klaviyo."); setOpenId(null); load(); }
    else setMsg(d?.error || "Sent to Klaviyo, but couldn't update the record here — check the draft's status manually.");
  }

  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  async function reject() {
    if (!openId) return;
    setBusy(true);
    const d = await fetch("/api/edm-drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openId, action: "reject", note: rejectNote }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setOpenId(null); setShowReject(false); setRejectNote(""); load(); } else setMsg(d?.error || "Couldn't reject.");
  }

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  async function copyHtml(id: string, html: string) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(html); setCopiedId(id); setTimeout(() => setCopiedId(null), 2500); return; }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = html; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(id); setTimeout(() => setCopiedId(null), 2500);
    } catch { setMsg("Couldn't copy automatically — select the HTML below and copy it manually."); }
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  async function remove(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    await fetch(`/api/edm-drafts?id=${id}`, { method: "DELETE" });
    if (openId === id) setOpenId(null);
    load();
  }

  const rows = items.filter(i => seriesFilter ? i.campaign_id === seriesFilter : (statusF === "all" || i.status === statusF))
    .sort((a, b) => (a.scheduled_for || "9999").localeCompare(b.scheduled_for || "9999") || a.created_at.localeCompare(b.created_at));
  const seriesCount = (campaignId: string) => items.filter(i => i.campaign_id === campaignId).length;

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Email Writing isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_edm_drafts.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-1">New EDM draft</p>
        <p className="text-xs text-gray-400 mb-3">Written to that brand&apos;s voice from a one-line brief. Nothing sends until you push it to Klaviyo and confirm below.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <div className={lbl}>Brand</div>
            <select value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))} className={inp}>
              {voiceBrands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div className={lbl}>Channel</div>
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5 w-full">
              {(["email", "sms"] as const).map(ch => (
                <button key={ch} type="button" onClick={() => setForm(p => ({ ...p, channel: ch }))}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold capitalize ${form.channel === ch ? "bg-white shadow-sm text-emerald-700" : "text-gray-400 hover:text-gray-600"}`}>
                  {ch === "sms" ? "SMS" : "Email"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={lbl}>Target send date (optional)</div>
            <input type="date" value={form.scheduled_for} onChange={e => setForm(p => ({ ...p, scheduled_for: e.target.value }))} className={inp} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <div className={lbl}>Topic / brief *</div>
            <textarea value={form.brief} onChange={e => setForm(p => ({ ...p, brief: e.target.value }))} rows={2} placeholder="e.g. Spring sale on the Wonder max range, 20% off this weekend only." className={inp} />
          </div>
          {form.channel === "email" && <div className="sm:col-span-2 lg:col-span-3">
            <div className={lbl}>Hero image (optional — upload your own instead of an auto-picked product photo)</div>
            {form.image_url ? (
              <div className="flex items-center gap-3">
                <img src={form.image_url} alt="Hero" className="h-14 w-14 object-cover rounded-lg border border-gray-200" />
                <button onClick={() => setForm(p => ({ ...p, image_url: "" }))} className="text-xs font-semibold text-gray-400 hover:text-rose-500">Remove</button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100">
                {uploadingNew ? "Uploading…" : "Upload an image"}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingNew}
                  onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    setUploadingNew(true);
                    const url = await uploadImage(file);
                    setUploadingNew(false);
                    if (url) setForm(p => ({ ...p, image_url: url })); else setMsg("Couldn't upload that image — try again.");
                    e.target.value = "";
                  }} />
              </label>
            )}
          </div>}
        </div>
        {msg && <p className="text-[13px] text-slate-500 mt-2">{msg}</p>}
        <button onClick={generate} disabled={busy || !voiceBrands.length} className="mt-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Working…" : "Generate draft"}</button>
        {!voiceBrands.length && <p className="text-xs text-amber-600 mt-2">No brand voice guides are wired up yet.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["planned", "draft", "sent", "rejected", "all"] as const).map(s => (
          <button key={s} onClick={() => setStatusF(s)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${statusF === s ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            {s === "all" ? "All" : STATUS_META[s].label} ({s === "all" ? items.length : items.filter(i => i.status === s).length})
          </button>
        ))}
        {seriesFilter && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-full px-3 py-1.5">
            Series: {items.find(i => i.campaign_id === seriesFilter)?.campaign_name ?? "campaign"}
            <button onClick={() => setSeriesFilter(null)} className="text-fuchsia-400 hover:text-fuchsia-700">✕</button>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(d => {
            const isOpen = openId === d.id;
            const brand = brandOf(d.brand_id);
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => openDraft(d)} className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50/60">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 shrink-0 ${STATUS_META[d.status].cls}`}>{STATUS_META[d.status].label}</span>
                  {d.channel === "sms" && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 shrink-0 bg-violet-100 text-violet-700">SMS</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{d.channel === "sms" ? (d.sms_text || d.brief || "Untitled") : d.subject}</p>
                    <p className="text-[12px] text-gray-400 truncate">
                      {brand?.name ?? "—"} · {d.status === "planned" && d.scheduled_for ? <span className="font-semibold text-sky-600">Suggested {fmtD(d.scheduled_for)}</span> : fmtD(d.created_at)}
                      {d.campaign_id && (
                        <>
                          {" · "}
                          <button onClick={e => { e.stopPropagation(); setSeriesFilter(d.campaign_id); }} className="font-semibold text-fuchsia-600 hover:text-fuchsia-800 hover:underline">
                            Part of {d.campaign_name ?? "a campaign"} ({seriesCount(d.campaign_id)})
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                  {d.status === "planned" && <button onClick={e => { e.stopPropagation(); useThisBrief(d); }} className="text-xs font-semibold text-emerald-600 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 shrink-0">Use this brief ↑</button>}
                  <span className="text-gray-300 text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && d.status !== "planned" && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                    {d.channel === "sms" ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className={lbl + " mb-0"}>Message</div>
                          <span className={`text-[11px] font-semibold ${(edit.sms_text ?? d.sms_text ?? "").length > 300 ? "text-rose-500" : "text-gray-400"}`}>{(edit.sms_text ?? d.sms_text ?? "").length} / 300</span>
                        </div>
                        <textarea value={edit.sms_text ?? ""} onChange={e => setEdit(p => ({ ...p, sms_text: e.target.value }))} rows={4} className={inp} disabled={!admin && d.status !== "draft"} />
                        <button onClick={() => copyHtml(d.id, edit.sms_text ?? d.sms_text ?? "")} className="mt-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">{copiedId === d.id ? "Copied ✓" : "Copy message"}</button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className={lbl}>Subject</div>
                          <input value={edit.subject ?? ""} onChange={e => setEdit(p => ({ ...p, subject: e.target.value }))} className={inp} disabled={!admin && d.status !== "draft"} />
                        </div>
                        <div>
                          <div className={lbl}>Preview text</div>
                          <input value={edit.preview_text ?? ""} onChange={e => setEdit(p => ({ ...p, preview_text: e.target.value }))} className={inp} disabled={!admin && d.status !== "draft"} />
                        </div>
                        {d.status === "draft" && (
                          <div>
                            <div className={lbl}>Hero image</div>
                            <div className="flex items-center gap-3">
                              {(edit.image_url ?? d.image_url) && <img src={edit.image_url ?? d.image_url ?? ""} alt="Hero" className="h-12 w-12 object-cover rounded-lg border border-gray-200" />}
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100">
                                {uploadingFor === d.id ? "Uploading…" : (edit.image_url ?? d.image_url) ? "Replace image" : "Upload an image"}
                                <input type="file" accept="image/*" className="hidden" disabled={uploadingFor === d.id}
                                  onChange={e => { const file = e.target.files?.[0]; if (file) replaceHeroImage(d, file); e.target.value = ""; }} />
                              </label>
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className={lbl + " mb-0"}>Body HTML</div>
                            <div className="flex items-center gap-3">
                              <button onClick={() => setPreviewId(previewId === d.id ? null : d.id)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">{previewId === d.id ? "Hide preview" : "Preview"}</button>
                              {previewId === d.id && <button onClick={() => setFullscreenId(d.id)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Full screen ⤢</button>}
                              <button onClick={() => copyHtml(d.id, edit.body_html ?? d.body_html)} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">{copiedId === d.id ? "Copied ✓" : "Copy HTML"}</button>
                            </div>
                          </div>
                          {previewId === d.id && (
                            <iframe title="Email preview" srcDoc={edit.body_html ?? d.body_html} className="w-full h-[480px] border border-gray-200 rounded-lg mb-2 bg-white" />
                          )}
                          <textarea value={edit.body_html ?? ""} onChange={e => setEdit(p => ({ ...p, body_html: e.target.value }))} rows={12} className={inp + " font-mono text-xs"} disabled={!admin && d.status !== "draft"} />
                          <p className="text-[11px] text-gray-400 mt-1">Copy this HTML to paste straight into Klaviyo&apos;s own code/HTML editor as an alternative to pushing it below.</p>
                        </div>
                      </>
                    )}
                    {d.note && <p className="text-xs text-rose-500">Rejected: {d.note}</p>}
                    {d.published_url && <p className="text-xs text-emerald-600">Sent — <a href={d.published_url} target="_blank" rel="noopener noreferrer" className="underline">view in Klaviyo</a></p>}

                    {d.status === "draft" && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={saveEdit} disabled={busy} className="text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-4 py-2 disabled:opacity-60">Save changes</button>
                          {d.channel === "sms" && admin && <button onClick={() => markSent(d.id, {})} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">Mark sent</button>}
                          {admin && <button onClick={() => setShowReject(s => !s)} className="text-sm font-semibold text-gray-500 hover:text-rose-600 rounded-lg px-3 py-2">Reject</button>}
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

                        {admin && d.channel !== "sms" && (
                          <div className="pt-2">
                            <KlaviyoSendPanel
                              getHtml={() => edit.body_html || d.body_html}
                              defaultSubject={edit.subject || d.subject}
                              brandId={d.brand_id}
                              openByDefault
                              onSent={sent => markSent(d.id, sent)}
                            />
                          </div>
                        )}
                        {d.channel === "sms" && <p className="text-[11px] text-gray-400">No SMS send integration here yet — copy the message and send it from Klaviyo directly, then mark it sent above.</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fullscreenId && (() => {
        const d = items.find(i => i.id === fullscreenId);
        if (!d) return null;
        const html = (openId === d.id ? edit.body_html : null) ?? d.body_html;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex flex-col" onClick={() => setFullscreenId(null)}>
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold text-slate-700">{d.subject}</p>
              <button onClick={() => setFullscreenId(null)} className="text-sm font-semibold text-gray-500 hover:text-gray-800">Close ✕</button>
            </div>
            <iframe title="Email preview, full screen" srcDoc={html} className="flex-1 w-full bg-white" onClick={e => e.stopPropagation()} />
          </div>
        );
      })()}
    </div>
  );
}
