"use client";

import { useState } from "react";

// Search a brand's real Shopify catalogue and build a line-item list —
// shared by GiveawaysPanel and ProductRequestsPanel so a "Push to Shopify"
// action has real variant ids, not a guess parsed from free text.
export type LineItem = { variant_id: number; title: string; variant_title?: string | null; sku?: string | null; quantity: number };
type SearchResult = { product_id: number; title: string; image_url: string | null; variants: { variant_id: number; title: string | null; sku: string | null; price: number | null }[] };

export function ShopifyLineItemPicker({ brandId, items, onChange }: { brandId: number; items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  async function search() {
    setSearching(true); setErr("");
    const res = await fetch(`/api/shopify-product-search?brand_id=${brandId}&q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => null);
    setSearching(false);
    if (res?.ok) setResults(res.results || []); else setErr(res?.error || "Search failed");
  }

  function add(product: SearchResult, variant: SearchResult["variants"][number]) {
    if (items.some(i => i.variant_id === variant.variant_id)) return;
    onChange([...items, { variant_id: variant.variant_id, title: product.title, variant_title: variant.title, sku: variant.sku, quantity: 1 }]);
  }
  function setQty(variantId: number, qty: number) {
    onChange(items.map(i => (i.variant_id === variantId ? { ...i, quantity: Math.max(1, qty) } : i)));
  }
  function remove(variantId: number) {
    onChange(items.filter(i => i.variant_id !== variantId));
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-slate-50/60">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Products for Shopify (real SKUs)</p>
        <button onClick={() => setOpen(o => !o)} className="text-xs text-emerald-600 hover:underline">{open ? "Hide search" : "+ Search products"}</button>
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map(i => (
            <div key={i.variant_id} className="flex items-center gap-2 text-xs bg-white rounded-lg border border-gray-100 px-2.5 py-1.5">
              <span className="flex-1 truncate">{i.title}{i.variant_title ? ` — ${i.variant_title}` : ""}{i.sku ? ` (${i.sku})` : ""}</span>
              <input type="number" min={1} value={i.quantity} onChange={e => setQty(i.variant_id, Number(e.target.value))} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" />
              <button onClick={() => remove(i.variant_id)} className="text-rose-400 hover:text-rose-600">✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Search this brand's products…" className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5" />
            <button onClick={search} disabled={searching} className="text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 disabled:opacity-50">{searching ? "…" : "Search"}</button>
          </div>
          {err && <p className="text-xs text-rose-500">{err}</p>}
          {results.length > 0 && (
            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {results.map(p => (
                <div key={p.product_id} className="bg-white rounded-lg border border-gray-100 p-2">
                  <p className="text-xs font-semibold text-slate-700 mb-1">{p.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.variants.map(v => {
                      const added = items.some(i => i.variant_id === v.variant_id);
                      return (
                        <button key={v.variant_id} disabled={added} onClick={() => add(p, v)}
                          className={`text-[11px] rounded-full px-2.5 py-1 border ${added ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-gray-200 text-slate-600 hover:bg-slate-100"}`}>
                          {added ? "✓ " : "+ "}{v.title || "Default"}{v.sku ? ` · ${v.sku}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
