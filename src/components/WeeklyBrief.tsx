"use client";

import { useEffect, useRef, useState } from "react";
import { WeeklyBriefSheet, type Brief } from "./WeeklyBriefSheet";

// Compose + publish a weekly team brief. You write the objectives/intro; the D2C
// snapshot, upcoming launches and needs-attention are assembled live and frozen at
// publish. Publish returns a token link the team opens without logging in.
type Objective = { text: string; done: boolean };
type Saved = { id: string; share_token: string; week_label: string; published_at: string | null };

const defaultLabel = () => {
  const d = new Date();
  return `Week of ${d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`;
};

export function WeeklyBrief() {
  const [weekLabel, setWeekLabel] = useState(defaultLabel);
  const [intro, setIntro] = useState("");
  const [objectives, setObjectives] = useState<Objective[]>([{ text: "", done: false }]);
  const [brandUpdates, setBrandUpdates] = useState<{ text: string }[]>([{ text: "" }]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [past, setPast] = useState<Saved[]>([]);
  const [current, setCurrent] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const jh = { "Content-Type": "application/json" };

  useEffect(() => {
    fetch("/api/weekly-brief?preview=1").then(r => r.json()).then(d => { if (d.ok) setSnapshot(d.snapshot); }).catch(() => {});
    fetch("/api/weekly-brief").then(r => r.json()).then(d => { if (d.needsSetup) setNeedsSetup(true); else if (d.ok) setPast(d.items ?? []); }).catch(() => {});
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (t: string) => `${origin}/w/${t}`;
  async function copyLink(t: string) {
    try { await navigator.clipboard.writeText(linkFor(t)); setCopied(t); setTimeout(() => setCopied(null), 1600); } catch { /* ignore */ }
  }

  const setObj = (i: number, patch: Partial<Objective>) => setObjectives(prev => prev.map((o, j) => j === i ? { ...o, ...patch } : o));
  const clean = () => objectives.filter(o => o.text.trim());
  const cleanUpdates = () => brandUpdates.filter(u => u.text.trim());

  const asSaved = (it: any): Saved => ({ id: it.id, share_token: it.share_token, week_label: it.week_label, published_at: it.published_at });
  // Create a brief. draft=true keeps it unpublished (no live link) so it can be
  // prepared ahead of time; draft=false publishes and copies the link straight away.
  async function saveNew(draft: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/weekly-brief", { method: "POST", headers: jh, body: JSON.stringify({ weekLabel, intro, objectives: clean(), brandUpdates: cleanUpdates(), draft }) }).then(x => x.json());
      if (r.ok) { setCurrent(asSaved(r.item)); setPast(p => [asSaved(r.item), ...p]); setSnapshot(r.item.snapshot); if (!draft) copyLink(r.item.share_token); }
    } finally { setBusy(false); }
  }
  // Save edits to the brief in the editor. publishNow=true turns a draft live (and
  // refreshes its figures); otherwise it just saves the text.
  async function saveCurrent(publishNow: boolean) {
    if (!current) return;
    setBusy(true);
    try {
      const body: any = { id: current.id, week_label: weekLabel, intro, objectives: clean(), brandUpdates: cleanUpdates() };
      if (publishNow) body.publish = true;
      const r = await fetch("/api/weekly-brief", { method: "PATCH", headers: jh, body: JSON.stringify(body) }).then(x => x.json());
      if (r.ok) {
        setCurrent(asSaved(r.item)); setPast(p => p.map(x => x.id === r.item.id ? asSaved(r.item) : x));
        if (publishNow) { if (r.item.snapshot) setSnapshot(r.item.snapshot); copyLink(r.item.share_token); }
      }
    } finally { setBusy(false); }
  }
  // Re-open a saved brief (draft or published) in the editor.
  async function editBrief(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/weekly-brief?id=${encodeURIComponent(id)}`).then(x => x.json());
      if (r.ok && r.item) {
        const it = r.item;
        setCurrent(asSaved(it));
        setWeekLabel(it.week_label || defaultLabel());
        setIntro(it.intro || "");
        setObjectives(it.objectives?.length ? it.objectives : [{ text: "", done: false }]);
        setBrandUpdates(it.brand_updates?.length ? it.brand_updates : [{ text: "" }]);
        // Published briefs keep their frozen snapshot (what the team saw). Drafts
        // show LIVE data — publishing rebuilds it anyway, so the preview shouldn't
        // lag behind newer sections or fresher figures.
        if (it.published_at && it.snapshot) setSnapshot(it.snapshot);
        else { const pv = await fetch("/api/weekly-brief?preview=1").then(x => x.json()).catch(() => null); if (pv?.ok) setSnapshot(pv.snapshot); else if (it.snapshot) setSnapshot(it.snapshot); }
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally { setBusy(false); }
  }
  function reset() {
    setCurrent(null); setWeekLabel(defaultLabel()); setIntro(""); setObjectives([{ text: "", done: false }]); setBrandUpdates([{ text: "" }]);
    fetch("/api/weekly-brief?preview=1").then(r => r.json()).then(d => { if (d.ok) setSnapshot(d.snapshot); });
  }

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_weekly_briefs.sql</code> in Supabase to enable weekly briefs.</div>;

  const previewBrief: Brief = { week_label: weekLabel, intro, objectives: clean(), brand_updates: cleanUpdates(), snapshot };
  const isDraft = !!current && !current.published_at;
  const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";

  return (
    // Compose is a fixed narrower column; the preview takes the rest so the brief
    // sheet renders near full width instead of being crammed into a half column.
    <div className="grid gap-5 lg:grid-cols-[minmax(340px,380px)_1fr] items-start">
      {/* Compose */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{current ? (isDraft ? "Editing draft" : "Editing published brief") : "New weekly brief"}</p>
            {current && <button onClick={reset} className="text-xs font-medium text-emerald-600 hover:underline">+ Start a new one</button>}
          </div>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Week</span>
            <input value={weekLabel} onChange={e => setWeekLabel(e.target.value)} className={inp} /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-gray-400">Intro note <span className="normal-case text-gray-300">· optional</span></span>
            <textarea value={intro} onChange={e => setIntro(e.target.value)} rows={2} placeholder="A line or two to set the week up…" className={`${inp} resize-y`} /></label>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Objectives / to-dos</span>
            <div className="space-y-1.5 mt-1">
              {objectives.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={o.done} onChange={e => setObj(i, { done: e.target.checked })} className="accent-emerald-500 w-4 h-4 shrink-0" />
                  <input value={o.text} onChange={e => setObj(i, { text: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (i === objectives.length - 1) setObjectives(p => [...p, { text: "", done: false }]); } }}
                    placeholder="Add an objective…" className={`${inp} flex-1`} />
                  <button onClick={() => setObjectives(p => p.filter((_, j) => j !== i).length ? p.filter((_, j) => j !== i) : [{ text: "", done: false }])} className="text-gray-300 hover:text-rose-500 text-sm px-1">✕</button>
                </div>
              ))}
              <button onClick={() => setObjectives(p => [...p, { text: "", done: false }])} className="text-[13px] font-medium text-emerald-600 hover:text-emerald-700">+ Add objective</button>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Brand updates <span className="normal-case text-gray-300">· anything of relevance</span></span>
            <div className="space-y-1.5 mt-1">
              {brandUpdates.map((u, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea value={u.text} onChange={e => setBrandUpdates(p => p.map((x, j) => j === i ? { text: e.target.value } : x))}
                    rows={2} placeholder="Add a brand update…" className={`${inp} flex-1 resize-y`} />
                  <button onClick={() => setBrandUpdates(p => { const n = p.filter((_, j) => j !== i); return n.length ? n : [{ text: "" }]; })} className="text-gray-300 hover:text-rose-500 text-sm px-1 mt-1.5">✕</button>
                </div>
              ))}
              <button onClick={() => setBrandUpdates(p => [...p, { text: "" }])} className="text-[13px] font-medium text-emerald-600 hover:text-emerald-700">+ Add update</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!current && <>
              <button onClick={() => saveNew(false)} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Publishing…" : "Publish & copy link"}</button>
              <button onClick={() => saveNew(true)} disabled={busy} className="text-sm font-semibold text-slate-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-2 disabled:opacity-60">Save as draft</button>
            </>}
            {isDraft && <>
              <button onClick={() => saveCurrent(true)} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Publishing…" : "Publish now & copy link"}</button>
              <button onClick={() => saveCurrent(false)} disabled={busy} className="text-sm font-semibold text-slate-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Saving…" : "Save draft"}</button>
            </>}
            {current && !isDraft && <>
              <button onClick={() => saveCurrent(false)} disabled={busy} className="text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Saving…" : "Save changes"}</button>
              <a href={linkFor(current.share_token)} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline">Open link ↗</a>
              <button onClick={() => copyLink(current.share_token)} className="text-sm font-medium text-gray-600 hover:text-gray-800">{copied === current.share_token ? "Copied ✓" : "Copy link"}</button>
            </>}
          </div>
          {isDraft && <p className="text-[11px] text-gray-400">Draft — not sent. No live link until you publish. Publishing refreshes the D2C/launch figures to that moment.</p>}
          {current && !isDraft && <p className="text-[11px] text-gray-400">Live link: <span className="text-slate-500 break-all">{linkFor(current.share_token)}</span> — the team opens it with no login. The D2C/launch data is frozen as published.</p>}
        </div>

        {past.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Recent briefs</p>
            <div className="divide-y divide-gray-50">
              {past.map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0"><p className="text-sm text-slate-700 truncate">{b.week_label}</p>
                    {b.published_at
                      ? <p className="text-[11px] text-gray-400">Published {new Date(b.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
                      : <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 mt-0.5">Draft</span>}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => editBrief(b.id)} disabled={busy} className="text-xs font-medium text-slate-600 hover:text-slate-800 disabled:opacity-60">Edit</button>
                    {b.published_at && <>
                      <a href={linkFor(b.share_token)} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-600 hover:underline">Open ↗</a>
                      <button onClick={() => copyLink(b.share_token)} className="text-xs font-medium text-gray-500 hover:text-gray-700">{copied === b.share_token ? "Copied" : "Copy link"}</button>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live preview */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Preview <span className="font-normal normal-case tracking-normal">· what the team sees</span></p>
        <WeeklyBriefSheet brief={previewBrief} />
      </div>
    </div>
  );
}
