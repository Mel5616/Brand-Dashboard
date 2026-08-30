"use client";

import { useEffect, useState } from "react";

type Finding = { page?: number | null; quote: string; issue: string; suggestion: string };
type Review = {
  id: string; brand: string | null; file_name: string; pdf_url: string; uploaded_by: string | null; notes: string | null;
  status: string; ai_summary: string | null; ai_findings: Finding[] | null; error: string | null;
  created_at: string; reviewed_at: string | null; reviewed_by: string | null;
};

// Lists catalogue/spec-sheet PDFs submitted via the public /catalogue-check
// form, with the Claude-generated spelling/brand-name findings already
// attached — Mel does her real review here, then marks it reviewed.
export function CatalogueReviewPanel() {
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/catalogue-review").then(r => r.json()).then(d => { if (d.ok) { setReviews(d.reviews ?? []); setNeedsSetup(!!d.needsSetup); } });
  };
  useEffect(() => { if (open && !reviews) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markReviewed(id: string) {
    setBusyId(id);
    await fetch("/api/catalogue-review", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setBusyId(null);
    load();
  }

  if (needsSetup) return null;

  const pending = (reviews ?? []).filter(r => r.status === "pending_review" || r.status === "processing" || r.status === "error");
  const done = (reviews ?? []).filter(r => r.status === "reviewed" || r.status === "no_issues");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Catalogue proofreading</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Team-submitted PDFs, AI-checked for spelling &amp; brand-name issues
            {pending.filter(r => r.status === "pending_review").length > 0 && <span className="ml-1.5 text-amber-600 font-semibold">· {pending.filter(r => r.status === "pending_review").length} awaiting your review</span>}
          </p>
        </div>
        <span className="text-gray-300 text-xs">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {reviews === null && <p className="text-sm text-gray-400">Loading…</p>}
          {reviews && reviews.length === 0 && <p className="text-sm text-gray-400">Nothing submitted yet — share the /catalogue-check link with your team.</p>}

          {[...pending, ...done].map(r => (
            <div key={r.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{r.file_name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {[r.brand, r.uploaded_by, new Date(r.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })].filter(Boolean).join(" · ")}
                  </p>
                  {r.notes && <p className="text-[11px] text-gray-400 italic mt-0.5">&ldquo;{r.notes}&rdquo;</p>}
                </div>
                <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${
                  r.status === "processing" ? "bg-amber-50 text-amber-600"
                  : r.status === "error" ? "bg-rose-50 text-rose-500"
                  : r.status === "no_issues" ? "bg-emerald-50 text-emerald-600"
                  : r.status === "reviewed" ? "bg-gray-100 text-gray-400"
                  : "bg-sky-50 text-sky-600"
                }`}>
                  {r.status === "processing" ? "checking…" : r.status === "error" ? "AI check failed" : r.status === "no_issues" ? "no issues" : r.status === "reviewed" ? "reviewed" : "needs review"}
                </span>
              </div>

              {r.error && <p className="text-xs text-rose-500 mt-2">{r.error}</p>}
              {r.ai_summary && <p className="text-xs text-gray-500 mt-2">{r.ai_summary}</p>}

              {r.ai_findings && r.ai_findings.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {r.ai_findings.map((f, i) => (
                    <li key={i} className="text-xs bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium text-slate-700">&ldquo;{f.quote}&rdquo;</span>{f.page ? <span className="text-gray-400"> · page {f.page}</span> : null}
                      <span className="text-slate-500"> — {f.issue}. Suggested: </span><span className="font-medium text-emerald-700">{f.suggestion}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-3 mt-3">
                <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-600 hover:text-slate-800">Open PDF ↗</a>
                {r.status !== "reviewed" && r.status !== "processing" && (
                  <button onClick={() => markReviewed(r.id)} disabled={busyId === r.id} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 disabled:opacity-40">
                    {busyId === r.id ? "Marking…" : "Mark reviewed"}
                  </button>
                )}
                {r.reviewed_by && <span className="text-[11px] text-gray-300">by {r.reviewed_by}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
