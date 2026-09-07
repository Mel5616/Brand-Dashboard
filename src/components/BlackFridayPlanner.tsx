"use client";

import { useEffect, useState } from "react";

// Black Friday planning — the send architecture (fixed) and the
// position/offer by brand (offer is "yours to set", so it's the one
// editable field). Backed by black_friday_plan (src/app/api/black-friday).
type Row = { brand: string; position: string | null; pill: string; offer: string; sends: string | null };

const ARCHITECTURE = [
  { send: "Wed 25 Nov", brands: "Nanit, WonderFold, smarTrike", what: "VIP early access, list only, 24 hours ahead" },
  { send: "Fri 27 Nov", brands: "All participating brands", what: "Black Friday live, 6am" },
  { send: "Sat 28 Nov", brands: "Nanit, WonderFold", what: "Mid-weekend reminder, non-openers only" },
  { send: "Mon 30 Nov", brands: "All participating brands", what: "Cyber Monday final call, 6am" },
  { send: "Tue 1 Dec", brands: "TBC", what: "Extension send, only if the decision to extend is made by 24 Nov" },
];

const PILL_STYLE: Record<string, string> = {
  go: "bg-[#2E5E43] text-white",
  part: "bg-[#E8DCC2] text-[#8A6A2F]",
  no: "bg-[#EFDAD7] text-[#8C3A32]",
};

export function BlackFridayPlanner({ canEdit = false }: { canEdit?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/black-friday").then(r => r.json()).then(d => {
      if (d.ok) { setRows(d.rows || []); setNeedsSetup(!!d.needsSetup); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveOffer(brand: string, offer: string) {
    setRows(prev => prev.map(r => (r.brand === brand ? { ...r, offer } : r)));
    await fetch("/api/black-friday", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, offer }) });
  }

  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Black Friday planning isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_campaign_sends.sql</code> in Supabase.
      </div>
    );
  }
  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-2">27 to 30 November · Send architecture</h3>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="py-2 pl-4 pr-3 font-medium w-28">Send</th>
                <th className="py-2 px-3 font-medium w-56">Brands</th>
                <th className="py-2 pr-4 font-medium">What it is</th>
              </tr>
            </thead>
            <tbody>
              {ARCHITECTURE.map(a => (
                <tr key={a.send} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 pl-4 pr-3 font-semibold text-slate-700 whitespace-nowrap">{a.send}</td>
                  <td className="py-2.5 px-3 text-slate-600">{a.brands}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{a.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-700">Position and offer by brand</h3>
          {canEdit && <span className="text-xs text-gray-400">Offers are yours to set — click one to edit</span>}
        </div>
        {!rows.length ? (
          <p className="text-sm text-slate-400">No brands set up yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2 pl-4 pr-3 font-medium w-36">Brand</th>
                  <th className="py-2 px-3 font-medium w-48">Position</th>
                  <th className="py-2 px-3 font-medium w-40">Offer</th>
                  <th className="py-2 pr-4 font-medium">Sends</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.brand} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="py-2.5 pl-4 pr-3 font-semibold text-slate-700 whitespace-nowrap">{r.brand}</td>
                    <td className="py-2.5 px-3">
                      {r.position && <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${PILL_STYLE[r.pill] || PILL_STYLE.part}`}>{r.position}</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      {canEdit && editing === r.brand ? (
                        <input
                          autoFocus defaultValue={r.offer}
                          onBlur={e => { saveOffer(r.brand, e.target.value); setEditing(null); }}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                          className="w-full text-sm border border-emerald-300 rounded px-2 py-1 focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => canEdit && setEditing(r.brand)}
                          className={`font-semibold ${r.offer === "TBC" ? "text-[#A8563A]" : "text-slate-700"} ${canEdit ? "cursor-text hover:bg-amber-50 rounded px-1 -mx-1" : ""}`}
                        >
                          {r.offer}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.sends}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
