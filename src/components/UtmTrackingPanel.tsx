"use client";

import { useEffect, useMemo, useState } from "react";

// Plan > UTM Tracking — a shared, in-dashboard replacement for the
// "UTM - ALL BRANDS.xlsx" spreadsheet. Anyone with the tab can type in a
// new offer/link; the final tracked URL is built server-side (so a typo
// never breaks the ?utm_source= string) and every link gets a downloadable
// QR code for print/signage use.
type Stats = { sessions: number; conversions: number; revenue: number; synced_at: string };
type Link = {
  id: string; brand: string | null; partner: string; source: string; medium: string;
  campaign: string | null; description: string | null; landing_page: string; final_url: string; short_code: string | null; created_by: string | null; created_at: string;
  stats?: Stats | null;
};
const SHORT_BASE = "https://marketing.coolkidz.com.au/l/";

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1";
const MEDIUMS = ["cpc", "affiliates", "qrcode", "pos", "organic", "email", "social", "collab", "display"];
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const fmtN = (n: number) => n.toLocaleString("en-AU");
const fmtMoney = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

function previewUrl(landingPage: string, source: string, medium: string, campaign: string) {
  try {
    const u = new URL(landingPage.trim());
    if (source.trim()) u.searchParams.set("utm_source", source.trim());
    if (medium.trim()) u.searchParams.set("utm_medium", medium.trim());
    if (campaign.trim()) u.searchParams.set("utm_campaign", campaign.trim());
    return u.toString();
  } catch { return ""; }
}

