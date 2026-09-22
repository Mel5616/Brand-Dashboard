"use client";

import { useEffect, useState } from "react";

// Admin queue for website change requests submitted via the public
// /website-request form. Simple status pipeline: new → in_progress → done
// (or declined).
type Req = {
  id: string; brand: string; page_url: string | null; change_type: string; description: string;
  requester_name: string; requester_email: string; priority: string; status: string;
  admin_note: string | null; created_at: string; attachment_url: string | null; attachment_name: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined", cls: "bg-rose-50 text-rose-400" },
};
const STATUS_LIST = ["new", "in_progress", "done", "declined"];
const TYPE_LABEL: Record<string, string> = { copy: "Copy / text", broken_link: "Broken link", new_page: "New page", image_banner: "Image / banner", product_info: "Product info", other: "Other" };
const TYPE_LIST = ["copy", "broken_link", "new_page", "image_banner", "product_info", "other"];
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const emptyForm = { brand: "", page_url: "", change_type: "other", priority: "normal", description: "" };

export function WebsiteRequestsPanel({ canEdit = false, brands = [] }: { canEdit?: boolean; brands?: string[] }) {
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [statusF, setStatusF] = useState("");
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState("");

  async function load() {
    const res = await fetch("/api/website-requests").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    setItems(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    await fetch("/api/website-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
  }

  async function saveNote(id: string, note: string) {
    setItems(prev => prev.map(r => (r.id === id ? { ...r, admin_note: note } : r)));
    await fetch("/api/website-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, admin_note: note }) });
    setNoteEdit(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this request?")) return;
    await fetch(`/api/website-requests?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(r => r.id !== id));
  }

  async function addIssue() {
    if (!form.brand || !form.description.trim()) { setAddErr("Brand and a description are required."); return; }
    setSaving(true); setAddErr("");
    const res = await fetch("/api/website-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then(r => r.json()).catch(() => null);
    setSaving(false);
    if (res?.ok) { setItems(prev => [res.item, ...prev]); setForm(emptyForm); setAdding(false); }
    else setAddErr(res?.error || "Couldn't save that — try again.");
  }

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Website Requests isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_website_requests.sql</code> in Supabase.
      </div>
    );
  }

  const rows = items.filter(r => !statusF || r.status === statusF);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/website-request` : "/website-request";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-slate-700">Share this link so anyone can submit a website change request</p>
          <p className="text-xs text-gray-400">{shareUrl}</p>
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(shareUrl)}
          className="text-sm font-medium border border-gray-200 text-slate-600 rounded-lg px-4 py-2 hover:bg-slate-50"
        >
          Copy link
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatusF("")} className={`text-sm font-medium rounded-lg px-3 py-1.5 ${!statusF ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>All ({items.length})</button>
        {STATUS_LIST.map(s => (
          <button key={s} onClick={() => setStatusF(s)} className={`text-sm font-medium rounded-lg px-3 py-1.5 ${statusF === s ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
            {STATUS_META[s].label} ({items.filter(r => r.status === s).length})
          </button>
        ))}
        {canEdit && (
          <button onClick={() => { setAdding(p => !p); setAddErr(""); }} className="ml-auto text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5">
            {adding ? "Cancel" : "+ Add issue"}
          </button>
        )}
      </div>

      {adding && canEdit && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Log an issue directly</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</label>
              <select value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">Select a brand…</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Type</label>
              <select value={form.change_type} onChange={e => setForm(p => ({ ...p, change_type: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                {TYPE_LIST.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Page URL (optional)</label>
              <input value={form.page_url} onChange={e => setForm(p => ({ ...p, page_url: e.target.value }))} placeholder="https://…"
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Description</label>
            <textarea autoFocus value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
              placeholder="What needs fixing/changing?"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none" />
          </div>
          {addErr && <p className="text-xs text-rose-500">{addErr}</p>}
          <div className="flex items-center gap-2">
            <button onClick={addIssue} disabled={saving || !form.brand || !form.description.trim()}
              className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">
              {saving ? "Saving…" : "Add issue"}
            </button>
            <button onClick={() => { setAdding(false); setForm(emptyForm); setAddErr(""); }} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No requests here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{r.brand}</span>
                    <span className="text-xs text-gray-400">{TYPE_LABEL[r.change_type] || r.change_type}</span>
                    {r.priority === "urgent" && <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">Urgent</span>}
                  </div>
                  {r.page_url && <a href={r.page_url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline break-all">{r.page_url}</a>}
                </div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_META[r.status]?.cls || "bg-slate-100 text-slate-500"}`}>{STATUS_META[r.status]?.label || r.status}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.description}</p>
              {r.attachment_url && (
                <a href={r.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline">
                  📎 {r.attachment_name || "Attachment"}
                </a>
              )}
              <p className="text-xs text-gray-400">{r.requester_name} · {r.requester_email} · {fmtD(r.created_at)}</p>

              {noteEdit === r.id ? (
                <textarea
                  autoFocus defaultValue={r.admin_note || ""} rows={2} placeholder="Internal note"
                  onBlur={e => saveNote(r.id, e.target.value)}
                  className="w-full text-sm border border-emerald-300 rounded-lg px-2.5 py-1.5 focus:outline-none"
                />
              ) : r.admin_note ? (
                <p onClick={() => canEdit && setNoteEdit(r.id)} className={`text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5 ${canEdit ? "cursor-text" : ""}`}>{r.admin_note}</p>
              ) : canEdit ? (
                <button onClick={() => setNoteEdit(r.id)} className="text-xs text-gray-400 hover:text-slate-600">+ Add note</button>
              ) : null}

              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {STATUS_LIST.map(s => (
                    <button
                      key={s} onClick={() => setStatus(r.id, s)}
                      disabled={r.status === s}
                      className="text-xs border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default"
                    >
                      Mark {STATUS_META[s].label}
                    </button>
                  ))}
                  <button onClick={() => remove(r.id)} className="text-xs border border-rose-200 text-rose-500 rounded-lg px-3 py-1.5 hover:bg-rose-50 ml-auto">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
