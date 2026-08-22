"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildActivationReport } from "@/lib/activationReport";
import type { Tradeshow } from "@/lib/db";

// Per-brand report for external partners (Global) — competitor landscape,
// the "spine" (phases, trade-date markers, campaign bars), a live budget
// burn (real marketing_budgets/budget_topups/marketing_actuals, not a typed
// total), pillar allocation, campaign cards, decisions/asks, and top live
// Google Ads copy. The preview below is rendered from the exact same HTML
// builder used for the shared link — what Mel sees is what Global gets.

type Brand = { id: number; name: string; live?: boolean; color?: string; init?: string };
type Competitor = { id: number; brand_id: number; name: string; notes: string | null; source_links: string[]; image_url: string | null; updated_at: string; updated_by: string | null };
type Campaign = { id: string; campaign: string; brand: string; channel: string; status: string; key_date: string; end_date?: string | null; note: string; pillar?: string | null; confirmed?: boolean };
type Creative = { id: number; brand_id: number; campaign_name: string | null; ad_group: string | null; headlines: string[]; descriptions: string[]; clicks: number; impressions: number };
type AdImage = { id: number; brand_id: number; campaign_name: string | null; asset_group: string | null; image_url: string };
type ShareLink = { id: number; token: string; label: string | null; created_at: string; open_count: number; expires_at: string | null };
type Phase = { id: number; brand_id: number; key: string; label: string; sub: string | null; start_date: string; end_date: string; color: string; sort_order: number };
type Pillar = { id: number; brand_id: number; key: string; label: string; color: string; share_pct: number; note: string | null; sort_order: number };
type TradeDate = { id: number; brand_id: number; date: string; end_date: string | null; label: string; kind: "trade" | "peak"; confirmed: boolean };
type Decision = { id: number; brand_id: number; due_label: string | null; question: string; recommendation: string | null; sort_order: number };
type Ask = { id: number; brand_id: number; audience: string; ask: string; why: string | null; sort_order: number };
type BudgetData = { months: { month_key: string; planned: number; actual: number }[]; total: number };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const fmtD = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const PILLAR_KEYS = ["acquire", "advocacy", "reach", "convert", "reserve"];

function showStatus(ts: Tradeshow): "live" | "upcoming" | "past" {
  const now = new Date();
  const start = new Date(ts.date_start + "T00:00:00");
  const end = new Date(ts.date_end + "T23:59:59");
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "past";
}

