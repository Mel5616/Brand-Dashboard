"use client";

// Retailer Hub → New Customer Forms: send tracked application-form links
// (/apply/<token>) and review what comes back. Each form link is a sales_sends
// row (kind "form"), so opens are tracked like every other Retailer Hub send.
import { useEffect, useState } from "react";
import { HubSendModal, SendRow } from "./HubSendModal";

const dShort = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const STATUS_CLS: Record<string, string> = { new: "bg-sky-100 text-sky-700", reviewed: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700" };

export function CustomerFormsPanel({ canEdit, admin }: { canEdit: boolean; admin: boolean }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  function load() {
    fetch("/api/customer-forms", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      if (!d.ok) { setState("error"); return; }
      setSubs(d.submissions || []); setState("ready");
    }).catch(() => setState("error"));
    fetch("/api/hub-send?kind=form", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.ok) setSends(d.sends || []); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

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

  const FIELD_LABELS: [string, string][] = [["legal_name", "Legal entity"], ["abn", "ABN"], ["website", "Website / IG"], ["store_count", "Stores"], ["role", "Role"], ["phone", "Phone"], ["address", "Address"], ["state", "State"], ["postcode", "Postcode"], ["hear_about", "Heard about us"], ["message", "Message"]];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-slate-500">Send a prospect the new-customer application form; their submission lands here (and on their customer record).</p>
        {canEdit && <button onClick={() => setSending(true)} className="ml-auto text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-3 py-2">+ Send form link</button>}
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
                      {FIELD_LABELS.map(([k, label]) => f.data?.[k] ? (
                        <div key={k}><span className="block text-[10px] font-semibold text-slate-400 uppercase">{label}</span><span className="text-slate-700 whitespace-pre-line">{String(f.data[k])}</span></div>
                      ) : null)}
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
          items={[{ kind: "form", title: "New Customer Application Form" }]}
          onClose={() => setSending(false)}
          onSent={load}
        />
      )}
    </div>
  );
}
