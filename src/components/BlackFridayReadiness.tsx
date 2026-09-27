"use client";

import { useEffect, useState } from "react";

// Black Friday readiness — three real steps per brand: offer confirmed (a
// deliberate click, separate from the deal's drafting text), Shopify
// discount code live, site deal approved. Confirming here is the only write
// this component makes; code creation and deal approval both happen
// elsewhere and just get reflected here once they're done.
type Row = {
  dealId: number; brand: string; offer: string; note: string | null; confirmed: boolean;
  codeLive: boolean; codes: { code: string; value_type: string | null; value: number | null }[];
  dealApproved: boolean;
};

function Step({ done, blocked, label, onClick }: { done: boolean; blocked?: boolean; label: string; onClick?: () => void }) {
  const body = (
    <>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${done ? "bg-emerald-100 text-emerald-600" : blocked ? "bg-gray-100 text-gray-300" : "bg-amber-50 text-amber-500"}`}>
        {done ? "✓" : "·"}
      </span>
      <span className={`text-xs ${done ? "text-slate-600" : blocked ? "text-gray-300" : "text-amber-600"}`}>{label}</span>
    </>
  );
  if (!onClick) return <div className="flex items-center gap-1.5">{body}</div>;
  return <button onClick={onClick} className="flex items-center gap-1.5 hover:opacity-70">{body}</button>;
}

export function BlackFridayReadiness() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => fetch("/api/black-friday/readiness").then(r => r.json()).then(j => {
    setLoading(false);
    if (!j.ok) return;
    setNeedsSetup(!!j.needsSetup);
    setRows(j.rows || []);
  }).catch(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function toggleConfirm(r: Row) {
    setBusy(r.dealId);
    setRows(rs => rs.map(x => x.dealId === r.dealId ? { ...x, confirmed: !x.confirmed } : x));
    await fetch("/api/site-deals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.dealId, offer_confirmed: !r.confirmed }) }).catch(() => {});
    setBusy(null);
  }

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup || !rows.length) return null;

  const blockedCount = rows.filter(r => !r.confirmed).length;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Black Friday readiness</h2>
        <p className="text-sm text-slate-500">
          Offer confirmed → Shopify code live → site deal approved, per brand. {blockedCount > 0 ? <span className="text-amber-600 font-medium">{blockedCount} brand{blockedCount === 1 ? "" : "s"} still waiting on your confirmation</span> : "Every brand's offer is confirmed."} — code creation and deal approval can't happen until you click Confirm.
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="py-2.5 pl-4 pr-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Offer</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Confirmed</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Code live</th>
              <th className="py-2.5 pr-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Site deal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.dealId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 align-top">
                <td className="py-2.5 pl-4 pr-3 font-semibold text-slate-700 whitespace-nowrap">{r.brand}</td>
                <td className="py-2.5 px-3 text-slate-600 max-w-xs">{r.offer}</td>
                <td className="py-2.5 px-3">
                  <Step done={r.confirmed} label={r.confirmed ? "Confirmed" : "Confirm"} onClick={busy === r.dealId ? undefined : () => toggleConfirm(r)} />
                </td>
                <td className="py-2.5 px-3">
                  <Step done={r.codeLive} blocked={!r.confirmed} label={r.codeLive ? r.codes.map(c => c.code).join(", ") : r.confirmed ? "Not created yet" : "Blocked"} />
                </td>
                <td className="py-2.5 pr-4">
                  <Step done={r.dealApproved} blocked={!r.confirmed} label={r.dealApproved ? "Approved" : r.confirmed ? "Awaiting approval" : "Blocked"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
