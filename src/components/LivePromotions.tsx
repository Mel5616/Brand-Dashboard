"use client";

import { useEffect, useState } from "react";

// One place to see what's live and turn it off — lives under the Campaigns
// tab. Three sources, each with a real toggle:
//   1. Site promotions — a curated list Mel builds up as each new site goes
//      live (e.g. Frida's "Free foam" GWP, "Spend and save"), NOT every
//      synced Shopify code (mostly legacy/irrelevant noise). If a promotion
//      has a Shopify code attached, toggling calls Shopify for real
//      (activate/deactivate); otherwise it's just this list's own flag —
//      some mechanics (an automatic spend-and-save tier, a codeless GWP)
//      have no single code to switch.
//   2. Campaigns marked Live on the Campaign Calendar — flips status.
//   3. Own-site deals (the existing cross-brand deal log) — a pause flag.
type SitePromo = { id: string; brand: string; brand_id: number | null; title: string; mechanic: string | null; shopify_code: string | null; active: boolean };
type SiteDeal = { id: number; brand: string; title: string; period_start: string; period_end: string; paused: boolean };
type CampaignRow = { id: string; campaign: string; brand: string; status: string; key_date: string; end_date?: string };
type Brand = { id: number; name: string };

const today = () => new Date().toISOString().slice(0, 10);
const inWindow = (start: string, end: string | null | undefined) => { const t = today(); return start <= t && (!end || end >= t); };
const inp = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white";

export function LivePromotions({ canEdit = false, brands = [] }: { canEdit?: boolean; brands?: Brand[] }) {
  const [promos, setPromos] = useState<SitePromo[]>([]);
  const [deals, setDeals] = useState<SiteDeal[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const empty = { brand: "", title: "", mechanic: "", shopify_code: "" };
  const [f, setF] = useState(empty);

  async function load() {
    const [p, d, cp] = await Promise.all([
      fetch("/api/site-promotions").then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/site-deals").then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/campaigns").then(r => r.json()).catch(() => ({ ok: false })),
    ]);
    if (p.ok) { setPromos(p.items || []); setNeedsSetup(!!p.needsSetup); }
    setDeals(d.items || []);
    setCampaigns(cp.items || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addPromo() {
    if (!f.brand || !f.title.trim()) { setError("Brand and title required"); return; }
    setError(null);
    const brandId = brands.find(b => b.name === f.brand)?.id;
    const res = await fetch("/api/site-promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, brand_id: brandId }) }).then(r => r.json());
    if (!res.ok) { setError(res.error || "Couldn't save"); return; }
    setF(empty); setShowForm(false); load();
  }

  async function togglePromo(p: SitePromo) {
    setBusy(`promo:${p.id}`); setError(null);
    const res = await fetch("/api/site-promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: !p.active }) }).then(r => r.json());
    setBusy(null);
    if (!res.ok) { setError(res.error || "Couldn't reach Shopify"); return; }
    setPromos(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x));
  }

  async function removePromo(p: SitePromo) {
    if (!confirm(`Remove "${p.title}" from tracking? This doesn't touch Shopify.`)) return;
    await fetch(`/api/site-promotions?id=${p.id}`, { method: "DELETE" });
    setPromos(prev => prev.filter(x => x.id !== p.id));
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
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Live promotions isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_site_promotions.sql</code> in Supabase.
      </div>
    );
  }

  const activePromos = promos.filter(p => p.active);
  const offPromos = promos.filter(p => !p.active);
  const liveDeals = deals.filter(d => inWindow(d.period_start, d.period_end) && !d.paused);
  const pausedDeals = deals.filter(d => inWindow(d.period_start, d.period_end) && d.paused);
  const liveCampaigns = campaigns.filter(c => c.status === "Live");
  const pausedCampaigns = campaigns.filter(c => c.status === "Paused" && inWindow(c.key_date, c.end_date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Everything currently live on your sites and campaigns, in one place — add a promotion as each new site goes live.</p>
        {canEdit && (
          <button onClick={() => setShowForm(s => !s)} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700">
            {showForm ? "Cancel" : "+ Add promotion"}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
          <div className="grid sm:grid-cols-4 gap-2">
            <select value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} className={inp}>
              <option value="">Brand *</option>
              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Title — e.g. Free foam *" className={inp} />
            <input value={f.mechanic} onChange={e => setF({ ...f, mechanic: e.target.value })} placeholder="Mechanic — e.g. GWP over $80" className={inp} />
            <input value={f.shopify_code} onChange={e => setF({ ...f, shopify_code: e.target.value })} placeholder="Shopify code (optional)" className={inp} />
          </div>
          <p className="text-xs text-gray-400">Leave the code blank for mechanics with no single code — an automatic spend-and-save tier, a codeless GWP. You can still toggle it here, it just won&apos;t touch Shopify.</p>
          <button onClick={addPromo} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-1.5 hover:bg-emerald-700">Save</button>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm px-4 py-3 space-y-4">
        {(activePromos.length > 0 || offPromos.length > 0) && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 mb-1.5">🌐 Site promotions{activePromos.length ? ` · ${activePromos.length} live` : ""}</p>
            <div className="divide-y divide-gray-50">
              {activePromos.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-[13px] font-semibold text-slate-700">{p.title}</span>
                  <span className="text-[11px] text-gray-400">{p.brand}{p.mechanic ? ` · ${p.mechanic}` : ""}{p.shopify_code ? ` · ${p.shopify_code}` : ""}</span>
                  {canEdit && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <button onClick={() => togglePromo(p)} disabled={busy === `promo:${p.id}`} className="text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-full px-3 py-1 disabled:opacity-50">
                        {busy === `promo:${p.id}` ? "…" : "Turn off"}
                      </button>
                      <button onClick={() => removePromo(p)} className="text-gray-300 hover:text-rose-500 text-[13px] leading-none px-1" title="Remove from tracking">✕</button>
                    </span>
                  )}
                </div>
              ))}
              {offPromos.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1.5 opacity-60">
                  <span className="text-[13px] font-semibold text-slate-500 line-through">{p.title}</span>
                  <span className="text-[11px] text-gray-400">{p.brand} · turned off</span>
                  {canEdit && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <button onClick={() => togglePromo(p)} disabled={busy === `promo:${p.id}`} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full px-3 py-1 disabled:opacity-50">
                        {busy === `promo:${p.id}` ? "…" : "Turn back on"}
                      </button>
                      <button onClick={() => removePromo(p)} className="text-gray-300 hover:text-rose-500 text-[13px] leading-none px-1" title="Remove from tracking">✕</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {promos.length === 0 && <p className="text-[12px] text-gray-300 py-1">No site promotions tracked yet — add one as you launch each new site.</p>}

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
    </div>
  );
}
