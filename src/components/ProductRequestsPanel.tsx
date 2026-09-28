"use client";

import { useEffect, useState } from "react";
import { ShopifyLineItemPicker, type LineItem } from "./ShopifyLineItemPicker";
import { Cin7LineItemPicker, type Cin7LineItem } from "./Cin7LineItemPicker";

// Admin queue for free-product/sample requests submitted via the public
// /product-request form. Approve/reject is admin-only (see
// api/product-requests) — this is the visibility Mel didn't have before:
// staff could ask for samples with no one but them tracking it.
//
// "Push to Shopify" creates a DRAFT order, "Push to Cin7" creates a
// SalesOrder at stage "New" — neither ships or charges automatically. See
// shopifyDraftOrder.ts / cin7SalesOrder.ts for why.
type Item = {
  id: string; brand_id: number; reason: string; products: string;
  ship_to_name: string | null; ship_to_address: string | null;
  status: string; admin_note: string | null; approved_by: string | null;
  requester_name: string; requester_email: string; created_at: string;
  line_items: LineItem[]; shopify_draft_order_url: string | null;
  cin7_line_items: Cin7LineItem[]; cin7_sales_order_ref: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", cls: "bg-sky-100 text-sky-700" },
  fulfilled: { label: "Fulfilled", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-400" },
};
const STATUS_LIST = ["proposed", "approved", "fulfilled", "rejected"];
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const emptyForm = { brand_id: "", reason: "", products: "", ship_to_name: "", ship_to_address: "" };

export function ProductRequestsPanel({ admin = false, brands = [] }: { admin?: boolean; brands?: { id: number; name: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [statusF, setStatusF] = useState("");
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushErr, setPushErr] = useState<Record<string, string>>({});
  const [pushingCin7, setPushingCin7] = useState<string | null>(null);
  const [pushCin7Err, setPushCin7Err] = useState<Record<string, string>>({});

  const brandName = new Map(brands.map(b => [b.id, b.name]));

  async function load() {
    const res = await fetch("/api/product-requests").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setNeedsSetup(!!res.needsSetup); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function patch(id: string, fields: Record<string, unknown>) {
    setItems(prev => prev.map(r => (r.id === id ? { ...r, ...fields } : r)));
    const res = await fetch("/api/product-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...fields }) }).then(r => r.json()).catch(() => null);
    if (res?.item) setItems(prev => prev.map(r => (r.id === id ? res.item : r)));
    setNoteEdit(null);
  }

  async function pushShopify(id: string) {
    setPushing(id); setPushErr(p => ({ ...p, [id]: "" }));
    const res = await fetch(`/api/product-requests/${id}/push-shopify`, { method: "POST" }).then(r => r.json()).catch(() => null);
    setPushing(null);
    if (res?.ok && res.item) setItems(prev => prev.map(r => (r.id === id ? res.item : r)));
    else setPushErr(p => ({ ...p, [id]: res?.error || "Couldn't push to Shopify — try again." }));
  }

  async function pushCin7(id: string) {
    setPushingCin7(id); setPushCin7Err(p => ({ ...p, [id]: "" }));
    const res = await fetch(`/api/product-requests/${id}/push-cin7`, { method: "POST" }).then(r => r.json()).catch(() => null);
    setPushingCin7(null);
    if (res?.ok && res.item) setItems(prev => prev.map(r => (r.id === id ? res.item : r)));
    else setPushCin7Err(p => ({ ...p, [id]: res?.error || "Couldn't push to Cin7 — try again." }));
  }

  async function remove(id: string) {
    if (!confirm("Delete this request?")) return;
    await fetch(`/api/product-requests?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(r => r.id !== id));
  }

  async function addRequest() {
    if (!form.brand_id || !form.reason.trim() || !form.products.trim()) { setAddErr("Brand, reason and products are required."); return; }
    setSaving(true); setAddErr("");
    const res = await fetch("/api/product-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then(r => r.json()).catch(() => null);
    setSaving(false);
    if (res?.ok) { setItems(prev => [res.item, ...prev]); setForm(emptyForm); setAdding(false); }
    else setAddErr(res?.error || "Couldn't save that — try again.");
  }

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Product Requests isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_product_requests.sql</code> in Supabase.
      </div>
    );
  }

  const rows = items.filter(r => !statusF || r.status === statusF);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/product-request` : "/product-request";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-slate-700">Share this link so anyone needing free product/samples submits it here first</p>
          <p className="text-xs text-gray-400">{shareUrl}</p>
        </div>
        <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="text-sm font-medium border border-gray-200 text-slate-600 rounded-lg px-4 py-2 hover:bg-slate-50">
          Copy link
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
        <p className="text-xs text-slate-500">Approving doesn't ship anything by itself — once approved, add the real products below and push to Shopify as a draft order. A draft still needs to be opened in Shopify, address checked, and completed before it ships. No Cin7 push yet.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatusF("")} className={`text-sm font-medium rounded-lg px-3 py-1.5 ${!statusF ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>All ({items.length})</button>
        {STATUS_LIST.map(s => (
          <button key={s} onClick={() => setStatusF(s)} className={`text-sm font-medium rounded-lg px-3 py-1.5 ${statusF === s ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
            {STATUS_META[s].label} ({items.filter(r => r.status === s).length})
          </button>
        ))}
        <button onClick={() => { setAdding(p => !p); setAddErr(""); }} className="ml-auto text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5">
          {adding ? "Cancel" : "+ Add request"}
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Log a request directly</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</label>
              <select value={form.brand_id} onChange={e => setForm(p => ({ ...p, brand_id: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">Select a brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Reason</label>
              <input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Products</label>
            <textarea value={form.products} onChange={e => setForm(p => ({ ...p, products: e.target.value }))} rows={2} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ship to (name)</label>
              <input value={form.ship_to_name} onChange={e => setForm(p => ({ ...p, ship_to_name: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ship to (address)</label>
              <input value={form.ship_to_address} onChange={e => setForm(p => ({ ...p, ship_to_address: e.target.value }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
          </div>
          {addErr && <p className="text-xs text-rose-500">{addErr}</p>}
          <div className="flex items-center gap-2">
            <button onClick={addRequest} disabled={saving} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">{saving ? "Saving…" : "Add request"}</button>
            <button onClick={() => { setAdding(false); setForm(emptyForm); setAddErr(""); }} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No requests here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{brandName.get(r.brand_id) || `Brand ${r.brand_id}`}</span>
                    <span className="text-xs text-gray-400">{r.reason}</span>
                  </div>
                </div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_META[r.status]?.cls || "bg-slate-100 text-slate-500"}`}>{STATUS_META[r.status]?.label || r.status}</span>
              </div>

              <p className="text-sm text-slate-700 whitespace-pre-wrap"><span className="text-gray-400">Products:</span> {r.products}</p>
              {(r.ship_to_name || r.ship_to_address) && (
                <p className="text-sm text-slate-600"><span className="text-gray-400">Ship to:</span> {[r.ship_to_name, r.ship_to_address].filter(Boolean).join(" — ")}</p>
              )}
              <p className="text-xs text-gray-400">{r.requester_name} · {r.requester_email} · {fmtD(r.created_at)}{r.approved_by ? ` · approved by ${r.approved_by}` : ""}</p>

              {noteEdit === r.id ? (
                <textarea autoFocus defaultValue={r.admin_note || ""} rows={2} placeholder="Internal note" onBlur={e => patch(r.id, { admin_note: e.target.value })} className="w-full text-sm border border-emerald-300 rounded-lg px-2.5 py-1.5 focus:outline-none" />
              ) : r.admin_note ? (
                <p onClick={() => setNoteEdit(r.id)} className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5 cursor-text">{r.admin_note}</p>
              ) : (
                <button onClick={() => setNoteEdit(r.id)} className="text-xs text-gray-400 hover:text-slate-600">+ Add note</button>
              )}

              {admin && r.status === "approved" && (
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

              {admin && r.status === "approved" && (
                <div className="space-y-2 pt-1 border-t border-gray-50">
                  <Cin7LineItemPicker items={r.cin7_line_items || []} onChange={li => patch(r.id, { cin7_line_items: li })} />
                  {r.cin7_sales_order_ref ? (
                    <p className="text-xs font-medium text-emerald-600">✓ Cin7 order {r.cin7_sales_order_ref} created — stage "New", check it in Cin7 before dispatching.</p>
                  ) : (
                    <button onClick={() => pushCin7(r.id)} disabled={pushingCin7 === r.id || !(r.cin7_line_items?.length)}
                      className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg px-3 py-1.5">
                      {pushingCin7 === r.id ? "Pushing…" : "Push to Cin7"}
                    </button>
                  )}
                  {pushCin7Err[r.id] && <p className="text-xs text-rose-500">{pushCin7Err[r.id]}</p>}
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
