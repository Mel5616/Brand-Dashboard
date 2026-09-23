"use client";
import { useMemo } from "react";
import type { Brand, KlaviyoRow, BrandMonthly } from "@/lib/db";

// Email health strip (Email → Performance, top): per brand, email's share of
// Shopify revenue and the three deliverability rates, coloured against
// Klaviyo's benchmarks, for the selected month. The point is the colour: a
// brand under-emailing (low share) or burning its list (bounce/spam/unsub
// creeping up) shows before anyone opens Klaviyo.
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const pct = (n: number | null, d = 1) => n == null ? "—" : `${n.toFixed(d)}%`;
// thresholds: [good below, warn below] (share is the other way round)
const BENCH = {
  bounce: { good: 0.5, warn: 1.0, label: "Bounce", help: "Klaviyo: under 0.5% healthy, over 1% hurts inbox placement." },
  spam: { good: 0.05, warn: 0.1, label: "Spam", help: "Klaviyo: under 0.05% healthy, over 0.1% is a deliverability risk." },
  unsub: { good: 0.3, warn: 0.5, label: "Unsub", help: "Klaviyo: under 0.3% healthy, over 0.5% means the list is tiring." },
};
const tone = (v: number | null, good: number, warn: number) => v == null ? "text-slate-400" : v <= good ? "text-emerald-700" : v <= warn ? "text-amber-700" : "text-rose-600";
const shareTone = (v: number | null) => v == null ? "text-slate-400" : v >= 25 ? "text-emerald-700" : v >= 15 ? "text-slate-700" : "text-amber-700";

