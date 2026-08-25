"use client";

// Retailer Hub → Stock Availability: customer-facing OOS reports built from
// the live Asana Stock Report feed (the same one Operations → Stock Report
// mirrors). Pick a scope, preview the branded report, publish a frozen copy,
// send it tracked — the email itself uses the weekly OOS format retailers know.
import { useEffect, useMemo, useState } from "react";
import { HubSendModal, SendRow, DocThumb } from "./HubSendModal";

type Doc = { id: string; brand_name: string | null; title: string; version: string; html_url: string | null; status: string; created_at: string };
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function StockAvailability({ canEdit, admin }: { canEdit: boolean; admin: boolean }) {
  const [groups, setGroups] = useState<{ brand: string; color: string; items: any[] }[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [scope, setScope] = useState<string>("");           // "" = all brands
  const [publishing, setPublishing] = useState(false);
  const [sendDoc, setSendDoc] = useState<Doc | null>(null);
  const [openTracking, setOpenTracking] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    fetch("/api/stock-availability", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      if (!d.ok) { setState("error"); return; }
      setGroups(d.groups || []); setDocs(d.docs || []); setState("ready");
    }).catch(() => setState("error"));
    fetch("/api/hub-send?kind=stock_report", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.ok) setSends(d.sends || []); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const affected = useMemo(() => groups.reduce((t, g) => t + g.items.length, 0), [groups]);
  const previewUrl = `/api/stock-availability?preview=1${scope ? `&brand=${encodeURIComponent(scope)}` : ""}`;

  async function publish() {
    setPublishing(true); setErr("");
    const r = await fetch("/api/stock-availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: scope || null }) }).then(x => x.json()).catch(() => ({ ok: false, error: "Publish failed" }));
    setPublishing(false);
    if (!r.ok) { setErr(r.error || "Publish failed"); return; }
    load();
    setSendDoc(r.doc);
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this link?")) return;
    await fetch(`/api/hub-send?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }
  async function removeDoc(d: Doc) {
    if (!window.confirm(`Remove "${d.title}" (${d.version})?`)) return;
    await fetch(`/api/sales-docs?id=${d.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">The Asana Stock Report feed isn&apos;t synced yet — run <code>add_asana_tasks.sql</code> and the Asana sync, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load the stock feed.</div>;

  const shownDocs = showArchived ? docs : docs.filter(d => d.status === "current");

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-slate-500">Built live from the Asana Stock Report board ({affected} affected line{affected === 1 ? "" : "s"} across {groups.length} brand{groups.length === 1 ? "" : "s"}). Internal notes never appear in the customer report. The send email uses your weekly OOS format — per-brand summary plus a button to the full tracked report.</p>

      {/* Scope + live preview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setScope("")} className={`text-[12px] font-semibold rounded-full px-3 py-1.5 border ${scope === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"}`}>All brands ({affected})</button>
          {groups.map(g => (
            <button key={g.brand} onClick={() => setScope(scope === g.brand ? "" : g.brand)}
              className={`text-[12px] font-semibold rounded-full px-3 py-1.5 border ${scope === g.brand ? "text-white" : "bg-white text-slate-500 border-slate-200"}`}
              style={scope === g.brand ? { background: g.color, borderColor: g.color } : {}}>
              {g.brand} ({g.items.length})
            </button>
          ))}
          {canEdit && (
            <button onClick={publish} disabled={publishing} className="ml-auto text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg px-4 py-2">
              {publishing ? "Publishing…" : `Publish ${scope || "All Brands"} report →`}
            </button>
          )}
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <iframe src={previewUrl} title="Report preview" className="w-full border border-slate-100 rounded-xl bg-slate-50" style={{ height: "52vh" }} />
        <p className="text-[11px] text-gray-400">Live preview — publishing freezes today&apos;s report so what a customer opened never changes underneath them. The Asana board stays the source of truth; publish a fresh report after stock changes.</p>
      </div>

      {/* Published reports */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Published reports</h3>
          <label className="text-[11px] text-gray-400 flex items-center gap-1"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> show archived</label>
        </div>
        {shownDocs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No reports published yet — pick a scope above and publish.</div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {shownDocs.map(d => {
              const docSends = sends.filter(s => s.doc_id === d.id);
              const opens = docSends.reduce((t, s) => t + (s.open_count || 0), 0);
              const isOpen = openTracking === d.id;
              return (
                <div key={d.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${isOpen ? "sm:col-span-2 xl:col-span-3" : ""}`}>
                  <a href={`/api/sales-docs/view?id=${d.id}`} target="_blank" rel="noopener noreferrer" className="block relative group">
                    <DocThumb src={`/api/sales-docs/view?id=${d.id}`} variant="a4" />
                    <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-[13px] font-bold bg-slate-900/70 rounded-full px-4 py-2">Open →</span>
                    </span>
                  </a>
                  <div className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-50">
                    <button onClick={() => setOpenTracking(isOpen ? null : d.id)} className="min-w-0 flex-1 text-left hover:opacity-80">
                      <span className="block text-[14.5px] font-bold text-slate-800 truncate">{d.title}</span>
                      <span className="block text-[11.5px] text-gray-400">{[fmtDate(d.created_at), d.status === "archived" ? "archived" : null, `${docSends.length} send${docSends.length === 1 ? "" : "s"}`, `${opens} open${opens === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
                    </button>
                    {d.status === "current" && <button onClick={() => setSendDoc(d)} className="shrink-0 text-[12.5px] font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-3.5 py-1.5">Send →</button>}
                    <button onClick={() => setOpenTracking(isOpen ? null : d.id)} className="shrink-0 text-[11px] font-semibold text-gray-400 hover:text-gray-600">{isOpen ? "Hide ▾" : "Tracking ▸"}</button>
                  </div>
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-gray-50">
                      <div className="mt-2">
                        {docSends.length === 0 ? <p className="text-sm text-slate-300 py-2">Not sent to anyone yet.</p>
                          : docSends.map(s => <SendRow key={s.id} s={s} admin={admin} onRevoke={revoke} />)}
                      </div>
                      {canEdit && <button onClick={() => removeDoc(d)} className="mt-2 text-[12px] text-gray-300 hover:text-rose-500">Delete report</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sendDoc && (
        <HubSendModal
          items={[{ kind: "stock_report", id: sendDoc.id, title: sendDoc.title, brand: sendDoc.brand_name }]}
          onClose={() => setSendDoc(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
