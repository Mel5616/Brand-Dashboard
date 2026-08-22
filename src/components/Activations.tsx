"use client";

import { useEffect, useMemo, useState } from "react";
import { buildActivationReport } from "@/lib/activationReport";
import type { Tradeshow } from "@/lib/db";

// Per-brand report for external partners (Global) — competitor landscape,
// this brand's tradeshows and the 6-month forward marketing plan, plus top
// live Google Ads copy. A sub-report of Brand Snapshot: same print/PDF +
// open-tracked share-link pattern, just its own report rather than the
// monthly performance one.

type Brand = { id: number; name: string; live?: boolean };
type Competitor = { id: number; brand_id: number; name: string; notes: string | null; updated_at: string; updated_by: string | null };
type Campaign = { id: string; campaign: string; brand: string; channel: string; status: string; key_date: string; end_date?: string | null; note: string };
type Creative = { id: number; brand_id: number; campaign_name: string | null; ad_group: string | null; headlines: string[]; descriptions: string[]; clicks: number; impressions: number };
type ShareLink = { id: number; token: string; label: string | null; created_at: string; open_count: number; expires_at: string | null };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const fmtD = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";

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

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [compNeedsSetup, setCompNeedsSetup] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativesNeedsSetup, setCreativesNeedsSetup] = useState(false);
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.items ?? [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!brandId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/brand-competitors?brand_id=${brandId}`).then(r => r.json()),
      fetch(`/api/google-ads-creatives?brand_id=${brandId}`).then(r => r.json()),
      admin ? fetch(`/api/activation-share?brand_id=${brandId}`).then(r => r.json()) : Promise.resolve({ items: [] }),
    ]).then(([c, ad, sh]) => {
      setCompetitors(c.competitors ?? []); setCompNeedsSetup(!!c.needsSetup);
      setCreatives(ad.creatives ?? []); setCreativesNeedsSetup(!!ad.needsSetup);
      setShares(sh.items ?? []);
    }).finally(() => setLoading(false));
  }, [brandId, admin]);

  const brandShows = useMemo(() => {
    if (!brandId) return [];
    const ids = new Set(tradeshowBrands.filter(tb => tb.brand_id === brandId).map(tb => tb.tradeshow_id));
    return tradeshows.filter(t => ids.has(t.id)).sort((a, b) => b.date_start.localeCompare(a.date_start));
  }, [tradeshowBrands, tradeshows, brandId]);

  const sixMonthsOut = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toISOString().slice(0, 10); }, []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const brandCampaigns = useMemo(() => {
    if (!brand) return [];
    return campaigns
      .filter(c => (c.brand || "").toLowerCase() === brand.name.toLowerCase() && c.key_date && c.key_date >= today && c.key_date <= sixMonthsOut)
      .sort((a, b) => a.key_date.localeCompare(b.key_date));
  }, [campaigns, brand, today, sixMonthsOut]);

  // Competitor add/edit
  const [newComp, setNewComp] = useState({ name: "", notes: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", notes: "" });

  async function addCompetitor() {
    if (!brandId || !newComp.name.trim()) return;
    const d = await fetch("/api/brand-competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, ...newComp }) }).then(r => r.json());
    if (d.ok) { setCompetitors(prev => [...prev, d.competitor].sort((a, b) => a.name.localeCompare(b.name))); setNewComp({ name: "", notes: "" }); }
    else setMsg(d.error || "Couldn't add competitor.");
  }
  async function saveCompetitor(id: number) {
    const d = await fetch("/api/brand-competitors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...editDraft }) }).then(r => r.json());
    if (d.ok) { setCompetitors(prev => prev.map(c => c.id === id ? { ...c, ...editDraft } : c)); setEditingId(null); }
    else setMsg(d.error || "Couldn't save.");
  }
  async function removeCompetitor(id: number) {
    if (!confirm("Remove this competitor?")) return;
    const d = await fetch(`/api/brand-competitors?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (d.ok) setCompetitors(prev => prev.filter(c => c.id !== id));
  }

  // Share to Global
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState("");
  async function shareReport() {
    if (!brand) return;
    setSharing(true);
    const html = buildActivationReport({
      brand_name: brand.name, generated_at: new Date().toISOString(),
      competitors: competitors.map(c => ({ name: c.name, notes: c.notes })),
      tradeshows: brandShows.map(t => ({ name: t.name, date_start: t.date_start, date_end: t.date_end, state: t.state, location: t.location, status: showStatus(t) })),
      campaigns: brandCampaigns.map(c => ({ campaign: c.campaign, channel: c.channel, status: c.status, key_date: c.key_date, end_date: c.end_date, note: c.note })),
      adCreatives: creatives.map(c => ({ ad_group: c.ad_group, campaign_name: c.campaign_name, headlines: c.headlines, descriptions: c.descriptions, clicks: c.clicks })),
    });
    const d = await fetch("/api/activation-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html, brand_id: brand.id, brand: brand.name, label: `Activations — ${brand.name}` }) }).then(r => r.json());
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
          <span className="text-xs text-gray-400">Competitor landscape, tradeshows &amp; 6-month activation plan</span>
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

      {loading ? <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div> : (
        <>
          {/* Competitor tracker */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Competitor landscape</h3>
            {compNeedsSetup ? (
              <p className="text-xs text-amber-600">Run <code className="bg-amber-50 px-1 rounded">supabase/add_brand_activations.sql</code> in Supabase, then reload.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {competitors.map(c => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-3.5">
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <input value={editDraft.name} onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))} className={inp + " w-full"} />
                        <textarea value={editDraft.notes} onChange={e => setEditDraft(p => ({ ...p, notes: e.target.value }))} rows={4} placeholder="One point per line" className={inp + " w-full"} />
                        <div className="flex gap-2">
                          <button onClick={() => saveCompetitor(c.id)} className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 px-2">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                          {admin && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => { setEditingId(c.id); setEditDraft({ name: c.name, notes: c.notes ?? "" }); }} className="text-[11px] text-amber-600 hover:underline">Edit</button>
                              <button onClick={() => removeCompetitor(c.id)} className="text-[11px] text-rose-500 hover:underline">Remove</button>
                            </div>
                          )}
                        </div>
                        <ul className="mt-2 space-y-1 text-[12.5px] text-slate-600 list-disc pl-4">
                          {(c.notes ?? "").split("\n").map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                        {c.updated_at && <p className="text-[10px] text-gray-300 mt-2">Updated {fmtD(c.updated_at.slice(0, 10))}</p>}
                      </>
                    )}
                  </div>
                ))}
                {admin && (
                  <div className="border border-dashed border-gray-200 rounded-xl p-3.5 space-y-2">
                    <input value={newComp.name} onChange={e => setNewComp(p => ({ ...p, name: e.target.value }))} placeholder="Competitor name" className={inp + " w-full"} />
                    <textarea value={newComp.notes} onChange={e => setNewComp(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="One point per line" className={inp + " w-full"} />
                    <button onClick={addCompetitor} disabled={!newComp.name.trim()} className="text-xs font-semibold text-emerald-600 disabled:opacity-40 hover:underline">+ Add competitor</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tradeshows */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Tradeshows</h3>
            {brandShows.length === 0 ? <p className="text-xs text-gray-400">No tradeshows on record for {brand?.name}.</p> : (
              <div className="divide-y divide-gray-50">
                {brandShows.map(t => {
                  const st = showStatus(t);
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="font-semibold text-slate-700">{t.name}</p>
                        <p className="text-[11px] text-gray-400">{fmtD(t.date_start)} – {fmtD(t.date_end)} · {t.location}{t.state ? `, ${t.state}` : ""}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${st === "live" ? "bg-emerald-100 text-emerald-700" : st === "upcoming" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>{st}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6-month activation plan */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Activation plan — next 6 months</h3>
            {brandCampaigns.length === 0 ? <p className="text-xs text-gray-400">Nothing planned for {brand?.name} in the next 6 months yet — add it in Campaigns.</p> : (
              <div className="divide-y divide-gray-50">
                {brandCampaigns.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-700 truncate">{c.campaign}</p>
                      <p className="text-[11px] text-gray-400">{c.channel || "—"} · {c.status}</p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{fmtD(c.key_date)}{c.end_date ? ` – ${fmtD(c.end_date)}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Google Ads copy */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Google Ads — top copy live now</h3>
            {creativesNeedsSetup ? (
              <p className="text-xs text-amber-600">Run <code className="bg-amber-50 px-1 rounded">supabase/add_brand_activations.sql</code> in Supabase, then wait for the next sync.</p>
            ) : creatives.length === 0 ? (
              <p className="text-xs text-gray-400">No ad copy synced for {brand?.name} yet — needs a Google Ads customer ID configured and the next sync run.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {creatives.map(c => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-3.5">
                    <p className="font-semibold text-slate-800 text-sm">{c.campaign_name}</p>
                    {c.ad_group && <p className="text-[11px] text-gray-400 mb-2">{c.ad_group}</p>}
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-2">Headlines</p>
                    <ul className="text-[12.5px] text-slate-600 list-disc pl-4">{c.headlines.map((h, i) => <li key={i}>{h}</li>)}</ul>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-2">Descriptions</p>
                    <ul className="text-[12.5px] text-slate-600 list-disc pl-4">{c.descriptions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </div>

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
