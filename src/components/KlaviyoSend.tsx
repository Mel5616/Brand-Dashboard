"use client";

import { useEffect, useState } from "react";

type List = { id: string; name: string };
type Stats = { recipients: number; opens: number; opensUnique: number; openRate: number; clicksUnique: number; clickRate: number };
type Send = { id: string; campaign_id: string; subject: string; list_name: string | null; scheduled_at: string | null; status: string; created_by: string | null; created_at: string; stats: Stats | null };
type FixedAudience = { name: string; included: { id: string; name: string }[]; excluded?: { id: string; name: string }[] };

// Reusable "push this report to Klaviyo" panel — creates a real Draft
// campaign via /api/klaviyo/sends (safe, no send), then a separate explicit
// step actually schedules/sends it, with a confirm dialog either way since
// that step queues a real email to a real list. Pass `fixedAudience` when the
// report always goes to the same saved audience (skips the list picker);
// omit it to let the user pick any single Klaviyo list.
export function KlaviyoSendPanel({ getHtml, defaultSubject, fixedAudience, brandId }: { getHtml: () => string; defaultSubject: string; fixedAudience?: FixedAudience; brandId?: number }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<List[] | null>(null);
  const [sends, setSends] = useState<Send[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [listId, setListId] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Send | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent">("idle");

  const load = () => {
    fetch("/api/klaviyo/sends").then(r => r.json()).then(d => { if (d.ok) { setSends(d.sends ?? []); setNeedsSetup(!!d.needsSetup); } });
  };
  useEffect(() => {
    if (!open) return;
    load();
    if (!fixedAudience && !lists) fetch("/api/klaviyo/lists").then(r => r.json()).then(d => { if (d.ok) setLists(d.lists); else setErr(d.error || "Couldn't load Klaviyo lists"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendTest() {
    setTestStatus("sending"); setErr("");
    const d = await fetch("/api/klaviyo/sends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", subject, html: getHtml(), brandId }) }).then(r => r.json());
    if (d.ok) { setTestStatus("sent"); setTimeout(() => setTestStatus("idle"), 4000); }
    else { setTestStatus("idle"); setErr(d.error || "Couldn't send test."); }
  }

  async function createDraft() {
    if (!subject.trim()) { setErr("Enter a subject."); return; }
    if (!fixedAudience && !listId) { setErr("Pick a list."); return; }
    setBusy(true); setErr("");
    const body = fixedAudience
      ? { action: "create", subject, included: fixedAudience.included.map(l => l.id), excluded: (fixedAudience.excluded ?? []).map(l => l.id), audienceName: fixedAudience.name, html: getHtml(), brandId }
      : { action: "create", subject, listId, listName: lists?.find(l => l.id === listId)?.name, html: getHtml(), brandId };
    const d = await fetch("/api/klaviyo/sends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    setBusy(false);
    if (d.ok) { setDraft(d.item); load(); } else setErr(d.error || "Couldn't create draft.");
  }
  async function send() {
    if (!draft) return;
    const confirmText = scheduleAt
      ? `Schedule "${draft.subject}" to send ${new Date(scheduleAt).toLocaleString("en-AU")} to ${draft.list_name}?`
      : `Send "${draft.subject}" right now to ${draft.list_name}? This emails the whole audience immediately.`;
    if (!confirm(confirmText)) return;
    setBusy(true); setErr("");
    const datetimeIso = scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
    const d = await fetch("/api/klaviyo/sends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "schedule", id: draft.id, campaignId: draft.campaign_id, datetimeIso, brandId }) }).then(r => r.json());
    setBusy(false);
    if (d.ok) { setDraft(null); setListId(""); setScheduleAt(""); load(); } else setErr(d.error || "Couldn't schedule send.");
  }
  async function cancelDraft() {
    if (!draft) return;
    if (!confirm("Discard this draft? It won't be sent.")) return;
    setBusy(true);
    await fetch("/api/klaviyo/sends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", id: draft.id, campaignId: draft.campaign_id, brandId }) });
    setBusy(false); setDraft(null); load();
  }
  async function deleteSend(s: Send) {
    if (!confirm(`Remove "${s.subject}" from history? This can't be undone.`)) return;
    await fetch("/api/klaviyo/sends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: s.id, campaignId: s.campaign_id, brandId }) });
    load();
  }

  if (needsSetup) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Send to Klaviyo</h2>
          <p className="text-xs text-gray-400 mt-0.5">Push this report as a real Klaviyo campaign — scheduled or sent now, with open/click tracking</p>
        </div>
        <span className="text-gray-300 text-xs">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {err && <p className="text-sm text-rose-500">{err}</p>}

          {fixedAudience && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Audience · {fixedAudience.name} <span className="font-normal normal-case text-gray-400">(fixed)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {fixedAudience.included.map(l => <span key={l.id} className="text-[11px] font-medium rounded-full px-2.5 py-0.5 bg-emerald-50 text-emerald-700">{l.name}</span>)}
                {(fixedAudience.excluded ?? []).map(l => <span key={l.id} className="text-[11px] font-medium rounded-full px-2.5 py-0.5 bg-rose-50 text-rose-500">− {l.name}</span>)}
              </div>
            </div>
          )}

          {!draft ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              {!fixedAudience && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">List</label>
                  <select value={listId} onChange={e => setListId(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-56 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    <option value="">{lists ? "Select a list…" : "Loading lists…"}</option>
                    {lists?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <button onClick={() => setPreviewOpen(true)} className="text-sm font-semibold text-slate-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-2">Preview</button>
              <button onClick={sendTest} disabled={testStatus === "sending"} className="text-sm font-semibold text-slate-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 disabled:opacity-40">
                {testStatus === "sending" ? "Sending test…" : testStatus === "sent" ? "✓ Test sent" : "Send test to my email"}
              </button>
              <button onClick={createDraft} disabled={busy || (!fixedAudience && !listId)} className="text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-40">
                {busy ? "Creating draft…" : "Create draft in Klaviyo"}
              </button>
            </div>
          ) : (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 space-y-3">
              <p className="text-sm text-emerald-800">Draft created in Klaviyo — &ldquo;<strong>{draft.subject}</strong>&rdquo; to <strong>{draft.list_name}</strong>. Nothing has been sent yet.</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Schedule for (optional)</label>
                  <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <button onClick={send} disabled={busy} className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 disabled:opacity-40">
                  {busy ? "Working…" : scheduleAt ? "Schedule send" : "Send now"}
                </button>
                <button onClick={cancelDraft} disabled={busy} className="text-sm font-semibold text-gray-500 hover:text-rose-600 rounded-lg px-3 py-2">Discard draft</button>
              </div>
            </div>
          )}

          {sends.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">History</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="text-left font-semibold py-1.5 pr-3">Subject</th>
                      <th className="text-left font-semibold py-1.5 pr-3">Audience</th>
                      <th className="text-left font-semibold py-1.5 pr-3">Status</th>
                      <th className="text-right font-semibold py-1.5 pr-3">Opens</th>
                      <th className="text-right font-semibold py-1.5 pr-3">Clicks</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sends.map(s => (
                      <tr key={s.id} className="group">
                        <td className="py-1.5 pr-3 font-medium text-slate-700 whitespace-nowrap">{s.subject}</td>
                        <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{s.list_name ?? "—"}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${s.status === "sent" ? "bg-emerald-50 text-emerald-600" : s.status === "scheduled" ? "bg-sky-50 text-sky-600" : s.status === "cancelled" ? "bg-gray-100 text-gray-400" : "bg-amber-50 text-amber-600"}`}>
                            {s.status}{s.status === "scheduled" && s.scheduled_at ? ` · ${new Date(s.scheduled_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600 tabular-nums">{s.stats ? `${s.stats.opensUnique.toLocaleString()} (${Math.round(s.stats.openRate * 100)}%)` : "—"}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-600 tabular-nums">{s.stats ? `${s.stats.clicksUnique.toLocaleString()} (${Math.round(s.stats.clickRate * 100)}%)` : "—"}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => deleteSend(s)} title="Remove from history" className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity px-1">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-slate-700">Preview — {subject}</p>
              <button onClick={() => setPreviewOpen(false)} className="text-gray-400 hover:text-gray-700 text-sm font-semibold">Close ✕</button>
            </div>
            <iframe title="Email preview" srcDoc={getHtml()} className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
