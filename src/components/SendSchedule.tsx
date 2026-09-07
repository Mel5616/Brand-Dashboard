"use client";

import { useEffect, useState } from "react";

// Flat, date-ordered list of every EDM send across the campaign stream — "see
// this week, not this brand." Read-only for the team; admins can tweak a
// subject line or date inline. Backed by campaign_sends (src/app/api/campaign-sends).
type Send = { id: string; send_date: string; brand: string; campaign: string | null; type: string; subject: string };

const TYPE_STYLE: Record<string, string> = {
  Campaign: "bg-[#E8D8CF] text-[#A8563A]",
  Momentum: "bg-slate-100 text-slate-500",
  "Black Friday": "bg-slate-900 text-white",
};
const fmtD = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export function SendSchedule({ canEdit = false }: { canEdit?: boolean }) {
  const [sends, setSends] = useState<Send[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/campaign-sends").then(r => r.json()).then(d => {
      if (d.ok) { setSends(d.sends || []); setNeedsSetup(!!d.needsSetup); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveSubject(id: string, subject: string) {
    setSends(prev => prev.map(s => (s.id === id ? { ...s, subject } : s)));
    await fetch("/api/campaign-sends", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, subject }) });
  }

  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        The send schedule isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_campaign_sends.sql</code> in Supabase.
      </div>
    );
  }
  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (!sends.length) return <p className="text-sm text-slate-400 py-8 text-center">No sends scheduled yet.</p>;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
            <th className="py-2 pl-4 pr-3 font-medium w-28">Send</th>
            <th className="py-2 px-3 font-medium w-40">Brand</th>
            <th className="py-2 px-3 font-medium w-32">Type</th>
            <th className="py-2 pr-4 font-medium">Subject direction</th>
          </tr>
        </thead>
        <tbody>
          {sends.map(s => (
            <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60 align-top">
              <td className="py-2.5 pl-4 pr-3 font-semibold text-slate-700 whitespace-nowrap">{fmtD(s.send_date)}</td>
              <td className="py-2.5 px-3 text-[#A8563A] font-medium uppercase text-xs tracking-wide">{s.brand}</td>
              <td className="py-2.5 px-3">
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${TYPE_STYLE[s.type] || "bg-slate-100 text-slate-500"}`}>{s.type}</span>
              </td>
              <td className="py-2.5 pr-4 text-slate-700">
                {canEdit && editing === s.id ? (
                  <input
                    autoFocus defaultValue={s.subject}
                    onBlur={e => { saveSubject(s.id, e.target.value); setEditing(null); }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                    className="w-full text-sm border border-emerald-300 rounded px-2 py-1 focus:outline-none"
                  />
                ) : (
                  <span onClick={() => canEdit && setEditing(s.id)} className={canEdit ? "cursor-text hover:bg-amber-50 rounded px-1 -mx-1" : ""}>
                    {s.campaign ? <><strong className="font-medium">{s.campaign}:</strong> {s.subject}</> : s.subject}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
