"use client";

import { useEffect, useState } from "react";

// One place to see everything currently live and turn it off — the three
// things Mel actually controls (unlike retailer promo windows, which stay in
// the timeline below as reference only since we don't run those):
//   1. Shopify discount codes — a REAL on/off, calls Shopify directly.
//   2. Campaigns marked Live on the Campaign Calendar — flips status.
//   3. Own-site deals — a dashboard-only pause flag (no Shopify state to toggle).
type DiscountCode = { brand_id: number; code: string; value_type: string | null; value: number | null; ends_at: string | null; status: string };
type SiteDeal = { id: number; brand: string; title: string; period_start: string; period_end: string; paused: boolean };
type CampaignRow = { id: string; campaign: string; brand: string; status: string; key_date: string; end_date?: string };
type Brand = { id: number; name: string };

const today = () => new Date().toISOString().slice(0, 10);
const money = (v: number | null, type: string | null) => v == null ? "" : type === "percentage" ? `${v}%` : `$${v}`;
const inWindow = (start: string, end: string | null | undefined) => { const t = today(); return start <= t && (!end || end >= t); };

export function LivePromotions({ canEdit = false, brands = [] }: { canEdit?: boolean; brands?: Brand[] }) {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [deals, setDeals] = useState<SiteDeal[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const brandName = (id: number) => brands.find(b => b.id === id)?.name || `Brand ${id}`;

  async function load() {
    const [c, d, cp] = await Promise.all([
      fetch("/api/discount-codes").then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/site-deals").then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/campaigns").then(r => r.json()).catch(() => ({ ok: false })),
    ]);
    setCodes(c.codes || []);
    setDeals(d.items || []);
    setCampaigns(cp.items || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggleCode(c: DiscountCode) {
    const action = c.status === "deactivated" ? "activate" : "deactivate";
    if (action === "deactivate" && !confirm(`Turn off ${c.code}? This deactivates it in Shopify immediately.`)) return;
    setBusy(`code:${c.brand_id}:${c.code}`); setError(null);
    const res = await fetch("/api/discount-codes/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: c.brand_id, code: c.code, action }) }).then(r => r.json());
    setBusy(null);
    if (!res.ok) { setError(res.error || "Couldn't reach Shopify"); return; }
    setCodes(prev => prev.map(x => x === c ? { ...x, status: res.status } : x));
  }

  async function toggleDeal(d: SiteDeal) {
    setBusy(`deal:${d.id}`);
    setDeals(prev => prev.map(x => x.id === d.id ? { ...x, paused: !x.paused } : x));
    await fetch("/api/site-deals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, paused: !d.paused }) });
    setBusy(null);
  }

  async function toggleCampaign(c: CampaignRow) {
    const status = c.status === "Live" ? "Paused" : "Live";
    setBusy(`camp:${c.id}`);
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status } : x));
    await fetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, status }) });
    setBusy(null);
  }

  if (loading) return <div className="text-sm text-slate-400 py-6 text-center">Loading live promotions…</div>;

  const liveCodes = codes.filter(c => c.status === "active");
  const offCodes = codes.filter(c => c.status === "deactivated" && (!c.ends_at || c.ends_at >= today()));
  const liveDeals = deals.filter(d => inWindow(d.period_start, d.period_end) && !d.paused);
  const pausedDeals = deals.filter(d => inWindow(d.period_start, d.period_end) && d.paused);
  const liveCampaigns = campaigns.filter(c => c.status === "Live");
  const pausedCampaigns = campaigns.filter(c => c.status === "Paused" && inWindow(c.key_date, c.end_date));

  const nothing = !liveCodes.length && !offCodes.length && !liveDeals.length && !pausedDeals.length && !liveCampaigns.length && !pausedCampaigns.length;

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm px-4 py-3 space-y-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 pb-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-slate-700">Live promotions — one place to turn things on and off</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
      {nothing && <p className="text-[12px] text-gray-300 py-2">Nothing live right now.</p>}

      {(liveCodes.length > 0 || offCodes.length > 0) && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 mb-1.5">🎟️ Shopify discount codes{liveCodes.length ? ` · ${liveCodes.length} live` : ""}</p>
          <div className="divide-y divide-gray-50">
            {liveCodes.map(c => (
              <div key={`${c.brand_id}-${c.code}`} className="flex items-center gap-2 py-1.5">
                <span className="text-[13px] font-semibold text-slate-700">{c.code}</span>
                <span className="text-[11px] text-gray-400">{brandName(c.brand_id)}{c.value != null ? ` · ${money(c.value, c.value_type)}` : ""}{c.ends_at ? ` · ends ${c.ends_at}` : ""}</span>
                {canEdit && (
                  <button onClick={() => toggleCode(c)} disabled={busy === `code:${c.brand_id}:${c.code}`} className="ml-auto text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-full px-3 py-1 disabled:opacity-50">
                    {busy === `code:${c.brand_id}:${c.code}` ? "…" : "Turn off"}
                  </button>
                )}
              </div>
            ))}
            {offCodes.map(c => (
              <div key={`off-${c.brand_id}-${c.code}`} className="flex items-center gap-2 py-1.5 opacity-60">
                <span className="text-[13px] font-semibold text-slate-500 line-through">{c.code}</span>
                <span className="text-[11px] text-gray-400">{brandName(c.brand_id)} · turned off</span>
                {canEdit && (
                  <button onClick={() => toggleCode(c)} disabled={busy === `code:${c.brand_id}:${c.code}`} className="ml-auto text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full px-3 py-1 disabled:opacity-50">
                    {busy === `code:${c.brand_id}:${c.code}` ? "…" : "Turn back on"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(liveCampaigns.length > 0 || pausedCampaigns.length > 0) && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600 mb-1.5">📣 Campaigns{liveCampaigns.length ? ` · ${liveCampaigns.length} live` : ""}</p>
          <div className="divide-y divide-gray-50">
            {liveCampaigns.map(c => (
              <div key={c.id} className="flex items-center gap-2 py-1.5">
                <span className="text-[13px] font-semibold text-slate-700">{c.campaign}</span>
                <span className="text-[11px] text-gray-400">{c.brand}</span>
                {canEdit && (
                  <button onClick={() => toggleCampaign(c)} disabled={busy === `camp:${c.id}`} className="ml-auto text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-full px-3 py-1 disabled:opacity-50">
                    {busy === `camp:${c.id}` ? "…" : "Pause"}
                  </button>
                )}
              </div>
            ))}
            {pausedCampaigns.map(c => (
              <div key={c.id} className="flex items-center gap-2 py-1.5 opacity-60">
                <span className="text-[13px] font-semibold text-slate-500 line-through">{c.campaign}</span>
                <span className="text-[11px] text-gray-400">{c.brand} · paused</span>
                {canEdit && (
                  <button onClick={() => toggleCampaign(c)} disabled={busy === `camp:${c.id}`} className="ml-auto text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full px-3 py-1 disabled:opacity-50">
                    {busy === `camp:${c.id}` ? "…" : "Resume"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(liveDeals.length > 0 || pausedDeals.length > 0) && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-600 mb-1.5">🛒 Own-site deals{liveDeals.length ? ` · ${liveDeals.length} live` : ""}</p>
          <div className="divide-y divide-gray-50">
            {liveDeals.map(d => (
              <div key={d.id} className="flex items-center gap-2 py-1.5">
                <span className="text-[13px] font-semibold text-slate-700">{d.title}</span>
                <span className="text-[11px] text-gray-400">{d.brand}</span>
                {canEdit && (
                  <button onClick={() => toggleDeal(d)} disabled={busy === `deal:${d.id}`} className="ml-auto text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-full px-3 py-1 disabled:opacity-50">
                    {busy === `deal:${d.id}` ? "…" : "Turn off"}
                  </button>
                )}
              </div>
            ))}
            {pausedDeals.map(d => (
              <div key={d.id} className="flex items-center gap-2 py-1.5 opacity-60">
                <span className="text-[13px] font-semibold text-slate-500 line-through">{d.title}</span>
                <span className="text-[11px] text-gray-400">{d.brand} · turned off</span>
                {canEdit && (
                  <button onClick={() => toggleDeal(d)} disabled={busy === `deal:${d.id}`} className="ml-auto text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full px-3 py-1 disabled:opacity-50">
                    {busy === `deal:${d.id}` ? "…" : "Turn back on"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
