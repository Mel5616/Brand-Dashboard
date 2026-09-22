"use client";

import { useEffect, useState } from "react";

// Websites > Zazu Spin Wheel — read-only view of "Spin for a sleep-in"
// entries from zazu-kids.com.au (src/app/api/zazu-wheel). Every spin wins,
// so this is a lead list + prize breakdown, not a moderation queue.
type Spin = {
  id: number; created_at: string; email: string; prize_key: string; prize_label: string;
  code: string; expires_at: string | null; consent: boolean; page: string | null;
};

const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const fmtDT = (s: string) => new Date(s).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const LOU_CAP = 3;

export function ZazuWheelPanel() {
  const [items, setItems] = useState<Spin[]>([]);
  const [lousThisMonth, setLousThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [prizeF, setPrizeF] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/zazu-wheel-spins").then(r => r.json()).then(d => {
      setItems(d.items ?? []); setLousThisMonth(d.lousThisMonth ?? 0); setNeedsSetup(!!d.needsSetup);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        The Zazu Spin Wheel table isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/zazu_wheel_spins.sql</code> in Supabase.
      </div>
    );
  }

  const byPrize = new Map<string, { label: string; count: number }>();
  for (const s of items) {
    const cur = byPrize.get(s.prize_key) ?? { label: s.prize_label, count: 0 };
    cur.count++; byPrize.set(s.prize_key, cur);
  }
  const prizeRows = [...byPrize.entries()].sort((a, b) => b[1].count - a[1].count);
  const optedIn = items.filter(s => s.consent).length;

  const rows = items
    .filter(s => !prizeF || s.prize_key === prizeF)
    .filter(s => !q || s.email.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total spins", value: items.length, sub: "all time" },
          { label: "Opted into email", value: optedIn, sub: items.length ? `${Math.round((optedIn / items.length) * 100)}% of spins` : "—" },
          { label: "Free Lou this month", value: `${lousThisMonth} / ${LOU_CAP}`, sub: "monthly cap" },
          { label: "Most common prize", value: prizeRows[0]?.[1].label ?? "—", sub: prizeRows[0] ? `${prizeRows[0][1].count} wins` : "" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
            <p className="text-xl font-bold mt-1 text-slate-800">{k.value}</p>
            <p className="text-[11px] text-gray-400">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Prizes won</p>
        <div className="flex flex-wrap gap-2">
          {prizeRows.map(([key, r]) => (
            <button key={key} onClick={() => setPrizeF(p => p === key ? "" : key)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${prizeF === key ? "bg-slate-800 text-white border-slate-800" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
              {r.label} · {r.count}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or code…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-64" />
        {prizeF && <button onClick={() => setPrizeF("")} className="text-xs text-gray-400 hover:text-slate-600">Clear prize filter</button>}
        <span className="ml-auto text-xs text-gray-400">{rows.length} of {items.length}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="px-4 py-2.5">Spun</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Prize</th>
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5">Expires</th>
              <th className="px-4 py-2.5">Opted in</th>
              <th className="px-4 py-2.5">Page</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No spins here.</td></tr>
            ) : rows.map(s => (
              <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDT(s.created_at)}</td>
                <td className="px-4 py-2.5 text-slate-700">{s.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${s.prize_key === "lou" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{s.prize_label}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{s.code}</td>
                <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{s.expires_at ? fmtD(s.expires_at) : "—"}</td>
                <td className="px-4 py-2.5">{s.consent ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-gray-400 truncate max-w-[160px]">{s.page || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
