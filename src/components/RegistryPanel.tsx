"use client";
import React from "react";

// Websites > Baby Registry. Read only: the registries themselves are created
// and edited on uppababy.com.au, this is the window onto them.
type Row = {
  id: string; ownerName: string; partnerName: string | null; ownerEmail: string;
  dueDate: string | null; status: string; createdAt: string; shareUrl: string;
  items: number; wanted: number; bought: number; listValue: number; boughtValue: number;
  topItem: string | null; lastPurchase: string | null; orders: string[];
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" });
const dueIn = (iso: string | null, now: number) => {
  if (!iso || !now) return null;
  const d = Math.round((new Date(iso + "T00:00:00+10:00").getTime() - now) / 86400000);
  if (d < 0) return "due date passed";
  if (d === 0) return "due today";
  return d < 14 ? `${d} days to go` : `${Math.round(d / 7)} weeks to go`;
};

export function RegistryPanel() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  // Captured when the rows land rather than read during render, so the numbers
  // cannot shift on a re-render (and the linter is right to insist).
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    fetch("/api/registries").then(r => r.json()).then(d => {
      if (!d.ok) return;
      setRows(d.rows ?? []); setNeedsSetup(!!d.needsSetup); setNow(Date.now());
    }).catch(() => {});
  }, []);

  const all = rows ?? [];
  const withItems = all.filter(r => r.items > 0);
  const withPurchase = all.filter(r => r.bought > 0);
  const listValue = all.reduce((s, r) => s + r.listValue, 0);
  const boughtValue = all.reduce((s, r) => s + r.boughtValue, 0);
  const last30 = now ? all.filter(r => now - new Date(r.createdAt).getTime() < 30 * 86400000).length : 0;

  const kpis = [
    { l: "Registries", v: all.length, s: `${last30} in the last 30 days` },
    { l: "With items on them", v: withItems.length, s: all.length ? `${Math.round((withItems.length / all.length) * 100)}% of registries` : "none yet" },
    { l: "On the lists", v: money(listValue), s: `${all.reduce((s, r) => s + r.wanted, 0)} gifts wanted` },
    { l: "Bought from lists", v: money(boughtValue), s: `${withPurchase.length} registries with a purchase` },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Baby registry</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Registries created on uppababy.com.au. Parents save with the heart, send one link, and anything bought drops off the list. Created and edited on the site, read only here.
          </p>
        </div>
        <a href="https://uppababy.com.au/pages/registry" target="_blank" rel="noreferrer"
           className="text-[12px] font-semibold text-slate-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Open the registry page</a>
      </div>

      {needsSetup && (
        <p className="mt-3 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Run <code className="font-mono">supabase/add_registries.sql</code> in Supabase. Nothing can be saved until the tables exist.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {kpis.map(k => (
          <div key={k.l} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">{k.l}</div>
            <div className="text-xl font-semibold text-slate-800 mt-0.5 tabular-nums">{k.v}</div>
            <div className="text-[11.5px] text-gray-400">{k.s}</div>
          </div>
        ))}
      </div>

      {rows === null ? (
        <p className="text-[12.5px] text-gray-400 mt-4">Loading…</p>
      ) : all.length === 0 ? (
        <p className="text-[12.5px] text-gray-400 mt-4">No registries yet.</p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-semibold">Started</th>
                <th className="py-2 pr-3 font-semibold">Parents</th>
                <th className="py-2 pr-3 font-semibold">Due</th>
                <th className="py-2 pr-3 font-semibold">List</th>
                <th className="py-2 pr-3 font-semibold">Bought</th>
                <th className="py-2 pr-3 font-semibold">Biggest item</th>
                <th className="py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {all.map(r => (
                <tr key={r.id} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{day(r.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <div className="text-slate-700">{[r.ownerName, r.partnerName].filter(Boolean).join(" and ")}</div>
                    <div className="text-gray-400 text-[11.5px]">{r.ownerEmail}</div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">
                    {r.dueDate ? <>{day(r.dueDate)}<div className="text-[11.5px] text-gray-400">{dueIn(r.dueDate, now)}</div></> : "—"}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.items === 0 ? <span className="text-amber-600">nothing added yet</span>
                      : <>{r.wanted} gift{r.wanted === 1 ? "" : "s"}<div className="text-[11.5px] text-gray-400">{money(r.listValue)}</div></>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.bought > 0
                      ? <><span className="inline-block text-[11px] font-semibold rounded-full border px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">{r.bought} bought</span>
                          <div className="text-[11.5px] text-gray-400 mt-0.5">{money(r.boughtValue)}{r.orders.length ? ` · ${r.orders.join(", ")}` : ""}</div></>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{r.topItem ?? "—"}</td>
                  <td className="py-2 whitespace-nowrap">
                    <button
                      onClick={() => { navigator.clipboard?.writeText(r.shareUrl); setCopied(r.id); setTimeout(() => setCopied(null), 1500); }}
                      className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-800">
                      {copied === r.id ? "Copied" : "Copy share link"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
