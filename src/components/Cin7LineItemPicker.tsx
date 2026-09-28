"use client";

import { useState } from "react";

// Search Cin7's real catalogue and build a line-item list — same pattern as
// ShopifyLineItemPicker, different backend (Cin7 ProductOptions instead of
// Shopify variants). Used for the "Push to Cin7" action.
export type Cin7LineItem = { product_id: number; product_option_id: number; code: string; name: string; quantity: number };
type Cin7SearchResult = { product_id: number; name: string; brand: string | null; options: { product_option_id: number; code: string; stock_available: number | null; retail_price: number | null }[] };

export function Cin7LineItemPicker({ items, onChange }: { items: Cin7LineItem[]; onChange: (items: Cin7LineItem[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Cin7SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  async function search() {
    setSearching(true); setErr("");
    const res = await fetch(`/api/cin7-product-search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => null);
    setSearching(false);
    if (res?.ok) setResults(res.results || []); else setErr(res?.error || "Search failed");
  }

  function add(product: Cin7SearchResult, opt: Cin7SearchResult["options"][number]) {
    if (items.some(i => i.product_option_id === opt.product_option_id)) return;
    onChange([...items, { product_id: product.product_id, product_option_id: opt.product_option_id, code: opt.code, name: product.name, quantity: 1 }]);
  }
  function setQty(productOptionId: number, qty: number) {
    onChange(items.map(i => (i.product_option_id === productOptionId ? { ...i, quantity: Math.max(1, qty) } : i)));
  }
  function remove(productOptionId: number) {
    onChange(items.filter(i => i.product_option_id !== productOptionId));
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-slate-50/60">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Products for Cin7 (real SKUs)</p>
        <button onClick={() => setOpen(o => !o)} className="text-xs text-emerald-600 hover:underline">{open ? "Hide search" : "+ Search products"}</button>
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map(i => (
            <div key={i.product_option_id} className="flex items-center gap-2 text-xs bg-white rounded-lg border border-gray-100 px-2.5 py-1.5">
              <span className="flex-1 truncate">{i.name} ({i.code})</span>
              <input type="number" min={1} value={i.quantity} onChange={e => setQty(i.product_option_id, Number(e.target.value))} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" />
              <button onClick={() => remove(i.product_option_id)} className="text-rose-400 hover:text-rose-600">✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Search the Cin7 catalogue…" className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5" />
            <button onClick={search} disabled={searching} className="text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 disabled:opacity-50">{searching ? "…" : "Search"}</button>
          </div>
          {err && <p className="text-xs text-rose-500">{err}</p>}
          {results.length > 0 && (
            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {results.map(p => (
                <div key={p.product_id} className="bg-white rounded-lg border border-gray-100 p-2">
                  <p className="text-xs font-semibold text-slate-700 mb-1">{p.name}{p.brand ? ` · ${p.brand}` : ""}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.options.map(o => {
                      const added = items.some(i => i.product_option_id === o.product_option_id);
                      return (
                        <button key={o.product_option_id} disabled={added} onClick={() => add(p, o)}
                          className={`text-[11px] rounded-full px-2.5 py-1 border ${added ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-gray-200 text-slate-600 hover:bg-slate-100"}`}>
                          {added ? "✓ " : "+ "}{o.code}{o.stock_available != null ? ` · ${o.stock_available} in stock` : ""}
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
