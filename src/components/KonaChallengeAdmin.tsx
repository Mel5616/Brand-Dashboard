"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = {
  id: number; store: string; name: string; email: string; mobile: string | null;
  instagram_handle: string | null; fold_time_seconds: number | null; is_winner: boolean; created_at: string;
};
const STORE_NAMES: Record<string, string> = {
  "baby-village": "Baby Village", "baby-kingdom": "Baby Kingdom", "babyroad": "BabyRoad",
  "whole-bubs": "Whole Bubs", "coolkidz-hq": "Coolkidz Head Office",
};

export function KonaChallengeAdmin() {
  const [items, setItems] = useState<Entry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup">("loading");
  const [storeF, setStoreF] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    fetch("/api/kona-challenge").then(r => r.json()).then(d => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      setItems(d.items ?? []); setState("ready");
    }).catch(() => setState("ready"));
  }
  useEffect(() => { load(); }, []);

  async function toggleWinner(e: Entry) {
    setBusyId(e.id);
    await fetch("/api/kona-challenge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, is_winner: !e.is_winner }) });
    setItems(items.map(i => i.id === e.id ? { ...i, is_winner: !i.is_winner } : i));
    setBusyId(null);
  }

  const byStore = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of items) counts[e.store] = (counts[e.store] ?? 0) + 1;
    return counts;
  }, [items]);
  const filtered = storeF ? items.filter(e => e.store === storeF) : items;

  function downloadCsv() {
    const rows = [["Store", "Name", "Email", "Mobile", "Instagram", "Fold time (s)", "Winner", "Entered"],
      ...filtered.map(e => [STORE_NAMES[e.store] ?? e.store, e.name, e.email, e.mobile ?? "", e.instagram_handle ?? "", e.fold_time_seconds?.toString() ?? "", e.is_winner ? "Yes" : "", new Date(e.created_at).toLocaleString("en-AU")])];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kona-challenge-entries.csv"; a.click();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Run <code className="bg-gray-50 px-1 rounded">supabase/add_kona_challenge.sql</code> first.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Object.entries(STORE_NAMES).map(([slug, name]) => (
          <button key={slug} onClick={() => setStoreF(storeF === slug ? "" : slug)} className={`text-left rounded-xl border p-3 transition ${storeF === slug ? "bg-[#F3F0FB] border-[#9D8DF1]" : "bg-white border-gray-100 hover:border-gray-200"}`}>
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{name}</div>
            <div className="text-xl font-extrabold text-slate-800">{byStore[slug] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{filtered.length} entr{filtered.length === 1 ? "y" : "ies"}{storeF ? ` · ${STORE_NAMES[storeF]}` : " · all stores"}</div>
        <button onClick={downloadCsv} className="text-sm font-semibold text-[#6B54D6] hover:underline">Download CSV</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="px-4 py-3">Store</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Instagram</th><th className="px-4 py-3">Fold time</th><th className="px-4 py-3">Entered</th><th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className={`border-b border-gray-50 last:border-0 ${e.is_winner ? "bg-amber-50" : ""}`}>
                <td className="px-4 py-3 font-medium text-slate-700">{STORE_NAMES[e.store] ?? e.store}</td>
                <td className="px-4 py-3">{e.name}</td>
                <td className="px-4 py-3 text-gray-500">{e.email}</td>
                <td className="px-4 py-3 text-gray-500">{e.instagram_handle ? `@${e.instagram_handle}` : "—"}</td>
                <td className="px-4 py-3 text-gray-500">{e.fold_time_seconds ?? "—"}</td>
                <td className="px-4 py-3 text-gray-400">{new Date(e.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                <td className="px-4 py-3">
                  <button disabled={busyId === e.id} onClick={() => toggleWinner(e)} className={`text-xs font-bold rounded-full px-3 py-1.5 ${e.is_winner ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{e.is_winner ? "🏆 Winner" : "Mark winner"}</button>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
