"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSnapshot, snapshotHtml, type SnapshotInput } from "@/lib/snapshot";

type Props = Omit<SnapshotInput, "brand" | "note"> & {
  brands: { id: number; name: string; live?: boolean }[];
  selected: number | "all";
  onSelect: (id: number) => void;
  canEdit: boolean;
};

export function BrandSnapshot({ brands, selected, onSelect, canEdit, month, monthKeys, monthLabels, fyLabel, ...data }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const live = brands.filter(b => b.live !== false);
  // A snapshot is per brand — fall back to the first live brand when "all" is selected.
  const brandId = selected === "all" ? (live[0]?.id ?? brands[0]?.id) : selected;
  const brand = brands.find(b => b.id === brandId);

  // Notes are stored per brand+month and fetched on change. needsSetup => table not created yet.
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "loading" | "saving" | "saved" | "needsSetup" | "error">("idle");

  // Editable AI insights. Pre-fills with the generated text; a saved edit replaces it in the report.
  const aiDefault = useMemo(() => [...(data.brandInsights ?? [])].filter((i: any) => i.brand_id === brandId).sort((a: any, b: any) => (b.generated_at || "").localeCompare(a.generated_at || ""))[0]?.content ?? "", [data.brandInsights, brandId]);
  const [insights, setInsights] = useState("");
  const [savedInsights, setSavedInsights] = useState("");
  const [insState, setInsState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Open-tracked share links for this brand + month.
  const [shares, setShares] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareNeedsSetup, setShareNeedsSetup] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!brand) return;
    let cancelled = false;
    setNoteState("loading");
    fetch(`/api/snapshot-notes?brand=${brand.id}&month=${month}`)
      .then(r => r.json())
      .then(j => { if (cancelled) return; if (j.needsSetup) setNoteState("needsSetup"); else setNoteState("idle"); setNote(j.content ?? ""); setSavedNote(j.content ?? ""); setSavedInsights(j.insights ?? ""); setInsights((j.insights && j.insights.trim()) ? j.insights : aiDefault); })
      .catch(() => { if (!cancelled) setNoteState("error"); });
    return () => { cancelled = true; };
  }, [brand?.id, month]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNote() {
    if (!brand) return;
    setNoteState("saving");
    try {
      const res = await fetch("/api/snapshot-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brand.id, month_key: month, content: note, insights: savedInsights }) });
      const j = await res.json();
      if (j.ok) { setSavedNote(note); setNoteState("saved"); setTimeout(() => setNoteState("idle"), 1800); }
      else setNoteState(j.needsSetup ? "needsSetup" : "error");
    } catch { setNoteState("error"); }
  }

  async function saveInsights() {
    if (!brand) return;
    setInsState("saving");
    try {
      const res = await fetch("/api/snapshot-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brand.id, month_key: month, content: savedNote, insights }) });
      const j = await res.json();
      if (j.ok && !j.insightsUnsupported) { setSavedInsights(insights); setInsState("saved"); setTimeout(() => setInsState("idle"), 1800); }
      else setInsState("error");
    } catch { setInsState("error"); }
  }
  function resetInsights() { setInsights(aiDefault); }

  // The saved note (not the in-progress edit) is what renders into the report.
  const html = useMemo(() => {
    if (!brand) return "";
    return snapshotHtml(buildSnapshot({ brand, month, monthKeys, monthLabels, fyLabel, note: savedNote, insightsOverride: savedInsights, ...data }));
  }, [brand, month, monthKeys, monthLabels, fyLabel, savedNote, savedInsights, data]);

  const monthName = monthLabels[monthKeys.indexOf(month)] ?? month;

  async function loadShares() {
    if (!brand) return;
    try {
      const j = await fetch(`/api/snapshot-share?brand_id=${brand.id}&month_key=${month}`).then(r => r.json());
      if (j.ok) { setShares(j.items); setShareNeedsSetup(false); }
      else if (j.needsSetup) setShareNeedsSetup(true);
    } catch { /* ignore */ }
  }
  useEffect(() => { loadShares(); }, [brand?.id, month]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createShare() {
    if (!brand) return;
    setSharing(true);
    try {
      const res = await fetch("/api/snapshot-share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brand.id, brand: brand.name, month_key: month, label: `${monthName} ${fyLabel}`, html }),
      });
      const j = await res.json();
      if (j.ok) await loadShares();
      else if (j.needsSetup) setShareNeedsSetup(true);
    } finally { setSharing(false); }
  }
  function copyLink(token: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/s/${token}`);
    setCopied(token); setTimeout(() => setCopied(""), 1500);
  }
  async function deleteShare(id: number) {
    if (!window.confirm("Delete this share link? Anyone who has it will no longer be able to open it.")) return;
    await fetch(`/api/snapshot-share?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadShares();
  }
  async function extendShare(id: number) {
    await fetch("/api/snapshot-share", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, expiryDays: 5 }) }).catch(() => {});
    loadShares();
  }

  function printIt() { const win = frameRef.current?.contentWindow; if (win) { win.focus(); win.print(); } }

  if (!brand) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No brand to report on.</div>;

  const dirty = note !== savedNote;
  const insDirty = insights !== (savedInsights || aiDefault);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <select
          value={String(brandId)}
          onChange={e => onSelect(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
        >
          {live.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <button onClick={printIt} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print / PDF
          </button>
        </div>
      </div>

      {/* Insights editor — pre-filled with the AI text; a saved edit replaces it in the report. */}
      {canEdit && noteState !== "needsSetup" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print order-last">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Insights & opportunities {savedInsights ? "· edited" : "· AI"}</label>
            <div className="flex items-center gap-3">
              {insState === "saved" && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
              {insState === "error" && <span className="text-xs text-red-500 font-medium">Save failed</span>}
              <button onClick={resetInsights} disabled={insights === aiDefault} className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40">Reset to AI</button>
              <button onClick={saveInsights} disabled={!insDirty || insState === "saving"} className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg px-3.5 py-1.5 transition">
                {insState === "saving" ? "Saving..." : "Save insights"}
              </button>
            </div>
          </div>
          <textarea
            value={insights}
            onChange={e => setInsights(e.target.value)}
            placeholder="The AI-written insights appear here. Edit them and save to replace what shows in the report."
            rows={7}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
        </div>
      )}

      {/* Notes editor — saved text is rendered into the report's "Notes & commentary" block. */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print order-last">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Notes for {brand.name} · {monthName}</label>
            <div className="flex items-center gap-3">
              {noteState === "saved" && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
              {noteState === "error" && <span className="text-xs text-red-500 font-medium">Save failed</span>}
              <button onClick={saveNote} disabled={!dirty || noteState === "saving"} className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg px-3.5 py-1.5 transition">
                {noteState === "saving" ? "Saving..." : "Save notes"}
              </button>
            </div>
          </div>
          {noteState === "needsSetup" ? (
            <p className="text-xs text-amber-600">Notes table not set up yet. Run <code className="bg-amber-50 px-1 rounded">supabase/add_snapshot_notes.sql</code> in Supabase, then reload.</p>
          ) : (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Commentary for the brand — wins, context, what's next. This prints into the report and the emailed HTML."
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          )}
        </div>
      )}

      {/* Shareable, open-tracked link — send to a customer and see when they open it. */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Shareable link · {monthName}</span>
            <button onClick={createShare} disabled={sharing} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg px-3.5 py-1.5 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
              {sharing ? "Creating..." : "Create share link"}
            </button>
          </div>
          {shareNeedsSetup ? (
            <p className="text-xs text-amber-600">Run <code className="bg-amber-50 px-1 rounded">supabase/add_snapshot_shares.sql</code> in Supabase, then reload.</p>
          ) : shares.length === 0 ? (
            <p className="text-xs text-gray-400">No links yet. Create one to share this snapshot with a customer — you&apos;ll see when they open it.</p>
          ) : (
            <div className="space-y-2">
              {shares.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
                  <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/s/${s.token}`} onFocus={e => e.currentTarget.select()}
                    className="flex-1 min-w-[220px] text-xs text-slate-600 bg-slate-50 border border-gray-200 rounded px-2 py-1.5" />
                  <button onClick={() => copyLink(s.token)} className="text-xs font-medium text-emerald-600 hover:underline">{copied === s.token ? "Copied!" : "Copy"}</button>
                  {s.open_count > 0
                    ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">Opened {s.open_count}× · last {new Date(s.last_opened_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                    : <span className="text-xs text-slate-400 bg-slate-50 rounded-full px-2.5 py-1">Not opened yet</span>}
                  {(() => {
                    const exp = s.expires_at ? Date.parse(s.expires_at) : null;
                    const expired = exp != null && Date.now() > exp;
                    return <span className={`text-xs rounded-full px-2.5 py-1 ${expired ? "text-rose-600 bg-rose-50 font-medium" : "text-slate-400 bg-slate-50"}`}>{exp == null ? "No expiry" : expired ? "Expired" : `Expires ${new Date(exp).toLocaleDateString("en-AU", { dateStyle: "medium" })}`}</span>;
                  })()}
                  <button onClick={() => extendShare(s.id)} className="text-xs text-emerald-600 hover:underline">Extend 5 days</button>
                  <button onClick={() => deleteShare(s.id)} className="text-xs text-rose-400 hover:text-rose-600">Delete</button>
                </div>
              ))}
              <button onClick={loadShares} className="text-[11px] text-slate-400 hover:text-slate-600">Refresh open status</button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-2">Anyone with the link can view this report (no login). Each open is tracked. Links expire after 5 days — use Extend to renew.</p>
        </div>
      )}

      {/* Rendered in an isolated iframe so the report's own styles match the sample exactly. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <iframe ref={frameRef} title="snapshot" srcDoc={html} className="w-full" style={{ height: "1680px", border: 0 }} />
      </div>
    </div>
  );
}
