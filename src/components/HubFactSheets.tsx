"use client";

// Retailer Hub → Fact Sheets: the same per-brand fact sheets managed under
// Operations → Product Information (product_fact_sheets), presented here as a
// send list — pick a brand's current sheet and send it with open tracking.
// Uploading/updating sheets still happens in Product Information.
import { useEffect, useState } from "react";
import { HubSendModal, SendRow } from "./HubSendModal";

type Sheet = { id: string; brand_name: string; html_url: string | null; pdf_url: string | null; last_updated: string; version: string };
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function HubFactSheets({ admin }: { admin: boolean }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [showSends, setShowSends] = useState(false);
  const [sendSheet, setSendSheet] = useState<Sheet | null>(null);

  useEffect(() => {
    fetch("/api/fact-sheets", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      if (!d.ok) { setState("error"); return; }
      setSheets(d.sheets || []); setState("ready");
    }).catch(() => setState("error"));
    loadSends();
  }, []);

  async function loadSends() {
    const r = await fetch("/api/hub-send?kind=fact_sheet", { cache: "no-store" }).then(x => x.json()).catch(() => ({ ok: false }));
    if (r.ok) setSends(r.sends || []);
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this link? The recipient's link will stop working.")) return;
    await fetch(`/api/hub-send?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadSends();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_product_fact_sheets.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load fact sheets.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-gray-400">{sheets.length} brand fact sheet{sheets.length === 1 ? "" : "s"} — managed under Operations → Product Information</p>
        <button onClick={() => setShowSends(s => !s)} className="text-[11px] font-semibold text-sky-600 hover:underline ml-auto">{showSends ? "Hide" : "Show"} sent &amp; tracked ({sends.length})</button>
      </div>

      {showSends && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Sent &amp; tracked</h3>
          {sends.length === 0 ? <p className="text-sm text-slate-300 py-2">Nothing sent yet.</p> : sends.map(s => <SendRow key={s.id} s={s} admin={admin} onRevoke={revoke} />)}
        </div>
      )}

      {sheets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No fact sheets yet — upload them under Operations → Product Information.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheets.map(s => {
            const docSends = sends.filter(x => x.doc_id === s.id);
            const opens = docSends.reduce((t, x) => t + (x.open_count || 0), 0);
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
                <p className="text-sm font-bold text-slate-800">{s.brand_name}</p>
                <p className="text-[11.5px] text-slate-400">v{s.version} · {fmtDate(s.last_updated)}{docSends.length > 0 ? ` · sent ${docSends.length}× · ${opens} open${opens === 1 ? "" : "s"}` : ""}</p>
                <div className="flex items-center gap-3 text-[12.5px] font-semibold mt-auto pt-1">
                  {s.html_url && <a href={`/api/fact-sheets/view?id=${s.id}`} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">Preview</a>}
                  {s.pdf_url && <a href={s.pdf_url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">PDF</a>}
                  <button onClick={() => setSendSheet(s)} className="ml-auto text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-3 py-1.5">Send →</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sendSheet && (
        <HubSendModal
          items={[{ kind: "fact_sheet", id: sendSheet.id, title: `${sendSheet.brand_name} Fact Sheet`, brand: sendSheet.brand_name }]}
          onClose={() => setSendSheet(null)}
          onSent={loadSends}
        />
      )}
    </div>
  );
}
