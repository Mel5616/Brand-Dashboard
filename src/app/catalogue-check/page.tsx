"use client";

import { useState } from "react";

// Standalone upload form for the marketing team — drop a catalogue/spec-sheet
// PDF, Claude runs a first-pass spelling + brand-name check, and Mel gets
// emailed the findings before she does her own review. Same shared-key
// pattern as /log-gift (giftKey.ts) and /request (salesRequestKey.ts).
const BRANDS = ["UPPAbaby", "Gaia Baby", "WonderFold", "SmarTrike", "Frida", "Nanit", "Hannie", "Magic", "Mamave", "Matchstick Monkey", "ZAZU", "MiaMily", "Coolkidz Australia"];

function catalogueKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) { localStorage.setItem("catalogueKey", fromUrl); return fromUrl; }
    return localStorage.getItem("catalogueKey") || "";
  } catch { return ""; }
}

export default function CatalogueCheck() {
  const [file, setFile] = useState<File | null>(null);
  const [brand, setBrand] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ findings: { page?: number | null; quote: string; issue: string; suggestion: string }[]; error?: string } | null>(null);

  async function submit() {
    if (!file) { setErr("Choose a PDF first."); return; }
    setBusy(true); setErr(""); setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    if (brand) fd.set("brand", brand);
    if (uploadedBy) fd.set("uploaded_by", uploadedBy);
    if (notes) fd.set("notes", notes);
    const res = await fetch(`/api/catalogue-review?k=${encodeURIComponent(catalogueKey())}`, { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) setResult(res);
    else setErr(res?.error || "Couldn't check that file — try again.");
  }

  function reset() {
    setFile(null); setBrand(""); setUploadedBy(""); setNotes(""); setResult(null); setErr("");
  }

  const input = "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300";
  const label = "text-[12px] font-semibold text-gray-500";

  if (result) {
    const findings = result.findings || [];
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-lg w-full">
          <div className="text-4xl mb-2 text-center">{result.error ? "⚠️" : findings.length > 0 ? "🔎" : "✅"}</div>
          <p className="text-lg font-semibold text-gray-800 text-center">
            {result.error ? "Checked, but the AI pass hit an issue" : findings.length > 0 ? `${findings.length} possible issue${findings.length === 1 ? "" : "s"} found` : "No issues found"}
          </p>
          <p className="text-sm text-gray-400 mt-1 text-center">Mel&apos;s been emailed the results — she&apos;ll do the final review.</p>
          {findings.length > 0 && (
            <ul className="mt-5 space-y-2.5 text-sm">
              {findings.map((f, i) => (
                <li key={i} className="border border-amber-100 bg-amber-50/60 rounded-lg px-3 py-2.5">
                  <p className="font-medium text-slate-700">&ldquo;{f.quote}&rdquo;{f.page ? <span className="text-gray-400 font-normal"> · page {f.page}</span> : null}</p>
                  <p className="text-slate-500 mt-0.5">{f.issue} — suggested: <span className="font-medium text-emerald-700">{f.suggestion}</span></p>
                </li>
              ))}
            </ul>
          )}
          <button onClick={reset} className="mt-6 w-full text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg py-3">Check another file</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold text-gray-800">Catalogue spelling check</h1>
        <p className="text-sm text-gray-400 mt-0.5 mb-5">Upload a catalogue or spec-sheet PDF for a quick AI spelling &amp; brand-name pass before Mel&apos;s review.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div>
            <label className={label}>PDF</label>
            {file ? (
              <div className="mt-1 flex items-center gap-2 text-sm border border-emerald-200 bg-emerald-50/60 rounded-lg px-3 py-2.5">
                <span className="truncate text-emerald-800">📎 {file.name}</span>
                <button onClick={() => setFile(null)} className="ml-auto text-gray-400 hover:text-rose-500 shrink-0">✕</button>
              </div>
            ) : (
              <label className="mt-1 flex items-center justify-center gap-1.5 text-sm text-emerald-700 font-medium border border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 rounded-lg px-3 py-2.5 cursor-pointer">
                + Choose PDF
                <input type="file" accept="application/pdf" className="hidden" onChange={e => { const fl = e.target.files?.[0]; if (fl) setFile(fl); e.currentTarget.value = ""; }} />
              </label>
            )}
          </div>

          <div>
            <label className={label}>Brand <span className="text-gray-300 font-normal">(optional)</span></label>
            <select value={brand} onChange={e => setBrand(e.target.value)} className={input}>
              <option value="">Select…</option>
              {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className={label}>Your name</label>
            <input value={uploadedBy} onChange={e => setUploadedBy(e.target.value)} placeholder="So Mel knows who to ask" className={input} />
          </div>

          <div>
            <label className={label}>Notes <span className="text-gray-300 font-normal">(optional)</span></label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. new UPPAbaby range guide" className={input} />
          </div>

          {err && <p className="text-[12px] text-rose-500">{err}</p>}
          <button onClick={submit} disabled={!file || busy} className="w-full text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg py-3">
            {busy ? "Checking…" : "Check for spelling issues"}
          </button>
          <p className="text-[11px] text-gray-300 text-center">This runs an AI first pass — Mel still reviews everything before it&apos;s approved.</p>
        </div>
      </div>
    </div>
  );
}
