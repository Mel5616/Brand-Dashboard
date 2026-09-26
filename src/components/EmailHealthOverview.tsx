"use client";

import { Fragment, useEffect, useState } from "react";

// Email Health Overview (top of Email Marketing > Lifecycle Flows) — the
// live version of the one-off portfolio audit (audit/klaviyo-audit-2026-09-26.md):
// revenue, deliverability, flow coverage gaps and campaign cadence, ranked
// by revenue at stake, built from tables that already sync nightly. No live
// Klaviyo call from this component.
type Flag = { metric: string; value: number; threshold: number };
type FlowRef = { key: string; label: string; status: string };
type BrandHealth = {
  id: number; name: string; month: string | null;
  revenue: { flow: number; campaign: number; total: number };
  deliverability: { flags: Flag[]; emails_sent: number };
  coverage: { missing: string[]; live_but_silent: string[]; to_build: FlowRef[] };
  campaigns: { days_since_last_send: number | null; zero_revenue_streak: boolean; recent_count: number };
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const METRIC_LABEL: Record<string, string> = { bounce_rate: "Bounce", spam_complaint_rate: "Spam", unsubscribe_rate: "Unsub" };
const STATUS_LABEL: Record<string, string> = { not_built: "Not built", planned: "Planned" };

export function EmailHealthOverview() {
  const [brands, setBrands] = useState<BrandHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/klaviyo/email-health").then(r => r.json()).then(j => {
      setLoading(false);
      if (!j.ok) return;
      setNeedsSetup(!!j.needsSetup);
      setBrands(j.brands || []);
      setMonth(j.currentKMonth || null);
    }).catch(() => setLoading(false));
  }, []);

  const flagCount = (b: BrandHealth) =>
    b.deliverability.flags.length + b.coverage.missing.length + b.coverage.live_but_silent.length +
    (b.campaigns.zero_revenue_streak ? 1 : 0) + (b.campaigns.days_since_last_send !== null && b.campaigns.days_since_last_send > 30 ? 1 : 0);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup || !brands.length) return null; // Lifecycle Flows grid below shows its own setup message

  const fmtMonth = (mk: string | null) => mk ? new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Email health overview</h2>
        <p className="text-sm text-slate-500">Revenue, deliverability, flow coverage and campaign cadence across the portfolio, ranked by revenue at stake. Revenue is {fmtMonth(month)}, ex-GST as Klaviyo reports it.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">Brand</th>
              <th className="text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">Revenue</th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">Flags</th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">Flows to build</th>
            </tr>
          </thead>
          <tbody>
            {brands.map(b => {
              const flags = flagCount(b);
              const isOpen = open === b.id;
              return (
                <Fragment key={b.id}>
                  <tr onClick={() => setOpen(isOpen ? null : b.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{b.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{money(b.revenue.total)}</td>
                    <td className="px-3 py-2">
                      {flags === 0
                        ? <span className="text-xs text-emerald-600 font-medium">Clean</span>
                        : <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: flags >= 3 ? "#FEE2E2" : "#FEF3C7", color: flags >= 3 ? "#B91C1C" : "#B45309" }}>{flags} flagged</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{b.coverage.to_build.length ? b.coverage.to_build.map(f => f.label).join(", ") : "—"}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="grid sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Revenue split</p>
                            <p className="text-slate-600">{money(b.revenue.flow)} flows &middot; {money(b.revenue.campaign)} campaigns</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Deliverability</p>
                            {b.deliverability.flags.length ? (
                              <ul className="space-y-1">
                                {b.deliverability.flags.map((f, i) => (
                                  <li key={i} className="text-rose-600">{METRIC_LABEL[f.metric] || f.metric} {pct(f.value)} (over {pct(f.threshold)})</li>
                                ))}
                              </ul>
                            ) : <p className="text-slate-400">{b.deliverability.emails_sent < 100 ? "Under 100 sends this month, not assessed." : "Nothing over threshold."}</p>}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Flow coverage</p>
                            {b.coverage.missing.length > 0 && <p className="text-slate-600">Missing: {b.coverage.missing.join(", ")}</p>}
                            {b.coverage.live_but_silent.length > 0 && <p className="text-amber-600">Live but silent this month: {b.coverage.live_but_silent.join(", ")}</p>}
                            {!b.coverage.missing.length && !b.coverage.live_but_silent.length && <p className="text-slate-400">Core flows present and sending.</p>}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Campaigns</p>
                            <p className="text-slate-600">
                              {b.campaigns.days_since_last_send === null ? "No sends on record." : `Last sent ${b.campaigns.days_since_last_send} days ago.`}
                              {b.campaigns.days_since_last_send !== null && b.campaigns.days_since_last_send > 30 && <span className="text-amber-600"> Over 30 days.</span>}
                              {b.campaigns.zero_revenue_streak && <span className="text-rose-600"> Last 3 sends show zero revenue.</span>}
                            </p>
                          </div>
                          {b.coverage.to_build.length > 0 && (
                            <div className="sm:col-span-2">
                              <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Flows to build next</p>
                              <div className="flex flex-wrap gap-1.5">
                                {b.coverage.to_build.map(f => (
                                  <span key={f.key} className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-white border border-gray-200 text-gray-600">{f.label} &middot; {STATUS_LABEL[f.status] || f.status}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
