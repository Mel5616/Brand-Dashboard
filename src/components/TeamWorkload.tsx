"use client";

import { useEffect, useState } from "react";

// Team workload — who owns what across campaigns, social drafts and briefs,
// and what's overdue. Pulled live (see api/team-workload); nothing stored.
type Item = { id: string; kind: "campaign" | "social" | "brief"; title: string; brand: string | null; status: string; due: string | null; overdue: boolean; tab: string };
type Owner = { name: string; function: string | null; items: Item[] };

const KIND_LABEL: Record<Item["kind"], string> = { campaign: "Campaign", social: "Social", brief: "Brief" };
const fmtDue = (s: string | null) => (!s ? "No date" : new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }));

export function TeamWorkload() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team-workload").then(r => r.json()).then(j => {
      setLoading(false);
      if (!j.ok) return;
      setNeedsSetup(!!j.needsSetup);
      setOwners(j.owners || []);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup || !owners.length) return null;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Workload</h2>
        <p className="text-sm text-slate-500">Open campaigns, social drafts and briefs per person, live from what's actually assigned — not a separate list to keep updated.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {owners.map(o => {
          const overdue = o.items.filter(i => i.overdue).length;
          const isOpen = open === o.name;
          return (
            <div key={o.name} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${overdue ? "border-rose-200" : "border-gray-100"}`}>
              <button onClick={() => setOpen(isOpen ? null : o.name)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-gray-50/60">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{o.name}</p>
                  {o.function && <p className="text-[11px] text-gray-400">{o.function}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {overdue > 0 && <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">{overdue} overdue</span>}
                  <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-50 text-slate-500">{o.items.length} open</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-gray-50">
                  {o.items.length ? o.items
                    .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1))
                    .map(i => (
                      <a key={i.id} href={`/?tab=${i.tab}`} className="block px-4 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                        <p className="text-sm text-slate-700 font-medium truncate">{i.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {KIND_LABEL[i.kind]}{i.brand ? ` · ${i.brand}` : ""} · {i.status}
                          {" · "}
                          <span className={i.overdue ? "text-rose-500 font-semibold" : ""}>{i.overdue ? `Overdue since ${fmtDue(i.due)}` : `Due ${fmtDue(i.due)}`}</span>
                        </p>
                      </a>
                    )) : <p className="text-sm text-slate-400 px-4 py-3">Nothing open. Clean plate.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
