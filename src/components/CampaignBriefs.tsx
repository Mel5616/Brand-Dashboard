"use client";

import { useEffect, useMemo, useState } from "react";

// Campaign Briefs (Influencers tab). Admins upload a self-contained creator
// brief (HTML for in-dashboard viewing, optional PDF for download), assign it
// to influencers from the roster (with a quick "gifted for X" filter sourced
// from influencer_entries), and can email it straight to those influencers
// from partnerships@coolkidz.com.au. Everyone signed in can view/download.
type Brief = {
  id: string; title: string; brand: string | null; content_html: string | null;
  pdf_path: string | null; pdf_name: string | null; cover_url: string | null; live_date: string | null;
  status: string; created_by: string | null; created_at: string;
};
type Assignment = { brief_id: string; handle: string; emailed_at: string | null };
type RosterRow = { handle: string; name: string | null; contact: string | null };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const isEmail = (s?: string | null) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function CampaignBriefs({ brands, admin = false }: { brands: { id: number; name: string }[]; admin?: boolean }) {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Brief | null>(null);
  const [assigning, setAssigning] = useState<Brief | null>(null);
  const [sending, setSending] = useState<Brief | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [sendResult, setSendResult] = useState<{ sent: string[]; skipped: { handle: string; reason: string }[] } | null>(null);

  const empty = { title: "", brand: "", live_date: "" };
  const [f, setF] = useState(empty);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [handles, setHandles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/campaign-briefs", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/influencer/roster", { cache: "no-store" }).then(r => r.json()).catch(() => ({ influencers: [] })),
        fetch("/api/influencer/entries", { cache: "no-store" }).then(r => r.json()).catch(() => ({ entries: [] })),
      ]);
      if (r1.ok) { setBriefs(r1.briefs || []); setAssignments(r1.assignments || []); setNeedsSetup(!!r1.needsSetup); }
      setRoster((r2.influencers || []).map((x: any) => ({ handle: x.handle, name: x.name, contact: x.contact })));
      setEntries(r3.entries || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const byHandle = useMemo(() => new Map(roster.map(r => [r.handle, r])), [roster]);
  const assignedTo = (briefId: string) => assignments.filter(a => a.brief_id === briefId);

  // "Select gifted for…" — matches influencer_entries by style_code prefix or
  // free-text campaign/product name, so Mel can pull e.g. everyone gifted MINU
  // V3 without hand-picking names. style_code is the reliable signal; campaign
  // is unenforced free text entered on the team form, so both are checked.
  function handlesTagged(query: string): string[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const norm = (h: string) => { let x = String(h || "").trim().toLowerCase(); if (!x.startsWith("@")) x = "@" + x; return x; };
    const set = new Set<string>();
    for (const e of entries) {
      const hit = String(e.style_code || "").toLowerCase().startsWith(q.replace(/\s+/g, ""))
        || String(e.campaign || "").toLowerCase().includes(q)
        || String(e.product_name || "").toLowerCase().includes(q);
      if (hit && e.handle) set.add(norm(e.handle));
    }
    return roster.map(r => r.handle).filter(h => set.has(norm(h)));
  }

  function resetForm() { setF(empty); setHtmlFile(null); setPdfFile(null); setHandles([]); setTagQuery(""); setShowForm(false); }

  async function submit() {
    if (!f.title.trim()) { setMsg("Title required"); return; }
    setSaving(true); setMsg("");
    try {
      const fd = new FormData();
      fd.set("title", f.title);
      fd.set("brand", f.brand);
      fd.set("live_date", f.live_date);
      if (htmlFile) fd.set("html_file", htmlFile);
      if (pdfFile) fd.set("pdf_file", pdfFile);
      for (const h of handles) fd.append("handles", h);
      const res = await fetch("/api/campaign-briefs", { method: "POST", body: fd }).then(r => r.json());
      if (!res.ok) { setMsg(res.error || "Failed to save"); setSaving(false); return; }
      setMsg(res.fileError ? `Saved, but: ${res.fileError}` : "Brief added");
      resetForm();
      await load();
    } finally { setSaving(false); }
  }

  async function toggleArchive(b: Brief) {
    setBusyId(b.id);
    await fetch("/api/campaign-briefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, status: b.status === "archived" ? "active" : "archived" }) });
    await load(); setBusyId(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this brief? This can't be undone.")) return;
    setBusyId(id);
    await fetch(`/api/campaign-briefs?id=${id}`, { method: "DELETE" });
    await load(); setBusyId(null);
  }

  async function saveAssignment() {
    if (!assigning) return;
    setSaving(true);
    await fetch("/api/campaign-briefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: assigning.id, handles }) });
    setSaving(false); setAssigning(null);
    await load();
  }

  async function sendEmails() {
    if (!sending) return;
    setSaving(true); setSendResult(null);
    const res = await fetch("/api/campaign-briefs/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sending.id, handles }) }).then(r => r.json());
    setSaving(false);
    if (res.ok) { setSendResult({ sent: res.sent || [], skipped: res.skipped || [] }); await load(); }
    else setSendResult({ sent: [], skipped: [{ handle: "", reason: res.error || "Send failed" }] });
  }

  function renderTagPicker(selectable: RosterRow[]) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input className={`${inp} flex-1`} placeholder="Quick-select gifted for… (e.g. MINU, UPM3)" value={tagQuery} onChange={e => setTagQuery(e.target.value)} />
          <button type="button" onClick={() => { const t = handlesTagged(tagQuery); setHandles([...new Set([...handles, ...t])]); }}
            className="text-xs font-medium bg-slate-800 text-white rounded-lg px-3 py-2 hover:bg-slate-900 whitespace-nowrap">
            + Add matches
          </button>
        </div>
        {tagQuery.trim() && <p className="text-xs text-slate-400">{handlesTagged(tagQuery).length} influencer(s) match gifting for &ldquo;{tagQuery}&rdquo;</p>}
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-3">
          {selectable.length === 0 && <span className="text-xs text-slate-400">No influencers in the roster yet.</span>}
          {selectable.map(r => {
            const on = handles.includes(r.handle);
            return (
              <button key={r.handle} type="button"
                onClick={() => setHandles(on ? handles.filter(h => h !== r.handle) : [...handles, r.handle])}
                className={`text-xs rounded-full px-3 py-1.5 border ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-gray-200 hover:border-emerald-300"}`}>
                {r.name || r.handle}{!isEmail(r.contact) ? " · no email" : ""}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const visible = briefs.filter(b => b.status !== "archived" || admin);

  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Campaign Briefs isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_campaign_briefs.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {admin && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Brief the influencers signed up for each campaign — upload the HTML/PDF brief, assign who it&apos;s for, and email it from partnerships@coolkidz.com.au.</p>
          <button onClick={() => setShowForm(s => !s)} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700">
            {showForm ? "Cancel" : "+ Add Brief"}
          </button>
        </div>
      )}

      {showForm && admin && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={inp} placeholder="Title (e.g. MINU V3 Creator Brief)" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
            <select className={inp} value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })}>
              <option value="">Brand (optional)</option>
              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <input className={inp} type="date" value={f.live_date} onChange={e => setF({ ...f, live_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-600">
              Brief HTML (for in-dashboard viewing)
              <input className={`${inp} w-full mt-1`} type="file" accept=".html,text/html" onChange={e => setHtmlFile(e.target.files?.[0] || null)} />
            </label>
            <label className="text-sm text-slate-600">
              Brief PDF (optional, for download + emailing)
              <input className={`${inp} w-full mt-1`} type="file" accept="application/pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-2">Assign to influencers</p>
            {renderTagPicker(roster)}
          </div>
          {msg && <p className="text-sm text-amber-600">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-slate-600">Cancel</button>
            <button onClick={submit} disabled={saving} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save Brief"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">No campaign briefs yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map(b => {
            const who = assignedTo(b.id);
            return (
              <div key={b.id} className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${b.status === "archived" ? "opacity-60" : ""}`}>
                {b.cover_url && (
                  <button onClick={() => setViewing(b)} className="block w-full bg-slate-100" style={{ aspectRatio: "210 / 297" }}>
                    <img src={b.cover_url} alt="" className="w-full h-full object-contain" />
                  </button>
                )}
                <div className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{b.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {b.brand ? `${b.brand} · ` : ""}Live {fmtD(b.live_date)}
                      {b.status === "archived" ? " · Archived" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {who.length === 0 && <span className="text-xs text-slate-300">Not assigned yet</span>}
                  {who.map(a => (
                    <span key={a.handle} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">
                      {byHandle.get(a.handle)?.name || a.handle}{a.emailed_at ? " ✓" : ""}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(b.content_html || b.pdf_path) && (
                    <button onClick={() => setViewing(b)} className="text-xs font-medium bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900">View Brief</button>
                  )}
                  {b.pdf_path && (
                    <a href={`/api/campaign-briefs/file?id=${b.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">Download PDF</a>
                  )}
                  {admin && (
                    <>
                      <button onClick={() => { setAssigning(b); setHandles(who.map(a => a.handle)); }} className="text-xs border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">Assign</button>
                      {who.length > 0 && (b.content_html || b.pdf_path) && (
                        <button onClick={() => { setSending(b); setHandles(who.map(a => a.handle)); setSendResult(null); }} className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700">Email Brief</button>
                      )}
                      <button onClick={() => toggleArchive(b)} disabled={busyId === b.id} className="text-xs border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                        {b.status === "archived" ? "Unarchive" : "Archive"}
                      </button>
                      <button onClick={() => remove(b.id)} disabled={busyId === b.id} className="text-xs border border-rose-200 text-rose-500 rounded-lg px-3 py-1.5 hover:bg-rose-50">Delete</button>
                    </>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl w-full max-w-3xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-medium text-slate-800">{viewing.title}</p>
              <button onClick={() => setViewing(null)} className="text-sm text-slate-400 hover:text-slate-600">Close ✕</button>
            </div>
            {viewing.pdf_path ? (
              <iframe title={viewing.title} src={`/api/campaign-briefs/file?id=${viewing.id}`} className="flex-1 w-full rounded-b-xl" />
            ) : (
              <iframe title={viewing.title} sandbox="allow-same-origin" srcDoc={viewing.content_html || ""} className="flex-1 w-full rounded-b-xl" />
            )}
          </div>
        </div>
      )}

      {assigning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAssigning(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-medium text-slate-800">Assign — {assigning.title}</p>
            {renderTagPicker(roster)}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAssigning(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-slate-600">Cancel</button>
              <button onClick={saveAssignment} disabled={saving} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSending(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-medium text-slate-800">Email — {sending.title}</p>
            <p className="text-xs text-slate-400">Sends from partnerships@coolkidz.com.au, one email per influencer, with {sending.pdf_path ? "the PDF" : "the brief"} attached.</p>
            <div className="space-y-1 max-h-52 overflow-y-auto border border-gray-100 rounded-lg p-3">
              {handles.map(h => {
                const r = byHandle.get(h);
                const ok = isEmail(r?.contact);
                return (
                  <div key={h} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{r?.name || h}</span>
                    <span className={ok ? "text-slate-400" : "text-rose-500"}>{ok ? r!.contact : "no email on file"}</span>
                  </div>
                );
              })}
            </div>
            {sendResult && (
              <div className="text-xs space-y-1">
                {sendResult.sent.length > 0 && <p className="text-emerald-600">Sent to {sendResult.sent.length}: {sendResult.sent.map(h => byHandle.get(h)?.name || h).join(", ")}</p>}
                {sendResult.skipped.length > 0 && <p className="text-rose-500">Skipped: {sendResult.skipped.map(s => `${s.handle ? (byHandle.get(s.handle)?.name || s.handle) + " — " : ""}${s.reason}`).join("; ")}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setSending(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-slate-600">Close</button>
              <button onClick={sendEmails} disabled={saving || !handles.some(h => isEmail(byHandle.get(h)?.contact))} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50">
                {saving ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
