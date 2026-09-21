"use client";
import React from "react";

// $20 vouchers issued to UPPAbaby customers who spend $500+, redeemable at
// Frida, Mamave or Matchstick Monkey. Issued by the orders/paid webhook
// (src/app/api/webhooks/uppababy-order-paid), tracked here. Redemption is
// swept against the brand stores when the card loads.

type Row = {
  id: string; source_order_name: string | null; order_subtotal: number | null; customer_email: string | null; customer_name: string | null;
  brand_id: number; brand_name: string; code: string; value: number; min_spend: number; expires_at: string; email_sent: boolean;
  status: string; error: string | null; redeemed_at: string | null; redeemed_order_name: string | null; redeemed_order_total: number | null; issued_at: string;
};
type Brand = { id: number; name: string; host: string; colour: string };

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" });

export function VouchersCard({ admin }: { admin: boolean }) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [cfg, setCfg] = React.useState<{ value: number; minSpend: number; days: number; threshold: number } | null>(null);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "issued" | "redeemed" | "expired" | "failed">("all");
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback((sweep = false) => {
    fetch(`/api/vouchers${sweep ? "?sweep=1" : ""}`).then(r => r.json()).then(d => {
      if (!d.ok) return;
      setRows(d.rows ?? []); setBrands(d.brands ?? []); setCfg(d.config ?? null); setNeedsSetup(!!d.needsSetup);
    }).catch(() => {});
  }, []);
  React.useEffect(() => load(false), [load]);

  async function resend(id: string) {
    if (!confirm("Resend the voucher email to this customer?")) return;
    setBusy(id);
    await fetch("/api/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resend: id }) }).catch(() => null);
    setBusy(null); load(false);
  }

  const all = rows ?? [];
  const issued = all.filter(r => r.status !== "failed");
  const redeemed = all.filter(r => r.status === "redeemed");
  const open = all.filter(r => r.status === "issued");
  const rate = issued.length ? Math.round((redeemed.length / issued.length) * 100) : 0;
  const revenue = redeemed.reduce((s, r) => s + (r.redeemed_order_total || 0), 0);
  const perBrand = brands.map(b => {
    const mine = issued.filter(r => r.brand_id === b.id);
    const red = mine.filter(r => r.status === "redeemed");
    return { ...b, issued: mine.length, redeemed: red.length, revenue: red.reduce((s, r) => s + (r.redeemed_order_total || 0), 0) };
  });
  const shown = all.filter(r => filter === "all" || r.status === filter);

  const pill = (s: string) => ({
    issued: "bg-sky-50 text-sky-700 border-sky-200",
    redeemed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    expired: "bg-gray-50 text-gray-500 border-gray-200",
    failed: "bg-rose-50 text-rose-700 border-rose-200",
  }[s] || "bg-gray-50 text-gray-500 border-gray-200");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">UPPAbaby $20 vouchers</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {cfg ? `Spend ${money(cfg.threshold)} on uppababy.com.au and pick a brand in the cart: a one-use code for $${cfg.value} off over $${cfg.minSpend}, valid ${cfg.days} days, emailed when the order is paid.` : "Loading…"}
          </p>
        </div>
        <button onClick={() => load(true)} className="text-[12px] font-semibold text-slate-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Check redemptions</button>
      </div>

      {needsSetup && (
        <p className="mt-3 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Run <code className="font-mono">supabase/add_issued_vouchers.sql</code> in Supabase to start tracking. Vouchers cannot be issued until the table exists.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { l: "Issued", v: issued.length, s: `${open.length} open` },
          { l: "Redeemed", v: redeemed.length, s: `${rate}% of issued` },
          { l: "Redemption revenue", v: money(revenue), s: "brand-site orders using a code" },
          { l: "Cost so far", v: money(redeemed.length * (cfg?.value || 20)), s: "only redeemed codes cost anything" },
        ].map(k => (
          <div key={k.l} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">{k.l}</div>
            <div className="text-xl font-semibold text-slate-800 mt-0.5 tabular-nums">{k.v}</div>
            <div className="text-[11.5px] text-gray-400">{k.s}</div>
          </div>
        ))}
      </div>

      {perBrand.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {perBrand.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-[12px] rounded-full border border-gray-200 px-3 py-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: b.colour }} />
              <span className="font-semibold text-slate-700">{b.name}</span>
              <span className="text-gray-400">{b.issued} issued · {b.redeemed} redeemed{b.revenue ? ` · ${money(b.revenue)}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-4 mb-2">
        {(["all", "issued", "redeemed", "expired", "failed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[11.5px] font-semibold rounded-full px-2.5 py-1 border capitalize ${filter === f ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            {f}{f !== "all" ? ` (${all.filter(r => r.status === f).length})` : ""}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-[12.5px] text-gray-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-[12.5px] text-gray-400">No vouchers {filter === "all" ? "issued yet" : filter}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-semibold">Issued</th>
                <th className="py-2 pr-3 font-semibold">UPPAbaby order</th>
                <th className="py-2 pr-3 font-semibold">Customer</th>
                <th className="py-2 pr-3 font-semibold">Brand</th>
                <th className="py-2 pr-3 font-semibold">Code</th>
                <th className="py-2 pr-3 font-semibold">Expires</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                {admin && <th className="py-2 font-semibold"></th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{day(r.issued_at)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap"><span className="font-semibold text-slate-700">{r.source_order_name}</span>{r.order_subtotal ? <span className="text-gray-400"> · {money(r.order_subtotal)}</span> : null}</td>
                  <td className="py-2 pr-3"><div className="text-slate-700">{r.customer_name || "—"}</div><div className="text-gray-400 text-[11.5px]">{r.customer_email}</div></td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.brand_name}</td>
                  <td className="py-2 pr-3 font-mono whitespace-nowrap text-slate-800">{r.code}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{day(r.expires_at)}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block text-[11px] font-semibold rounded-full border px-2 py-0.5 capitalize ${pill(r.status)}`}>{r.status}</span>
                    {r.status === "redeemed" && <div className="text-[11.5px] text-gray-400 mt-0.5">{r.redeemed_order_name} · {money(r.redeemed_order_total || 0)} · {r.redeemed_at ? day(r.redeemed_at) : ""}</div>}
                    {!r.email_sent && r.status !== "failed" && <div className="text-[11.5px] text-amber-600 mt-0.5">Email not sent</div>}
                    {r.error && <div className="text-[11.5px] text-rose-600 mt-0.5">{r.error}</div>}
                  </td>
                  {admin && (
                    <td className="py-2 whitespace-nowrap">
                      {r.status !== "failed" && (
                        <button onClick={() => resend(r.id)} disabled={busy === r.id} className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40">
                          {busy === r.id ? "Sending…" : "Resend email"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