export function UtmTrackingPanel({ brands, admin }: { brands: { name: string }[]; admin: boolean }) {
  const [items, setItems] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [brandF, setBrandF] = useState("");
  const [q, setQ] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);

  const [f, setF] = useState({ partner: "", brand: "", source: "", medium: "", campaign: "", description: "", landing_page: "" });

  async function load() {
    const res = await fetch("/api/utm-links").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setMsg("");
    if (!f.partner.trim() || !f.source.trim() || !f.medium.trim() || !f.campaign.trim() || !f.landing_page.trim()) {
      setMsg("Partner/activity, source, medium, campaign and landing page are all required — the site reads source + campaign off the link to know which offer to show."); return;
    }
    setBusy(true);
    const d = await fetch("/api/utm-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setF({ partner: "", brand: f.brand, source: "", medium: "", campaign: "", description: "", landing_page: "" }); load(); setMsg("Link created."); }
    else { setNeedsSetup(!!d?.needsSetup); setMsg(d?.error || "Couldn't create the link."); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this tracked link? The QR code will stop resolving anywhere it's already printed.")) return;
    await fetch(`/api/utm-links?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(r => r.id !== id));
  }

  function copy(link: Link) {
    navigator.clipboard?.writeText(link.final_url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 1800);
  }
  function copyShort(link: Link) {
    if (!link.short_code) return;
    navigator.clipboard?.writeText(`${SHORT_BASE}${link.short_code}`);
    setCopiedShortId(link.id);
    setTimeout(() => setCopiedShortId(null), 1800);
  }

  // Editing — id and short_code stay put, so a QR already printed for this
  // link keeps working and just starts pointing at whatever the destination
  // is after saving. Reuses the same field set as the create form.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ef, setEf] = useState({ partner: "", brand: "", source: "", medium: "", campaign: "", description: "", landing_page: "" });
  const [editMsg, setEditMsg] = useState("");

  function startEdit(link: Link) {
    setEditingId(link.id);
    setEf({ partner: link.partner, brand: link.brand ?? "", source: link.source, medium: link.medium, campaign: link.campaign ?? "", description: link.description ?? "", landing_page: link.landing_page });
    setEditMsg("");
  }
  async function saveEdit() {
    if (!editingId) return;
    setEditMsg("");
    if (!ef.partner.trim() || !ef.source.trim() || !ef.medium.trim() || !ef.campaign.trim() || !ef.landing_page.trim()) {
      setEditMsg("Partner/activity, source, medium, campaign and landing page are all required."); return;
    }
    setBusy(true);
    const d = await fetch("/api/utm-links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...ef }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setEditingId(null); load(); }
    else setEditMsg(d?.error || "Couldn't save that.");
  }

  const preview = previewUrl(f.landing_page, f.source, f.medium, f.campaign);
  const brandList = useMemo(() => [...new Set([...brands.map(b => b.name), ...items.map(i => i.brand).filter(Boolean) as string[]])].sort(), [brands, items]);
  const rows = items.filter(r =>
    (!brandF || r.brand === brandF) &&
    (!q.trim() || `${r.partner} ${r.source} ${r.medium} ${r.campaign ?? ""} ${r.brand ?? ""} ${r.description ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        UTM Tracking isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_utm_links.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-1">New tracked link</p>
        <p className="text-xs text-gray-400 mb-3">Source and campaign are what the website itself reads off the link to know which offer to show — both are required, not just for our own reporting.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div><div className={lbl}>Partner / activity *</div><input value={f.partner} onChange={e => setF(p => ({ ...p, partner: e.target.value }))} placeholder="e.g. Bounty Parents, Boxing Day flyer" className={inp} /></div>
          <div>
            <div className={lbl}>Brand</div>
            <input value={f.brand} onChange={e => setF(p => ({ ...p, brand: e.target.value }))} placeholder="e.g. UPPAbaby" className={inp} list="utm-brand-list" />
            <datalist id="utm-brand-list">{brandList.map(b => <option key={b} value={b} />)}</datalist>
          </div>
          <div><div className={lbl}>Landing page URL *</div><input value={f.landing_page} onChange={e => setF(p => ({ ...p, landing_page: e.target.value }))} placeholder="https://uppababy.com.au/" className={inp} /></div>
          <div>
            <div className={lbl}>Source *</div>
            <input value={f.source} onChange={e => setF(p => ({ ...p, source: e.target.value }))} placeholder="e.g. META, bountyparents" className={inp} />
          </div>
          <div>
            <div className={lbl}>Medium *</div>
            <input value={f.medium} onChange={e => setF(p => ({ ...p, medium: e.target.value }))} placeholder="e.g. cpc, affiliates, qrcode" className={inp} list="utm-medium-list" />
            <datalist id="utm-medium-list">{MEDIUMS.map(m => <option key={m} value={m} />)}</datalist>
          </div>
          <div><div className={lbl}>Campaign *</div><input value={f.campaign} onChange={e => setF(p => ({ ...p, campaign: e.target.value }))} placeholder="e.g. UB_Traffic, boxing_day" className={inp} /></div>
          <div className="sm:col-span-2 lg:col-span-3">
            <div className={lbl}>Description</div>
            <textarea value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} placeholder="What is this link for, and where is it being used? e.g. QR code on the Boxing Day catalogue insert" rows={2} className={inp} />
          </div>
        </div>
        {preview && (
          <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-slate-600 break-all">
            <span className="text-gray-400">Preview: </span>{preview}
          </div>
        )}
        {msg && <p className="text-[13px] text-slate-500 mt-2">{msg}</p>}
        <button onClick={create} disabled={busy} className="mt-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Saving…" : "Create link"}</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setBrandF("")} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${!brandF ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>All brands ({items.length})</button>
        {brandList.filter(b => items.some(i => i.brand === b)).map(b => (
          <button key={b} onClick={() => setBrandF(b)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${brandF === b ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{b} ({items.filter(i => i.brand === b).length})</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className={`${inp} w-56 ml-auto`} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No tracked links yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="text-[11px] text-gray-400 px-5 pt-4 pb-1">Sessions / conversions / revenue are GA4 traffic matched to each link by source, medium and campaign over the last 180 days — a dash means no GA4 traffic has landed on that exact combination yet.</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
            <thead><tr className="text-[10.5px] uppercase tracking-wide text-gray-400">
              <th className="text-left py-2.5 px-3 pl-5 whitespace-nowrap">Date</th>
              <th className="text-left py-2.5 px-3">Partner / activity</th>
              <th className="text-left py-2.5 px-3">Brand</th>
              <th className="text-left py-2.5 px-3">Source</th>
              <th className="text-left py-2.5 px-3">Medium</th>
              <th className="text-left py-2.5 px-3">Campaign</th>
              <th className="text-right py-2.5 px-3 whitespace-nowrap" title="Sessions, last 180 days (GA4)">Sessions</th>
              <th className="text-right py-2.5 px-3 whitespace-nowrap" title="Conversions, last 180 days (GA4)">Conv.</th>
              <th className="text-right py-2.5 px-3 whitespace-nowrap" title="Revenue, last 180 days (GA4)">Revenue</th>
              <th className="text-left py-2.5 px-3 pr-5">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 [&>td]:border-t [&>td]:border-gray-100">
                  <td className="py-2.5 px-3 pl-5 text-gray-400 whitespace-nowrap">{fmtD(r.created_at)}</td>
                  <td className="py-2.5 px-3 max-w-[220px]">
                    <div className="font-medium text-slate-700 truncate" title={r.partner}>{r.partner}</div>
                    {r.description && <div className="text-[11px] text-gray-400 truncate" title={r.description}>{r.description}</div>}
                  </td>
                  <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{r.brand ?? "—"}</td>
                  <td className="py-2.5 px-3"><span className="inline-block text-[11px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5 whitespace-nowrap">{r.source}</span></td>
                  <td className="py-2.5 px-3"><span className="inline-block text-[11px] font-medium text-sky-700 bg-sky-50 rounded-full px-2 py-0.5 whitespace-nowrap">{r.medium}</span></td>
                  <td className="py-2.5 px-3 text-gray-500 max-w-[160px] truncate" title={r.campaign ?? undefined}>{r.campaign ?? "—"}</td>
                  <td className="py-2.5 px-3 text-right text-gray-500 tabular-nums whitespace-nowrap">{r.stats ? fmtN(r.stats.sessions) : "—"}</td>
                  <td className="py-2.5 px-3 text-right text-gray-500 tabular-nums whitespace-nowrap">{r.stats ? fmtN(Math.round(r.stats.conversions)) : "—"}</td>
                  <td className="py-2.5 px-3 text-right text-gray-500 tabular-nums whitespace-nowrap" title={r.stats ? `Synced ${fmtD(r.stats.synced_at)}` : "No GA4 data matched yet"}>{r.stats ? fmtMoney(r.stats.revenue) : "—"}</td>
                  <td className="py-2.5 px-3 pr-5">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <button onClick={() => copy(r)} title={r.final_url} className="text-xs font-semibold text-indigo-600 border border-indigo-100 rounded-lg px-2.5 py-1 hover:bg-indigo-50">
                        {copiedId === r.id ? "Copied ✓" : "Copy link"}
                      </button>
                      <button onClick={() => copyShort(r)} title={r.short_code ? `${SHORT_BASE}${r.short_code} — this is what the QR code encodes, stays valid even if you edit the link` : "Download the QR once to generate this link's short code"} disabled={!r.short_code}
                        className="text-xs font-semibold text-violet-600 border border-violet-100 rounded-lg px-2.5 py-1 hover:bg-violet-50 disabled:opacity-40">
                        {copiedShortId === r.id ? "Copied ✓" : "Copy short link"}
                      </button>
                      <a href={`/api/utm-links/qr?id=${r.id}`} download className="text-xs font-semibold text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">QR ↓</a>
                      <button onClick={() => startEdit(r)} title="Edit — the QR code and short link keep working after you save" className="text-xs font-semibold text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">✎ Edit</button>
                      {admin && <button onClick={() => remove(r.id)} title="Delete" className="text-gray-300 hover:text-rose-600 px-1">🗑</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {editingId && (() => {
        const link = items.find(i => i.id === editingId);
        const editPreview = previewUrl(ef.landing_page, ef.source, ef.medium, ef.campaign);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditingId(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold text-gray-800 mb-1">Edit tracked link</h3>
              <p className="text-xs text-gray-400 mb-4">The short link and any QR code already printed for this keep working — they&apos;ll just point at whatever you save here.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><div className={lbl}>Partner / activity *</div><input value={ef.partner} onChange={e => setEf(p => ({ ...p, partner: e.target.value }))} className={inp} /></div>
                <div>
                  <div className={lbl}>Brand</div>
                  <input value={ef.brand} onChange={e => setEf(p => ({ ...p, brand: e.target.value }))} className={inp} list="utm-brand-list" />
                </div>
                <div className="sm:col-span-2"><div className={lbl}>Landing page URL *</div><input value={ef.landing_page} onChange={e => setEf(p => ({ ...p, landing_page: e.target.value }))} className={inp} /></div>
                <div><div className={lbl}>Source *</div><input value={ef.source} onChange={e => setEf(p => ({ ...p, source: e.target.value }))} className={inp} /></div>
                <div>
                  <div className={lbl}>Medium *</div>
                  <input value={ef.medium} onChange={e => setEf(p => ({ ...p, medium: e.target.value }))} className={inp} list="utm-medium-list" />
                </div>
                <div><div className={lbl}>Campaign *</div><input value={ef.campaign} onChange={e => setEf(p => ({ ...p, campaign: e.target.value }))} className={inp} /></div>
                <div><div className={lbl}>Description</div><input value={ef.description} onChange={e => setEf(p => ({ ...p, description: e.target.value }))} className={inp} /></div>
              </div>
              {editPreview && <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-slate-600 break-all"><span className="text-gray-400">New destination: </span>{editPreview}</div>}
              {link?.short_code && <p className="text-xs text-violet-600 mt-2">Stays at {SHORT_BASE}{link.short_code}</p>}
              {editMsg && <p className="text-[13px] text-rose-500 mt-2">{editMsg}</p>}
              <div className="flex items-center gap-2 mt-4">
                <button onClick={saveEdit} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 rounded-lg px-4 py-2">{busy ? "Saving…" : "Save"}</button>
                <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
