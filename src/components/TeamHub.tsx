"use client";

import { useEffect, useMemo, useState } from "react";

// Team hub: a manager cockpit. Top — a scorecard with one card per function
// (owner, RAG status, this-week headline). Below — the roster; click a person to
// see and add their 1:1 notes and goals.
type Member = { id: string; name: string; function: string; email: string; focus: string; active: boolean; sort: number };
type Score = { function: string; owner_id: string | null; status: "green" | "amber" | "red"; headline: string; updated_at: string };
type Note = { id: string; member_id: string; note_date: string; kind: "note" | "goal"; body: string; done: boolean };

const FUNCTIONS = ["Performance / Paid", "Email", "Social", "Influencer", "Store / Retail", "Affiliate", "Graphic Design", "Photography"];
const STATUS = { green: { dot: "#10b981", ring: "border-emerald-200", bg: "bg-emerald-50/50", label: "On track" }, amber: { dot: "#f59e0b", ring: "border-amber-200", bg: "bg-amber-50/50", label: "Watch" }, red: { dot: "#ef4444", ring: "border-rose-200", bg: "bg-rose-50/50", label: "Needs help" } };
const nextStatus = (s: string) => (s === "green" ? "amber" : s === "amber" ? "red" : "green") as Score["status"];
const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";