export function EmailHealthStrip({ brands, klaviyo, monthly, monthKey, monthLabel, brandFilter = "all" }: { brands: Brand[]; klaviyo: KlaviyoRow[]; monthly: BrandMonthly[]; monthKey: string; monthLabel: string; brandFilter?: number | "all" }) {
  const rows = useMemo(() => brands.filter(b => b.live !== false && (brandFilter === "all" || b.id === brandFilter)).map(b => {
    const k = klaviyo.find(r => r.brand_id === b.id && r.month_key === monthKey);
    const m = monthly.find(r => r.brand_id === b.id && r.month_key === monthKey);
    const sent = k?.emails_sent || 0;
    return {
      b, sent, emailRev: k?.revenue || 0, shopRev: m?.revenue || 0,
      share: k && m && m.revenue > 0 ? (k.revenue / m.revenue) * 100 : null,
      bounce: sent ? ((k?.bounces || 0) / sent) * 100 : null,
      spam: sent ? ((k?.spam_complaints || 0) / sent) * 100 : null,
      unsub: sent ? ((k?.unsubscribes || 0) / sent) * 100 : null,
      flowShare: k && k.revenue > 0 ? ((k.flow_revenue || 0) / k.revenue) * 100 : null,
    };
  }).filter(r => r.sent > 0 || r.emailRev > 0).sort((a, c) => c.emailRev - a.emailRev), [brands, klaviyo, monthly, monthKey, brandFilter]);
  const tot = useMemo(() => {
    const sent = rows.reduce((s, r) => s + r.sent, 0), emailRev = rows.reduce((s, r) => s + r.emailRev, 0), shopRev = rows.reduce((s, r) => s + r.shopRev, 0);
    const sum = (f: (r: typeof rows[number]) => number | null) => rows.reduce((s, r) => s + ((f(r) || 0) / 100) * r.sent, 0);
    return { sent, emailRev, shopRev, share: shopRev ? (emailRev / shopRev) * 100 : null, bounce: sent ? (sum(r => r.bounce) / sent) * 100 : null, spam: sent ? (sum(r => r.spam) / sent) * 100 : null, unsub: sent ? (sum(r => r.unsub) / sent) * 100 : null };
  }, [rows]);
  const flags = rows.filter(r => (r.bounce != null && r.bounce > BENCH.bounce.warn) || (r.spam != null && r.spam > BENCH.spam.warn) || (r.unsub != null && r.unsub > BENCH.unsub.warn) || (r.share != null && r.share < 15));
  if (!rows.length) return null;

  return (
    <section className="mb-5 grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <div className={`rounded-2xl border p-5 ${flags.length ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Needs a look · {monthLabel}</h3>
        {flags.length === 0 ? <p className="text-sm text-emerald-800">Every brand is inside Klaviyo&apos;s deliverability benchmarks and email is carrying at least 15% of revenue.</p> : (
          <ul className="space-y-1 text-sm text-slate-700">
            {flags.map(r => (
              <li key={r.b.id} className="flex flex-wrap gap-x-2 items-baseline"><span className="font-medium">{r.b.name}</span>
                {r.share != null && r.share < 15 && <span className="text-amber-800">email is only {pct(r.share, 0)} of revenue</span>}
                {r.bounce != null && r.bounce > BENCH.bounce.warn && <span className="text-rose-700">bounce {pct(r.bounce)}</span>}
                {r.spam != null && r.spam > BENCH.spam.warn && <span className="text-rose-700">spam {pct(r.spam, 2)}</span>}
                {r.unsub != null && r.unsub > BENCH.unsub.warn && <span className="text-rose-700">unsub {pct(r.unsub)}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400"><th className="text-left font-semibold py-1 pr-2">Brand</th><th className="text-right font-semibold py-1 px-2">Email rev</th><th className="text-right font-semibold py-1 px-2" title="Klaviyo-attributed revenue as a share of Shopify revenue. 20–30% is a healthy range for D2C.">Share</th><th className="text-right font-semibold py-1 px-2" title="Flow revenue as a share of email revenue">Flows</th><th className="text-right font-semibold py-1 px-2" title={BENCH.bounce.help}>Bounce</th><th className="text-right font-semibold py-1 px-2" title={BENCH.spam.help}>Spam</th><th className="text-right font-semibold py-1 pl-2" title={BENCH.unsub.help}>Unsub</th></tr></thead>
            <tbody className="divide-y divide-white/60">
              {rows.map(r => (
                <tr key={r.b.id}>
                  <td className="py-1 pr-2 text-slate-800 font-medium whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: r.b.color }} />{r.b.name}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{money(r.emailRev)}</td>
                  <td className={`py-1 px-2 text-right tabular-nums font-medium ${shareTone(r.share)}`}>{pct(r.share, 0)}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-slate-500">{pct(r.flowShare, 0)}</td>
                  <td className={`py-1 px-2 text-right tabular-nums ${tone(r.bounce, BENCH.bounce.good, BENCH.bounce.warn)}`}>{pct(r.bounce)}</td>
                  <td className={`py-1 px-2 text-right tabular-nums ${tone(r.spam, BENCH.spam.good, BENCH.spam.warn)}`}>{pct(r.spam, 2)}</td>
                  <td className={`py-1 pl-2 text-right tabular-nums ${tone(r.unsub, BENCH.unsub.good, BENCH.unsub.warn)}`}>{pct(r.unsub)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Green = inside Klaviyo&apos;s benchmark, amber = watch, red = act. Share: green 25%+, amber under 15%.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 content-start">
        {[["Email revenue", money(tot.emailRev)], ["Share of revenue", pct(tot.share, 0)], ["Delivered", tot.sent.toLocaleString("en-AU")], ["Bounce · spam · unsub", `${pct(tot.bounce)} · ${pct(tot.spam, 2)} · ${pct(tot.unsub)}`]].map(([l, v]) => (
          <div key={l} className="bg-white rounded-2xl border border-gray-100 px-4 py-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className={`font-semibold text-slate-800 tabular-nums mt-0.5 ${String(v).length > 12 ? "text-sm" : "text-2xl"}`}>{v}</p></div>
        ))}
        <p className="col-span-2 text-[11px] text-gray-400 px-1">{monthLabel} · {brandFilter === "all" ? "all live brands" : rows[0]?.b.name} · Klaviyo attribution, revenue ex-GST as Klaviyo reports it</p>
      </div>
    </section>
  );
}
