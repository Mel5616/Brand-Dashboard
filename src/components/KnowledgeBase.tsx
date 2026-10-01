"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = { id: number; topic: string; question: string; answer: string; link: string | null; source: string; source_ref: string | null;
  status: string; corrects: number | null; decided_by: string | null; decided_reason: string | null; updated_at: string };
type Fix = { website: Entry; correction: Entry };
type Hist = { id: number; before: Entry | null; after: Entry; changed_by: string | null; reason: string | null; changed_at: string };

const SOURCE_LABEL: Record<string, string> = { website: "Website", confirmed: "Confirmed fact", help_centre: "Help centre", helpdesk: "Helpdesk", team_reply: "Team reply" };
const STATUS_STYLE: Record<string, string> = { approved: "bg-emerald-100 text-emerald-800", draft: "bg-gray-100 text-gray-700", needs_review: "bg-amber-100 text-amber-800", retired: "bg-gray-200 text-gray-500 line-through" };
const when = (s: string) => new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Melbourne" });

export function KnowledgeBase() {
  const [view, setView] = useState<"all" | "needs" | "fixes">("needs");
  const [rows, setRows] = useState<Entry[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [q, setQ] = useState(""); const [source, setSource] = useState(""); const [status, setStatus] = useState(""); const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ question: string; answer: string; link: string } | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams({ brand: "uppababy" });
    if (q) qs.set("q", q); if (source) qs.set("source", source); if (status) qs.set("status", status); if (topic) qs.set("topic", topic);
    const res = await fetch(`/api/kb?${qs}`).catch(() => null);
    const r = res ? await res.json().catch(() => ({ ok: false })) : { ok: false };
    setLoading(false);
    if (res && res.status === 403) { setForbidden(true); setRows([]); setFixes([]); return; }
    setForbidden(false);
    if (!r.ok) { setMsg("Could not load the knowledge base."); return; }
    setRows(r.rows); setFixes(r.fixes); setMsg(null);
    if (!topic) setTopics(Array.from(new Set<string>(r.rows.map((e: Entry) => e.topic))).sort());
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, source, status, topic]); // eslint-disable-line react-hooks/exhaustive-deps

  const needs = useMemo(() => rows.filter(r => r.status === "needs_review" || r.status === "draft"), [rows]);
  const shown = view === "needs" ? needs : rows;

  async function openEntry(e: Entry) {
    if (open === e.id) { setOpen(null); return; }
    setOpen(e.id); setEdit(null);
    const r = await fetch(`/api/kb?history=${e.id}`).then(x => x.json()).catch(() => ({ history: [] }));
    setHist(r.history || []);
  }
  async function patch(id: number, p: Record<string, unknown>) {
    const r = await fetch("/api/kb", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: p }) }).then(x => x.json());
    if (!r.ok) { setMsg(r.error || "Not saved."); return; }
    setMsg("Saved."); setEdit(null); load();
  }
  async function undo(h: Hist) {
    const r = await fetch("/api/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: h.id }) }).then(x => x.json());
    setMsg(r.ok ? "Change undone." : r.error || "Could not undo."); load();
  }
  function copyFixes() {
    const text = fixes.map(f => `Page: ${f.website.source_ref || f.website.topic}\nQuestion: ${f.website.question}\nWebsite says: ${f.website.answer}\nShould say: ${f.correction.answer}`).join("\n\n");
    navigator.clipboard?.writeText(text).then(() => setMsg("Website fixes copied."), () => setMsg("Copy did not work; select the text instead."));
  }

  if (forbidden) {
    return <p className="bg-white border rounded-xl p-4 text-sm text-gray-600">The Knowledge tab is for the people who approve answers (David and Melanie).</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(["needs", "all", "fixes"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-full text-sm border ${view === v ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300"}`}>
            {v === "needs" ? `Needs you (${needs.length})` : v === "all" ? `All answers (${rows.length})` : `Website fixes (${fixes.length})`}
          </button>
        ))}
        {msg && <span className="text-sm text-gray-600 ml-2">{msg}</span>}
      </div>

      {view !== "fixes" && (
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search questions and answers" className="border rounded-lg px-3 py-2 text-sm w-72 max-w-full" />
          <select value={source} onChange={e => setSource(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">All sources</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={topic} onChange={e => setTopic(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">All topics</option>{topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">All statuses</option>{["approved", "needs_review", "draft", "retired"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
      )}

      {view === "fixes" ? (
        <div className="space-y-3">
          <button onClick={copyFixes} className="px-3 py-1.5 rounded-lg text-sm bg-gray-900 text-white">Copy all fixes</button>
          {fixes.map(f => (
            <div key={f.correction.id} className="bg-white border rounded-xl p-4 text-sm space-y-2">
              <div className="font-medium">{f.website.question}</div>
              <div><span className="text-gray-500">Website says: </span>{f.website.answer}</div>
              <div><span className="text-gray-500">Should say: </span>{f.correction.answer}</div>
              <div className="text-xs text-gray-500">{SOURCE_LABEL[f.correction.source]} · {f.correction.decided_reason}</div>
            </div>
          ))}
          {!fixes.length && <p className="text-sm text-gray-500">No website fixes waiting.</p>}
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
          {!loading && !shown.length && <p className="p-4 text-sm text-gray-500">{view === "needs" ? "Nothing needs you right now." : "No answers match."}</p>}
          {shown.slice(0, 300).map(e => (
            <div key={e.id} className="p-3 text-sm">
              <button onClick={() => openEntry(e)} className="w-full text-left flex flex-wrap gap-2 items-baseline">
                <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[e.status] || ""}`}>{e.status.replace("_", " ")}</span>
                <span className="text-xs text-gray-500">{SOURCE_LABEL[e.source]} · {e.topic}</span>
                <span className="font-medium flex-1 min-w-0">{e.question}</span>
              </button>
              {open === e.id && (
                <div className="mt-3 space-y-3">
                  {edit ? (
                    <div className="space-y-2">
                      <input value={edit.question} onChange={x => setEdit({ ...edit, question: x.target.value })} className="border rounded-lg px-3 py-2 w-full" />
                      <textarea value={edit.answer} onChange={x => setEdit({ ...edit, answer: x.target.value })} rows={5} className="border rounded-lg px-3 py-2 w-full" />
                      <input value={edit.link} onChange={x => setEdit({ ...edit, link: x.target.value })} placeholder="More link (optional), e.g. /pages/warranty" className="border rounded-lg px-3 py-2 w-full" />
                      <div className="flex gap-2">
                        <button onClick={() => patch(e.id, { question: edit.question, answer: edit.answer, link: edit.link, status: "approved" })} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white">Save and approve</button>
                        <button onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-lg border">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{e.answer}</p>
                      {e.link && <p className="text-xs text-gray-500">More: {e.link}</p>}
                      <p className="text-xs text-gray-500">{e.decided_reason} · {e.decided_by} · {when(e.updated_at)}{e.source_ref ? ` · ${e.source_ref}` : ""}</p>
                      <div className="flex flex-wrap gap-2">
                        {e.status !== "approved" && <button onClick={() => patch(e.id, { status: "approved", decided_reason: "Approved in the Knowledge tab" })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white">Approve</button>}
                        <button onClick={() => setEdit({ question: e.question, answer: e.answer, link: e.link || "" })} className="px-3 py-1.5 rounded-lg border">Edit</button>
                        {e.status !== "retired" && <button onClick={() => patch(e.id, { status: "retired", decided_reason: "Retired in the Knowledge tab" })} className="px-3 py-1.5 rounded-lg border">Retire</button>}
                      </div>
                    </>
                  )}
                  {hist.length > 0 && (
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer">History ({hist.length})</summary>
                      <ul className="mt-2 space-y-1">
                        {hist.map(h => (
                          <li key={h.id} className="flex flex-wrap gap-2 items-center">
                            <span>{when(h.changed_at)} · {h.changed_by} · {h.reason}</span>
                            {h.before && <button onClick={() => undo(h)} className="underline">Undo</button>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
