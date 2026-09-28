"use client";

import { useEffect, useState } from "react";
import { ShopifyLineItemPicker, type LineItem } from "./ShopifyLineItemPicker";

// Admin queue for giveaway/competition commitments submitted via the public
// /giveaway-request form. Approve/reject is admin-only (see api/giveaways) —
// approved + running ones get pulled into the Timeline automatically.
type Item = {
  id: string; brand_id: number | null; title: string; mechanic: string | null; items: string;
  retail_value: number | null; platform: string | null; entry_link: string | null;
  start_date: string | null; end_date: string | null; results: string | null;
  status: string; admin_note: string | null; approved_by: string | null;
  submitter_name: string; submitter_email: string; created_at: string;
  line_items: LineItem[]; shopify_draft_order_url: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", cls: "bg-sky-100 text-sky-700" },
  running: { label: "Running", cls: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Completed", cls: "bg-slate-100 text-slate-500" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-400" },
};
const STATUS_LIST = ["proposed", "approved", "running", "completed", "rejected"];
const fmtD = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const emptyForm = { brand_id: "", title: "", mechanic: "", items: "", retail_value: "", platform: "Instagram", entry_link: "", start_date: "", end_date: "" };

export function GiveawaysPanel({ admin = false, brands = [] }: { admin?: boolean; brands?: { id: number; name: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [statusF, setStatusF] = useState("");
  const [editField, setEditField] = useState<{ id: string; key: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushErr, setPushErr] = useState<Record<string, string>>({});

  const brandName = new Map(brands.map(b => [b.id, b.name]));

  async function load() {
    const res = await fetch("/api/giveaways").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function patch(id: string, fields: Record<string, unknown>) {
    setItems(prev => prev.map(r => (r.id === id ? { ...r, ...fields } : r)));
    const res = await fetch("/api/giveaways", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...fields }) }).then(r => r.json()).catch(() => null);
    if (res?.item) setItems(prev => prev.map(r => (r.id === id ? res.item : r)));
    setEditField(null);
  }

  async function pushShopify(id: string) {
    setPushing(id); setPushErr(p => ({ ...p, [id]: "" }));
    const res = await fetch(`/api/giveaways/${id}/push-shopify`, { method: "POST" }).then(r => r.json()).catch(() => null);
    setPushing(null);
    if (res?.ok && res.item) setItems(prev => prev.map(r => (r.id === id ? res.item : r)));
    else setPushErr(p => ({ ...p, [id]: res?.error || "Couldn't push to Shopify — try again." }));
  }

  async function remove(id: string) {
    if (!confirm("Delete this giveaway?")) return;
    await fetch(`/api/giveaways?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(r => r.id !== id));
  }

  async function addGiveaway() {
    if (!form.brand_id || !form.title.trim() || !form.items.trim()) { setAddErr("Brand, campaign name and items are required."); return; }
    setSaving(true); setAddErr("");
    const res = await fetch("/api/giveaways", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then(r => r.json()).catch(() => null);
    setSaving(false);
    if (res?.ok) { setItems(prev => [res.item, ...prev]); setForm(emptyForm); setAdding(false); }
    else setAddErr(res?.error || "Couldn't save that — try again.");
  }

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Giveaways isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_giveaways.sql</code> in Supabase.
      </div>
    );
  }

  const rows = items.filter(r => !statusF || r.status === statusF);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/giveaway-request` : "/giveaway-request";
  const openValue = items.filter(r => r.status === "proposed" || r.status === "approved" || r.status === "running").reduce((s, r) => s + (r.retail_value || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-slate-700">Share this link so anyone committing product to a giveaway submits it here first</p>
          <p className="text-xs text-gray-400">{shareUrl}</p>
        </div>
        <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="text-sm font-medium border border-gray-200 text-slate-600 rounded-lg px-4 py-2 hover:bg-slate-50">
          Copy link
        </button>
      </div>

      {openValue > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <p className="text-sm text-amber-800"><span className="font-semibold">${openValue.toLocaleString()}</span> in free product committed across proposed/approved/running giveaways right now.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatusF("")} className={`text-sm font-medium rounded-lg px-3 py-1.5 ${!statusF ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>All ({items.length})</button>
        {STATUS_LIST.map(s => (
          <button key={s} onClick={() => setStatusF(s)} className={`text-sm font-medium rounded-lg px-3 py-1.5 ${statusF === s ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
            {STATUS_META[s].label} ({items.filter(r => r.status === s).length})
          </button>
        ))}
        <button onClick={() => { setAdding(p => !p); setAddErr(""); }} className="ml-auto text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5">
          {adding ? "Cancel" : "+ Add giveaway"}
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Log a giveaway directly</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</label>
              <select value={form.brand_id} onChange={e => setForm(p => ({ ...p, brand_id: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">Select a brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Campaign name</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Platform</label>
              <input value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Retail value ($)</label>
              <input type="number" step="0.01" value={form.retail_value} onChange={e => setForm(p => ({ ...p, retail_value: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Mechanic</label>
            <textarea value={form.mechanic} onChange={e => setForm(p => ({ ...p, mechanic: e.target.value }))} rows={2} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Giveaway items</label>
            <textarea value={form.items} onChange={e => setForm(p => ({ ...p, items: e.target.value }))} rows={2} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none" />
          </div>
          {addErr && <p className="text-xs text-rose-500">{addErr}</p>}
          <div className="flex items-center gap-2">
            <button onClick={addGiveaway} disabled={saving} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">{saving ? "Saving…" : "Add giveaway"}</button>
            <button onClick={() => { setAdding(false); setForm(emptyForm); setAddErr(""); }} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No giveaways here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{r.title}</span>
                    {r.brand_id != null && <span className="text-xs text-gray-400">{brandName.get(r.brand_id) || `Brand ${r.brand_id}`}</span>}
                    {r.platform && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">{r.platform}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtD(r.start_date)} – {fmtD(r.end_date)}{r.retail_value ? ` · $${r.retail_value.toLocaleString()} retail value` : ""}</p>
                </div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_META[r.status]?.cls || "bg-slate-100 text-slate-500"}`}>{STATUS_META[r.status]?.label || r.status}</span>
              </div>

              <p className="text-sm text-slate-700"><span className="text-gray-400">Items:</span> {r.items}</p>
              {r.mechanic && <p className="text-sm text-slate-600"><span className="text-gray-400">Mechanic:</span> {r.mechanic}</p>}
              {r.entry_link && <a href={r.entry_link} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline break-all">{r.entry_link}</a>}
              <p className="text-xs text-gray-400">{r.submitter_name} · {r.submitter_email} · submitted {fmtD(r.created_at.slice(0, 10))}{r.approved_by ? ` · approved by ${r.approved_by}` : ""}</p>

              {editField?.id === r.id && editField.key === "results" ? (
                <textarea autoFocus defaultValue={r.results || ""} rows={2} placeholder="Entries, winner, reach…" onBlur={e => patch(r.id, { results: e.target.value })} className="w-full text-sm border border-emerald-300 rounded-lg px-2.5 py-1.5 focus:outline-none" />
              ) : r.results ? (
                <p onClick={() => setEditField({ id: r.id, key: "results" })} className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5 cursor-text">Results: {r.results}</p>
              ) : (
                <button onClick={() => setEditField({ id: r.id, key: "results" })} className="text-xs text-gray-400 hover:text-slate-600">+ Add results</button>
              )}

              {admin && (r.status === "approved" || r.status === "running") && r.brand_id != null && (
                <div className="space-y-2">
                  <ShopifyLineItemPicker brandId={r.brand_id} items={r.line_items || []} onChange={li => patch(r.id, { line_items: li })} />
                  {r.shopify_draft_order_url ? (
                    <a href={r.shopify_draft_order_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline">
                      ✓ Draft order in Shopify — open to check the address and complete it →
                    </a>
                  ) : (
                    <button onClick={() => pushShopify(r.id)} disabled={pushing === r.id || !(r.line_items?.length)}
                      className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg px-3 py-1.5">
                      {pushing === r.id ? "Pushing…" : "Push to Shopify (draft order)"}
                    </button>
                  )}
                  {pushErr[r.id] && <p className="text-xs text-rose-500">{pushErr[r.id]}</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {STATUS_LIST.map(s => {
                  const gated = (s === "approved" || s === "rejected") && !admin;
                  return (
                    <button key={s} onClick={() => patch(r.id, { status: s })} disabled={r.status === s || gated}
                      title={gated ? "Only Mel can approve or reject" : undefined}
                      className="text-xs border border-gray-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      Mark {STATUS_META[s].label}
                    </button>
                  );
                })}
                {admin && <button onClick={() => remove(r.id)} className="text-xs border border-rose-200 text-rose-500 rounded-lg px-3 py-1.5 hover:bg-rose-50 ml-auto">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