export function Activations({ brands, tradeshows, tradeshowBrands, admin = false }: {
  brands: Brand[]; tradeshows: Tradeshow[]; tradeshowBrands: { tradeshow_id: string; brand_id: number }[]; admin?: boolean;
}) {
  const live = brands.filter(b => b.live !== false);
  const defaultBrand = live.find(b => b.name === "Frida")?.id ?? live[0]?.id ?? brands[0]?.id;
  const [brandId, setBrandId] = useState<number | undefined>(defaultBrand);
  const brand = brands.find(b => b.id === brandId);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const sixMonthsOut = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toISOString().slice(0, 10); }, []);

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [compNeedsSetup, setCompNeedsSetup] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [adImages, setAdImages] = useState<AdImage[]>([]);
  const [creativesNeedsSetup, setCreativesNeedsSetup] = useState(false);
  const [shares, setShares] = useState<ShareLink[]>([]);

  const [phases, setPhases] = useState<Phase[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [tradeDates, setTradeDates] = useState<TradeDate[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [planNeedsSetup, setPlanNeedsSetup] = useState(false);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.items ?? [])).catch(() => {}); }, []);

  function reload() {
    if (!brandId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/brand-competitors?brand_id=${brandId}`).then(r => r.json()),
      fetch(`/api/google-ads-creatives?brand_id=${brandId}`).then(r => r.json()),
      admin ? fetch(`/api/activation-share?brand_id=${brandId}`).then(r => r.json()) : Promise.resolve({ items: [] }),
      fetch(`/api/activation-plan?brand_id=${brandId}`).then(r => r.json()),
    ]).then(([c, ad, sh, plan]) => {
      setCompetitors(c.competitors ?? []); setCompNeedsSetup(!!c.needsSetup);
      setCreatives(ad.creatives ?? []); setAdImages(ad.images ?? []); setCreativesNeedsSetup(!!ad.needsSetup);
      setShares(sh.items ?? []);
      if (plan.needsSetup) { setPlanNeedsSetup(true); setLoading(false); return; }
      setPhases(plan.phases ?? []); setPillars(plan.pillars ?? []); setTradeDates(plan.tradeDates ?? []);
      setDecisions(plan.decisions ?? []); setAsks(plan.asks ?? []);
      const ph = plan.phases ?? [];
      const winStart = ph.length ? ph.reduce((m: string, p: Phase) => p.start_date < m ? p.start_date : m, ph[0].start_date) : today;
      const winEnd = ph.length ? ph.reduce((m: string, p: Phase) => p.end_date > m ? p.end_date : m, ph[0].end_date) : sixMonthsOut;
      if (admin) {
        fetch(`/api/activation-plan?brand_id=${brandId}&from=${winStart}&to=${winEnd}`).then(r => r.json()).then(d2 => setBudget(d2.budget ?? null)).finally(() => setLoading(false));
      } else setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(reload, [brandId, admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const brandShows = useMemo(() => {
    if (!brandId) return [];
    const ids = new Set(tradeshowBrands.filter(tb => tb.brand_id === brandId).map(tb => tb.tradeshow_id));
    return tradeshows.filter(t => ids.has(t.id)).sort((a, b) => a.date_start.localeCompare(b.date_start));
  }, [tradeshowBrands, tradeshows, brandId]);

  const windowRange = useMemo(() => {
    if (phases.length) return { start: phases.reduce((m, p) => p.start_date < m ? p.start_date : m, phases[0].start_date), end: phases.reduce((m, p) => p.end_date > m ? p.end_date : m, phases[0].end_date) };
    return { start: today, end: sixMonthsOut };
  }, [phases, today, sixMonthsOut]);

  // Only shows that actually fall within this report's window — otherwise
  // every tradeshow the brand has ever done piles onto the spine's edges.
  const windowShows = useMemo(() => brandShows.filter(t => t.date_start <= windowRange.end && t.date_end >= windowRange.start), [brandShows, windowRange]);

  const brandCampaigns = useMemo(() => {
    if (!brand) return [];
    return campaigns
      .filter(c => (c.brand || "").toLowerCase() === brand.name.toLowerCase() && c.key_date && c.key_date <= windowRange.end && (c.end_date || c.key_date) >= windowRange.start)
      .sort((a, b) => a.key_date.localeCompare(b.key_date));
  }, [campaigns, brand, windowRange]);

  const reportHtml = useMemo(() => {
    if (!brand) return "";
    return buildActivationReport({
      brand_name: brand.name, brand_color: brand.color, brand_init: brand.init, generated_at: new Date().toISOString(),
      window: windowRange,
      competitors: competitors.map(c => ({ name: c.name, notes: c.notes, source_links: c.source_links, image_url: c.image_url })),
      tradeshows: windowShows.map(t => ({ name: t.name, date_start: t.date_start, date_end: t.date_end, state: t.state, location: t.location, status: showStatus(t) })),
      phases: phases.map(p => ({ key: p.key, label: p.label, sub: p.sub, start_date: p.start_date, end_date: p.end_date, color: p.color })),
      pillars: pillars.map(p => ({ key: p.key, label: p.label, color: p.color, share_pct: p.share_pct, note: p.note })),
      tradeDates: tradeDates.map(t => ({ date: t.date, end_date: t.end_date, label: t.label, kind: t.kind, confirmed: t.confirmed })),
      campaigns: brandCampaigns.map(c => ({ id: c.id, campaign: c.campaign, channel: c.channel, status: c.status, key_date: c.key_date, end_date: c.end_date ?? null, pillar: c.pillar ?? null, confirmed: c.confirmed !== false, note: c.note })),
      budget,
      decisions: decisions.map(d => ({ due_label: d.due_label, question: d.question, recommendation: d.recommendation })),
      asks: asks.map(a => ({ audience: a.audience, ask: a.ask, why: a.why })),
      adCreatives: creatives.map(c => ({ ad_group: c.ad_group, campaign_name: c.campaign_name, headlines: c.headlines, descriptions: c.descriptions, clicks: c.clicks })),
      adImages: adImages.map(i => ({ campaign_name: i.campaign_name, asset_group: i.asset_group, image_url: i.image_url })),
    });
  }, [brand, windowRange, competitors, windowShows, phases, pillars, tradeDates, brandCampaigns, budget, decisions, asks, creatives, adImages]);

  // Live preview iframe, auto-sized to its content (same pattern as Brand Snapshot).
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameH, setFrameH] = useState(1400);
  function fitFrame() {
    const d = frameRef.current?.contentDocument;
    if (!d) return;
    const h = Math.max(d.body?.scrollHeight || 0, d.documentElement?.scrollHeight || 0);
    if (h > 0) setFrameH(h + 4);
  }

  // Competitor add/edit — links entered one per line, split to an array on save.
  const linesToLinks = (s: string) => s.split("\n").map(l => l.trim()).filter(Boolean);
  const [newComp, setNewComp] = useState({ name: "", notes: "", links: "" });
  const [editingComp, setEditingComp] = useState<number | null>(null);
  const [editCompDraft, setEditCompDraft] = useState({ name: "", notes: "", links: "" });
  async function addCompetitor() {
    if (!brandId || !newComp.name.trim()) return;
    const body = { brand_id: brandId, name: newComp.name, notes: newComp.notes, source_links: linesToLinks(newComp.links) };
    const d = await fetch("/api/brand-competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    if (d.ok) { setCompetitors(prev => [...prev, d.competitor].sort((a, b) => a.name.localeCompare(b.name))); setNewComp({ name: "", notes: "", links: "" }); }
    else setMsg(d.error || "Couldn't add competitor.");
  }
  async function saveCompetitor(id: number) {
    const body = { id, name: editCompDraft.name, notes: editCompDraft.notes, source_links: linesToLinks(editCompDraft.links) };
    const d = await fetch("/api/brand-competitors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    if (d.ok) { setCompetitors(prev => prev.map(c => c.id === id ? { ...c, name: editCompDraft.name, notes: editCompDraft.notes, source_links: linesToLinks(editCompDraft.links) } : c)); setEditingComp(null); }
    else setMsg(d.error || "Couldn't save.");
  }
  async function removeCompetitor(id: number) {
    if (!confirm("Remove this competitor?")) return;
    const d = await fetch(`/api/brand-competitors?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) setCompetitors(prev => prev.filter(c => c.id !== id));
  }
  const [uploadingComp, setUploadingComp] = useState<number | null>(null);
  async function uploadCompetitorImage(id: number, file: File) {
    setUploadingComp(id);
    const fd = new FormData(); fd.append("file", file); fd.append("id", String(id));
    const d = await fetch("/api/brand-competitors/image", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setUploadingComp(null);
    if (d?.ok) setCompetitors(prev => prev.map(c => c.id === id ? { ...c, image_url: d.url } : c));
    else setMsg(d?.error || "Couldn't upload the photo.");
  }

  // Generic activation-plan CRUD (phases/pillars/tradeDates/decisions/asks)
  async function planAdd(kind: string, row: any, onOk: (item: any) => void) {
    const d = await fetch("/api/activation-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, brand_id: brandId, ...row }) }).then(r => r.json());
    if (d.ok) onOk(d.item); else setMsg(d.error || "Couldn't add.");
  }
  async function planSave(kind: string, id: number, fields: any) {
    await fetch("/api/activation-plan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, ...fields }) }).then(r => r.json());
  }
  async function planRemove(kind: string, id: number, onOk: () => void) {
    const d = await fetch(`/api/activation-plan?kind=${kind}&id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) onOk();
  }

  // Trade date quick-add
  const [newTd, setNewTd] = useState({ date: "", label: "", kind: "trade", confirmed: true });
  // Decision / ask quick-add
  const [newDec, setNewDec] = useState({ due_label: "", question: "", recommendation: "" });
  const [newAsk, setNewAsk] = useState({ audience: "", ask: "", why: "" });

  async function updateCampaignPlan(id: string, fields: Partial<Campaign>) {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...fields } : c));
    await fetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
  }

  // Share to Global — freezes the exact same HTML shown in the preview.
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState("");
  async function shareReport() {
    if (!brand || !reportHtml) return;
    setSharing(true);
    const d = await fetch("/api/activation-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: reportHtml, brand_id: brand.id, brand: brand.name, label: `Activations — ${brand.name}` }) }).then(r => r.json());
    setSharing(false);
    if (d.ok) {
      const url = `${window.location.origin}/activation/${d.token}`;
      navigator.clipboard?.writeText(url);
      setCopied(url); setMsg("Link copied — ready to send to Global.");
      setShares(prev => [{ id: Date.now(), token: d.token, label: `Activations — ${brand.name}`, created_at: new Date().toISOString(), open_count: 0, expires_at: null }, ...prev]);
    } else setMsg(d.error || "Couldn't create the share link.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select value={brandId ?? ""} onChange={e => setBrandId(Number(e.target.value))} className={inp + " bg-white font-semibold"}>
            {live.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="text-xs text-gray-400">{fmtD(windowRange.start)} – {fmtD(windowRange.end)}</span>
        </div>
        {admin && (
          <button onClick={shareReport} disabled={sharing || !brand} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg px-4 py-2">
            {sharing ? "Preparing…" : "🔗 Share to Global"}
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-emerald-600">{msg}</p>}
      {copied && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-xs text-emerald-700 flex items-center gap-2">
          <span className="truncate flex-1">{copied}</span>
          <button onClick={() => { navigator.clipboard?.writeText(copied); }} className="font-semibold hover:underline shrink-0">Copy again</button>
        </div>
      )}

      {loading ? <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div> : planNeedsSetup ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_activation_spine.sql</code> to enable the spine, budget and decisions/asks.</div>
      ) : (
        <>
          {/* Live preview — exactly what gets shared */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <iframe ref={frameRef} srcDoc={reportHtml} onLoad={fitFrame} title="Activations preview" style={{ width: "100%", height: frameH, border: 0, display: "block" }} />
          </div>

          {admin && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Edit plan data</p>

              {/* Competitors */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" open>
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Competitors</summary>
                {compNeedsSetup ? <p className="text-xs text-amber-600 mt-2">Run the SQL, then reload.</p> : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                    {competitors.map(c => (
                      <div key={c.id} className="border border-gray-100 rounded-xl p-3.5">
                        {editingComp === c.id ? (
                          <div className="space-y-2">
                            <input value={editCompDraft.name} onChange={e => setEditCompDraft(p => ({ ...p, name: e.target.value }))} className={inp + " w-full"} />
                            <textarea value={editCompDraft.notes} onChange={e => setEditCompDraft(p => ({ ...p, notes: e.target.value }))} rows={4} placeholder="One point per line" className={inp + " w-full"} />
                            <textarea value={editCompDraft.links} onChange={e => setEditCompDraft(p => ({ ...p, links: e.target.value }))} rows={2} placeholder="Source article links, one per line" className={inp + " w-full"} />
                            <div className="flex gap-2">
                              <button onClick={() => saveCompetitor(c.id)} className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5">Save</button>
                              <button onClick={() => setEditingComp(null)} className="text-xs text-slate-500 px-2">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <label className="relative block -m-3.5 mb-2.5 cursor-pointer group/img">
                              {c.image_url ? (
                                <img src={c.image_url} alt={c.name} className="w-full h-48 object-cover rounded-t-xl" />
                              ) : (
                                <div className="w-full h-16 rounded-t-xl bg-gray-50 border-b border-dashed border-gray-200 flex items-center justify-center text-[11px] text-gray-400 group-hover/img:bg-gray-100">
                                  {uploadingComp === c.id ? "Uploading…" : "+ Add photo"}
                                </div>
                              )}
                              {c.image_url && (
                                <span className="absolute inset-0 rounded-t-xl bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white text-[11px] font-semibold transition-opacity">
                                  {uploadingComp === c.id ? "Uploading…" : "Change photo"}
                                </span>
                              )}
                              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadCompetitorImage(c.id, f); e.currentTarget.value = ""; }} />
                            </label>
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                              <div className="flex gap-2 shrink-0">
                                <button onClick={() => { setEditingComp(c.id); setEditCompDraft({ name: c.name, notes: c.notes ?? "", links: (c.source_links ?? []).join("\n") }); }} className="text-[11px] text-amber-600 hover:underline">Edit</button>
                                <button onClick={() => removeCompetitor(c.id)} className="text-[11px] text-rose-500 hover:underline">Remove</button>
                              </div>
                            </div>
                            <ul className="mt-2 space-y-1 text-[12.5px] text-slate-600 list-disc pl-4">
                              {(c.notes ?? "").split("\n").map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                            {(c.source_links ?? []).length > 0 && (
                              <p className="mt-2 pt-2 border-t border-gray-50 text-[11px] text-sky-600 space-x-2">
                                {(c.source_links ?? []).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="hover:underline">↗ {(() => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } })()}</a>)}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    <div className="border border-dashed border-gray-200 rounded-xl p-3.5 space-y-2">
                      <input value={newComp.name} onChange={e => setNewComp(p => ({ ...p, name: e.target.value }))} placeholder="Competitor name" className={inp + " w-full"} />
                      <textarea value={newComp.notes} onChange={e => setNewComp(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="One point per line" className={inp + " w-full"} />
                      <textarea value={newComp.links} onChange={e => setNewComp(p => ({ ...p, links: e.target.value }))} rows={2} placeholder="Source article links, one per line" className={inp + " w-full"} />
                      <button onClick={addCompetitor} disabled={!newComp.name.trim()} className="text-xs font-semibold text-emerald-600 disabled:opacity-40 hover:underline">+ Add competitor</button>
                    </div>
                  </div>
                )}
              </details>

              {/* Phases */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Phases ({phases.length})</summary>
                <div className="mt-3 space-y-2">
                  {phases.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: p.color }} />
                      <span className="font-semibold text-slate-700 w-28 truncate">{p.label}</span>
                      <span className="text-gray-400 flex-1">{fmtD(p.start_date)} – {fmtD(p.end_date)}</span>
                      <button onClick={() => planRemove("phase", p.id, () => setPhases(prev => prev.filter(x => x.id !== p.id)))} className="text-[11px] text-rose-500 hover:underline">Remove</button>
                    </div>
                  ))}
                  <PhaseAdd brandId={brandId} onAdd={item => setPhases(prev => [...prev, item].sort((a, b) => a.start_date.localeCompare(b.start_date)))} />
                </div>
              </details>

              {/* Pillars */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Pillars ({pillars.length}) — {pillars.reduce((s, p) => s + Number(p.share_pct), 0)}% allocated</summary>
                <div className="mt-3 space-y-2">
                  {pillars.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: p.color }} />
                      <span className="font-semibold text-slate-700 w-24 truncate">{p.label}</span>
                      <input type="number" defaultValue={p.share_pct} onBlur={e => { const v = Number(e.target.value); setPillars(prev => prev.map(x => x.id === p.id ? { ...x, share_pct: v } : x)); planSave("pillar", p.id, { share_pct: v }); }} className={inp + " w-20"} />
                      <span className="text-gray-400 text-xs flex-1 truncate">{p.note}</span>
                      <button onClick={() => planRemove("pillar", p.id, () => setPillars(prev => prev.filter(x => x.id !== p.id)))} className="text-[11px] text-rose-500 hover:underline">Remove</button>
                    </div>
                  ))}
                  <PillarAdd brandId={brandId} onAdd={item => setPillars(prev => [...prev, item])} />
                </div>
              </details>

              {/* Trade dates */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Retail moments ({tradeDates.length})</summary>
                <div className="mt-3 space-y-2">
                  {tradeDates.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-gray-500 shrink-0">{fmtD(t.date)}</span>
                      <span className="font-semibold text-slate-700 flex-1 truncate">{t.label}</span>
                      {!t.confirmed && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">TBC</span>}
                      <button onClick={() => planRemove("trade_date", t.id, () => setTradeDates(prev => prev.filter(x => x.id !== t.id)))} className="text-[11px] text-rose-500 hover:underline">Remove</button>
                    </div>
                  ))}
                  <div className="flex gap-2 flex-wrap items-center pt-1">
                    <input type="date" value={newTd.date} onChange={e => setNewTd(p => ({ ...p, date: e.target.value }))} className={inp} />
                    <input value={newTd.label} onChange={e => setNewTd(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Black Friday" className={inp + " flex-1 min-w-[160px]"} />
                    <select value={newTd.kind} onChange={e => setNewTd(p => ({ ...p, kind: e.target.value }))} className={inp}>
                      <option value="trade">Trade</option><option value="peak">Peak</option>
                    </select>
                    <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={newTd.confirmed} onChange={e => setNewTd(p => ({ ...p, confirmed: e.target.checked }))} />Confirmed</label>
                    <button onClick={() => { if (!newTd.date || !newTd.label) return; planAdd("trade_date", newTd, item => { setTradeDates(prev => [...prev, item]); setNewTd({ date: "", label: "", kind: "trade", confirmed: true }); }); }} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add</button>
                  </div>
                </div>
              </details>

              {/* Campaign pillar/confirmed */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Campaigns in window ({brandCampaigns.length}) — assign pillar</summary>
                <div className="mt-3 space-y-2">
                  {brandCampaigns.length === 0 && <p className="text-xs text-gray-400">Nothing planned yet — add campaigns in Plan &gt; Campaigns.</p>}
                  {brandCampaigns.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-gray-500 shrink-0">{fmtD(c.key_date)}</span>
                      <span className="font-semibold text-slate-700 flex-1 truncate">{c.campaign}</span>
                      <select value={c.pillar ?? ""} onChange={e => updateCampaignPlan(c.id, { pillar: e.target.value || null })} className={inp}>
                        <option value="">No pillar</option>
                        {PILLAR_KEYS.map(k => <option key={k} value={k}>{pillars.find(p => p.key === k)?.label ?? k}</option>)}
                      </select>
                      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={c.confirmed !== false} onChange={e => updateCampaignPlan(c.id, { confirmed: e.target.checked })} />Confirmed</label>
                    </div>
                  ))}
                </div>
              </details>

              {/* Decisions */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Open decisions ({decisions.length})</summary>
                <div className="mt-3 space-y-2">
                  {decisions.map(d => (
                    <div key={d.id} className="flex items-start gap-2 text-sm border-b border-gray-50 pb-2">
                      <span className="w-16 text-gray-500 shrink-0 pt-0.5">{d.due_label || "TBC"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-700">{d.question}</p>
                        {d.recommendation && <p className="text-xs text-gray-400 mt-0.5">{d.recommendation}</p>}
                      </div>
                      <button onClick={() => planRemove("decision", d.id, () => setDecisions(prev => prev.filter(x => x.id !== d.id)))} className="text-[11px] text-rose-500 hover:underline shrink-0">Remove</button>
                    </div>
                  ))}
                  <div className="grid sm:grid-cols-2 gap-2 pt-1">
                    <input value={newDec.due_label} onChange={e => setNewDec(p => ({ ...p, due_label: e.target.value }))} placeholder="Due (e.g. 29 Aug)" className={inp} />
                    <input value={newDec.question} onChange={e => setNewDec(p => ({ ...p, question: e.target.value }))} placeholder="Question" className={inp} />
                    <textarea value={newDec.recommendation} onChange={e => setNewDec(p => ({ ...p, recommendation: e.target.value }))} placeholder="Recommendation" rows={2} className={inp + " sm:col-span-2"} />
                  </div>
                  <button onClick={() => { if (!newDec.question) return; planAdd("decision", newDec, item => { setDecisions(prev => [...prev, item]); setNewDec({ due_label: "", question: "", recommendation: "" }); }); }} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add decision</button>
                </div>
              </details>

              {/* Asks */}
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Asks of Global ({asks.length})</summary>
                <div className="mt-3 space-y-2">
                  {asks.map(a => (
                    <div key={a.id} className="flex items-start gap-2 text-sm border-b border-gray-50 pb-2">
                      <span className="w-28 text-gray-500 shrink-0 pt-0.5">{a.audience}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-700">{a.ask}</p>
                        {a.why && <p className="text-xs text-gray-400 mt-0.5">{a.why}</p>}
                      </div>
                      <button onClick={() => planRemove("ask", a.id, () => setAsks(prev => prev.filter(x => x.id !== a.id)))} className="text-[11px] text-rose-500 hover:underline shrink-0">Remove</button>
                    </div>
                  ))}
                  <div className="grid sm:grid-cols-2 gap-2 pt-1">
                    <input value={newAsk.audience} onChange={e => setNewAsk(p => ({ ...p, audience: e.target.value }))} placeholder="Audience (e.g. Global commercial)" className={inp} />
                    <input value={newAsk.ask} onChange={e => setNewAsk(p => ({ ...p, ask: e.target.value }))} placeholder="What's the ask" className={inp} />
                    <textarea value={newAsk.why} onChange={e => setNewAsk(p => ({ ...p, why: e.target.value }))} placeholder="Why" rows={2} className={inp + " sm:col-span-2"} />
                  </div>
                  <button onClick={() => { if (!newAsk.audience || !newAsk.ask) return; planAdd("ask", newAsk, item => { setAsks(prev => [...prev, item]); setNewAsk({ audience: "", ask: "", why: "" }); }); }} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add ask</button>
                </div>
              </details>
            </div>
          )}

          {/* Existing share links */}
          {admin && shares.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Share links sent</h3>
              <div className="divide-y divide-gray-50 text-sm">
                {shares.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2">
                    <span className="text-slate-600">{fmtD(s.created_at.slice(0, 10))}</span>
                    <span className="text-gray-400">{s.open_count} open{s.open_count === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PhaseAdd({ brandId, onAdd }: { brandId: number | undefined; onAdd: (item: Phase) => void }) {
  const [f, setF] = useState({ key: "", label: "", sub: "", start_date: "", end_date: "", color: "#132741" });
  async function add() {
    if (!brandId || !f.label || !f.start_date || !f.end_date) return;
    const key = f.key || f.label.toLowerCase().replace(/\s+/g, "-");
    const d = await fetch("/api/activation-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "phase", brand_id: brandId, ...f, key }) }).then(r => r.json());
    if (d.ok) { onAdd(d.item); setF({ key: "", label: "", sub: "", start_date: "", end_date: "", color: "#132741" }); }
  }
  return (
    <div className="flex gap-2 flex-wrap items-center pt-1">
      <input value={f.label} onChange={e => setF(p => ({ ...p, label: e.target.value }))} placeholder="Phase (e.g. Convert)" className={inp} />
      <input value={f.sub} onChange={e => setF(p => ({ ...p, sub: e.target.value }))} placeholder="Subtitle (e.g. peak trade)" className={inp} />
      <input type="date" value={f.start_date} onChange={e => setF(p => ({ ...p, start_date: e.target.value }))} className={inp} />
      <input type="date" value={f.end_date} onChange={e => setF(p => ({ ...p, end_date: e.target.value }))} className={inp} />
      <input type="color" value={f.color} onChange={e => setF(p => ({ ...p, color: e.target.value }))} className="w-9 h-9 rounded border border-gray-200" />
      <button onClick={add} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add phase</button>
    </div>
  );
}

function PillarAdd({ brandId, onAdd }: { brandId: number | undefined; onAdd: (item: Pillar) => void }) {
  const [f, setF] = useState({ key: "", label: "", color: "#132741", share_pct: 0, note: "" });
  async function add() {
    if (!brandId || !f.label) return;
    const key = f.key || f.label.toLowerCase().replace(/\s+/g, "-");
    const d = await fetch("/api/activation-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "pillar", brand_id: brandId, ...f, key }) }).then(r => r.json());
    if (d.ok) { onAdd(d.item); setF({ key: "", label: "", color: "#132741", share_pct: 0, note: "" }); }
  }
  return (
    <div className="flex gap-2 flex-wrap items-center pt-1">
      <input value={f.label} onChange={e => setF(p => ({ ...p, label: e.target.value }))} placeholder="Pillar name" className={inp} />
      <input type="number" value={f.share_pct} onChange={e => setF(p => ({ ...p, share_pct: Number(e.target.value) }))} placeholder="%" className={inp + " w-20"} />
      <input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} placeholder="Note" className={inp + " flex-1 min-w-[160px]"} />
      <input type="color" value={f.color} onChange={e => setF(p => ({ ...p, color: e.target.value }))} className="w-9 h-9 rounded border border-gray-200" />
      <button onClick={add} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add pillar</button>
    </div>
  );
}
