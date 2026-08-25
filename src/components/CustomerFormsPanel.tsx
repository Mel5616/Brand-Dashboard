"use client";

// Retailer Hub → New Customer Forms: send tracked application-form links
// (/apply/<token>) and review what comes back. Each form link is a sales_sends
// row (kind "form"), so opens are tracked like every other Retailer Hub send.
import { useEffect, useRef, useState } from "react";
import { HubSendModal, SendRow, DocThumb } from "./HubSendModal";

const dShort = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const STATUS_CLS: Record<string, string> = { new: "bg-sky-100 text-sky-700", reviewed: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700" };
type FormDoc = { id: string; title: string; version: string; html_url: string | null; status: string; created_at: string };

export function CustomerFormsPanel({ canEdit, admin }: { canEdit: boolean; admin: boolean }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    fetch("/api/customer-forms", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      if (!d.ok) { setState("error"); return; }
      setSubs(d.submissions || []); setState("ready");
    }).catch(() => setState("error"));
    fetch("/api/hub-send?kind=form", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.ok) setSends(d.sends || []); }).catch(() => {});
    fetch("/api/sales-docs?category=credit_form", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.ok) setForms(d.docs || []); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function uploadForm() {
    const file = fileRef.current?.files?.[0];
    if (!title.trim() || !file) { setErr("Give the form a title and attach its HTML file."); return; }
    if (file.size > 4 * 1024 * 1024) { setErr("Form HTML over 4MB — send it to Mel to slim down first."); return; }
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.set("category", "credit_form"); fd.set("title", title.trim()); fd.set("version", version.trim() || "1"); fd.set("html", file);
    const r = await fetch("/api/sales-docs", { method: "POST", body: fd }).then(x => x.json()).catch(() => ({ ok: false, error: "Upload failed" }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Upload failed"); return; }
    setAdding(false); setTitle(""); setVersion("1"); if (fileRef.current) fileRef.current.value = "";
    load();
  }
  async function removeForm(f: FormDoc) {
    if (!window.confirm(`Remove "${f.title}"? Links already sent will stop working if no other form remains.`)) return;
    await fetch(`/api/sales-docs?id=${f.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function setStatus(id: string, status: string) {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    await fetch(`/api/customer-forms?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => {});
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this form link?")) return;
    await fetch(`/api/hub-send?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_retailer_hub.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load.</div>;

  // Render the credit application's nested payload as readable label/value
  // pairs (objects flatten to one line; arrays become one line per entry).
  const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAbn\b/, "ABN").replace(/\bAcn\b/, "ACN").replace(/\bAud\b/, "AUD");
  const flat = (v: any): string => v == null ? "" : Array.isArray(v) ? v.map(flat).filter(Boolean).join("\n") : typeof v === "object" ? Object.entries(v).filter(([k, x]) => x !== "" && x != null && k !== "same_as_street").map(([k, x]) => typeof x === "boolean" ? (x ? label(k) : `${label(k)}: no`) : String(x)).join(", ") : String(v);
  const entries = (data: any): [string, string][] => Object.entries(data || {})
    .filter(([k]) => !["submitted_at"].includes(k))
    .map(([k, v]) => [label(k), flat(v)] as [string, string])
    .filter(([, v]) => v.trim() !== "" && v !== "0");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-slate-500">Send a prospect the credit application form; their submission lands here (and on their customer record) and is emailed to marketing@ automatically.</p>
        {canEdit && <button onClick={() => { setErr(""); setAdding(a => !a); }} className="ml-auto text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">{adding ? "Close" : "+ Upload form"}</button>}
        {canEdit && <button onClick={() => setSending(true)} className="text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-3 py-2">+ Send form link</button>}
      </div>

      {adding && canEdit && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Upload a form</h3>
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Coolkidz Credit Application" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Version</label>
              <input value={version} onChange={e => setVersion(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Form HTML file</label>
              <input ref={fileRef} type="file" accept=".html,text/html" className="w-full text-xs" /></div>
          </div>
          {err && <p className="text-[13px] text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
            <button onClick={uploadForm} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Uploading…" : "Save form"}</button>
          </div>
          <p className="text-[11px] text-gray-400">Re-uploading with the same title archives the previous version. The most recently uploaded form is the one every form link opens.</p>
        </div>
      )}

      {/* The form(s) being sent — A4 previews */}
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">The form you&apos;re sending</h3>
        {forms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No form uploaded yet — upload the credit application HTML to activate form links.</div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {forms.map((f, i) => (
              <div key={f.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <a href={`/api/sales-docs/view?id=${f.id}`} target="_blank" rel="noopener noreferrer" className="block relative group">
                  <DocThumb src={f.html_url ? `/api/sales-docs/view?id=${f.id}` : null} pdfOnly={!f.html_url} variant="a4" />
                  <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-[13px] font-bold bg-slate-900/70 rounded-full px-4 py-2">Preview →</span>
                  </span>
                  {i === 0 && <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wide text-white bg-emerald-500 rounded-full px-2.5 py-1">Live — this is what links open</span>}
                </a>
                <div className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-50">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-slate-800 truncate">{f.title}</span>
                    <span className="block text-[11.5px] text-gray-400">v{f.version} · {dShort(f.created_at)}</span>
                  </div>
                  {canEdit && <button onClick={() => removeForm(f)} className="shrink-0 text-[12px] text-gray-300 hover:text-rose-500">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2">Previews open the real form, but submissions only send from a proper tracked link.</p>
      </div>

      {/* Outstanding form links */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Form links sent</h3>
        {sends.length === 0 ? <p className="text-sm text-slate-300 py-2">No form links sent yet.</p> : sends.map(s => <SendRow key={s.id} s={s} admin={admin} onRevoke={revoke} />)}
      </div>

      {/* Submissions */}
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Applications received ({subs.length})</h3>
        {subs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No applications yet.</div>
        ) : (
          <div className="space-y-2">
            {subs.map(f => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 cursor-pointer" onClick={() => setOpen(open === f.id ? null : f.id)}>
                  <span className="text-sm font-bold text-slate-800">{f.store_name}</span>
                  <span className="text-[12px] text-slate-400">{f.contact_name} · {f.email}</span>
                  <span className="text-[12px] text-slate-300">{dShort(f.created_at)}</span>
                  <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${STATUS_CLS[f.status] || STATUS_CLS.new}`}>{f.status}</span>
                  {Array.isArray(f.data?.brands) && f.data.brands.length > 0 && <span className="text-[11.5px] text-violet-600 font-semibold">{f.data.brands.join(", ")}</span>}
                  <span className="ml-auto text-slate-300 text-xs">{open === f.id ? "▲" : "▼"}</span>
                </div>
                {open === f.id && (
                  <div className="mt-3 pt-3 border-t border-slate-50">
                    <div className="grid sm:grid-cols-3 gap-x-4 gap-y-2 text-[12.5px]">
                      {entries(f.data).map(([k, v]) => (
                        <div key={k}><span className="block text-[10px] font-semibold text-slate-400 uppercase">{k}</span><span className="text-slate-700 whitespace-pre-line">{v}</span></div>
                      ))}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2 mt-3">
                        {["reviewed", "approved"].filter(s => s !== f.status).map(s => (
                          <button key={s} onClick={() => setStatus(f.id, s)} className="text-[12px] font-semibold rounded-lg px-3 py-1.5 border border-slate-200 text-slate-600 hover:border-sky-300 capitalize">Mark {s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {sending && (
        <HubSendModal
          items={[{ kind: "form", title: "Credit Application Form" }]}
          onClose={() => setSending(false)}
          onSent={load}
        />
      )}
    </div>
  );
}