export function TeamHub({ admin }: { admin: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [nf, setNf] = useState({ body: "", kind: "note" as "note" | "goal" });
  const [mf, setMf] = useState({ name: "", function: FUNCTIONS[0], email: "", focus: "" });
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetch("/api/team-hub").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) { setMembers(d.members ?? []); setScores(d.scorecard ?? []); setNotes(d.notes ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/team-hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const scoreOf = (fn: string) => scores.find(s => s.function === fn) ?? { function: fn, owner_id: null, status: "green" as const, headline: "", updated_at: "" };
  const membersFor = (fn: string) => members.filter(m => m.function === fn);

  async function saveScore(fn: string, patch: Partial<Score>) {
    const cur = scoreOf(fn);
    const next = { function: fn, owner_id: cur.owner_id, status: cur.status, headline: cur.headline, ...patch };
    setScores(p => { const o = p.filter(s => s.function !== fn); return [...o, { ...next, updated_at: new Date().toISOString() } as Score]; });
    await post({ action: "scorecard.save", ...next });
  }
  async function addMember() {
    if (!mf.name.trim()) return;
    const d = await post({ action: "member.save", ...mf, sort: members.length });
    if (d.ok) { setMembers(p => [...p, d.item]); setMf({ name: "", function: mf.function, email: "", focus: "" }); setShowAdd(false); }
  }
  async function removeMember(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Remove this team member?")) return;
    const d = await post({ action: "member.delete", id });
    if (d.ok) { setMembers(p => p.filter(m => m.id !== id)); if (selected === id) setSelected(null); }
  }
  async function addNote() {
    if (!selected || !nf.body.trim()) return;
    const d = await post({ action: "note.add", member_id: selected, body: nf.body, kind: nf.kind });
    if (d.ok) { setNotes(p => [d.item, ...p]); setNf({ body: "", kind: nf.kind }); }
  }
  async function toggleNote(n: Note) {
    setNotes(p => p.map(x => x.id === n.id ? { ...x, done: !x.done } : x));
    await post({ action: "note.toggle", id: n.id, done: !n.done });
  }
  async function delNote(id: string) {
    const d = await post({ action: "note.delete", id });
    if (d.ok) setNotes(p => p.filter(x => x.id !== id));
  }

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_team_management.sql</code> in Supabase to enable the team hub.</div>;
  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  const sel = selected ? memberById.get(selected) : null;
  const selNotes = notes.filter(n => n.member_id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Team</h1>
        <p className="text-sm text-gray-400">Each function&apos;s health this week, and your people.</p>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {FUNCTIONS.map(fn => {
          const s = scoreOf(fn);
          const st = STATUS[s.status];
          const owner = s.owner_id ? memberById.get(s.owner_id) : null;
          const opts = membersFor(fn);
          return (
            <div key={fn} className={`rounded-2xl border ${st.ring} ${st.bg} p-4 shadow-sm`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-bold text-slate-800 leading-tight">{fn}</p>
                <button onClick={() => admin && saveScore(fn, { status: nextStatus(s.status) })} disabled={!admin} title={admin ? "Click to change status" : st.label}
                  className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: st.dot }} />{st.label}
                </button>
              </div>
              {admin ? (
                <>
                  <input value={s.headline} placeholder="This week's headline…" onChange={e => setScores(p => { const o = p.filter(x => x.function !== fn); return [...o, { ...s, headline: e.target.value }]; })} onBlur={e => saveScore(fn, { headline: e.target.value })}
                    className="mt-2 w-full text-[13px] text-slate-700 bg-transparent border-0 border-b border-dashed border-gray-300 focus:border-emerald-400 focus:outline-none py-1 placeholder:text-gray-300" />
                  <select value={s.owner_id ?? ""} onChange={e => saveScore(fn, { owner_id: e.target.value || null })} className="mt-2 w-full text-[12px] text-slate-500 bg-white/70 border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none">
                    <option value="">Owner…</option>
                    {opts.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    {members.filter(m => m.function !== fn).map(m => <option key={m.id} value={m.id}>{m.name} ({m.function})</option>)}
                  </select>
                </>
              ) : (
                <>
                  {s.headline && <p className="mt-2 text-[13px] text-slate-600 leading-snug">{s.headline}</p>}
                  <p className="mt-2 text-[12px] text-slate-400">{owner ? owner.name : "No owner"}</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Roster */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">The team</p>
          {admin && <button onClick={() => setShowAdd(v => !v)} className="text-[13px] font-medium text-emerald-600 hover:text-emerald-700">{showAdd ? "Cancel" : "+ Add person"}</button>}
        </div>
        {showAdd && admin && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <input value={mf.name} onChange={e => setMf({ ...mf, name: e.target.value })} placeholder="Name" className={inp} />
            <select value={mf.function} onChange={e => setMf({ ...mf, function: e.target.value })} className={inp}>{FUNCTIONS.map(f => <option key={f}>{f}</option>)}</select>
            <input value={mf.focus} onChange={e => setMf({ ...mf, focus: e.target.value })} placeholder="Focus / remit (optional)" className={inp} />
            <button onClick={addMember} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">Add</button>
          </div>
        )}
        {members.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No team members yet{admin ? " — add your first above." : "."}</p> : (
          <div className="divide-y divide-gray-50">
            {members.map(m => (
              <div key={m.id} className={`flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer ${selected === m.id ? "bg-emerald-50/60" : "hover:bg-gray-50"}`} onClick={() => setSelected(selected === m.id ? null : m.id)}>
                <div className="w-9 h-9 rounded-full bg-slate-100 grid place-items-center text-[13px] font-bold text-slate-500 shrink-0">{m.name.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.name} <span className="text-[11px] font-normal text-emerald-600 ml-1">{m.function}</span></p>
                  {m.focus && <p className="text-[12px] text-gray-400 truncate">{m.focus}</p>}
                </div>
                {(() => { const open = notes.filter(n => n.member_id === m.id && n.kind === "goal" && !n.done).length; return open > 0 ? <span className="text-[11px] text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 shrink-0">{open} open goal{open > 1 ? "s" : ""}</span> : null; })()}
                {admin && <button onClick={e => { e.stopPropagation(); removeMember(m.id); }} className="text-gray-300 hover:text-rose-500 text-sm px-1 shrink-0">✕</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 1:1 notes for the selected person */}
      {sel && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">1:1 · {sel.name}</p>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>
          {admin && (
            <div className="flex items-start gap-2 mb-4">
              <select value={nf.kind} onChange={e => setNf({ ...nf, kind: e.target.value as any })} className="text-sm border border-gray-200 rounded-lg px-2 py-2 text-slate-600 shrink-0">
                <option value="note">Note</option><option value="goal">Goal</option>
              </select>
              <input value={nf.body} onChange={e => setNf({ ...nf, body: e.target.value })} onKeyDown={e => { if (e.key === "Enter") addNote(); }} placeholder={nf.kind === "goal" ? "Add a goal…" : "Add a note from your 1:1…"} className={`${inp} flex-1`} />
              <button onClick={addNote} className="text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 shrink-0">Add</button>
            </div>
          )}
          {selNotes.length === 0 ? <p className="text-sm text-gray-400 py-2">No notes yet.</p> : (
            <ul className="space-y-1.5">
              {selNotes.map(n => (
                <li key={n.id} className="flex items-start gap-2.5 group">
                  {n.kind === "goal" ? (
                    <button onClick={() => admin && toggleNote(n)} className={`mt-0.5 w-4 h-4 rounded border shrink-0 grid place-items-center ${n.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                      {n.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  ) : <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] leading-snug ${n.done ? "text-gray-400 line-through" : "text-slate-700"}`}>{n.body}</p>
                    <p className="text-[11px] text-gray-400">{n.kind === "goal" ? "Goal · " : ""}{new Date(n.note_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
                  </div>
                  {admin && <button onClick={() => delNote(n.id)} className="text-gray-300 hover:text-rose-500 text-sm px-1 opacity-0 group-hover:opacity-100 shrink-0">✕</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
