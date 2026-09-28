"use client";

import { useEffect, useState } from "react";

// Same product-entry UX as Influencer Agreements' "Products gifted" —
// same catalogue (influencer_products via /api/influencer/products),
// search-as-you-type with real RRP, add multiple rows. Used by the
// Giveaway and Product Request forms so products appear the same way
// instead of a blind free-text description.
export type GiftItem = { product_name: string; variant: string; style_code: string | null; quantity: number; rrp: number | null };
type CatalogProduct = { style_code: string; product_name: string; brand: string | null; rrp: number | null };

const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400";
export const emptyGiftItem: GiftItem = { product_name: "", variant: "", style_code: null, quantity: 1, rrp: null };

export function giftItemsSummary(items: GiftItem[]): string {
  return items.filter(i => i.product_name.trim()).map(i => `${i.quantity}x ${i.product_name}${i.variant ? ` (${i.variant})` : ""}`).join(", ");
}

export function GiftCatalogPicker({ items, onChange, brandName, endpoint = "/api/influencer/products" }: { items: GiftItem[]; onChange: (items: GiftItem[]) => void; brandName?: string; endpoint?: string }) {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [openRow, setOpenRow] = useState<number | null>(null);

  useEffect(() => { fetch(endpoint).then(r => r.json()).then(d => setCatalog(d?.products ?? [])).catch(() => {}); }, [endpoint]);

  const matches = (q: string) => {
    // Word-by-word AND match (not one big substring) — see InfluencerAgreements.tsx's
    // catalogMatches for why: a slightly different word order or extra word
    // shouldn't hide a SKU that's genuinely in the catalogue.
    const words = q.trim().toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    if (!words.length) return [];
    const inBrand = brandName ? catalog.filter(p => p.brand?.toLowerCase() === brandName.toLowerCase()) : catalog;
    const pool = inBrand.length ? inBrand : catalog;
    return pool
      .filter(p => { const hay = `${p.product_name} ${p.style_code}`.toLowerCase(); return words.every(w => hay.includes(w)); })
      .slice(0, 8);
  };

  const rows = items.length ? items : [{ ...emptyGiftItem }];
  function set(i: number, patch: Partial<GiftItem>) {
    const next = rows.map((x, j) => (j === i ? { ...x, ...patch } : x));
    onChange(next);
  }
  function add() { onChange([...rows, { ...emptyGiftItem }]); }
  function remove(i: number) { onChange(rows.filter((_, j) => j !== i)); }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Products *</label>
        <button type="button" onClick={add} className="text-xs font-semibold text-emerald-600">+ Add product</button>
      </div>
      <div className="space-y-2">
        {rows.map((p, i) => {
          const rowMatches = openRow === i ? matches(p.product_name) : [];
          return (
            <div key={i} className="grid grid-cols-[1fr_1fr_50px_70px_24px] gap-2 items-center relative">
              <div className="relative">
                <input value={p.product_name} autoComplete="off"
                  onChange={e => { set(i, { product_name: e.target.value, style_code: null }); setOpenRow(i); }}
                  onFocus={() => setOpenRow(i)} onBlur={() => setTimeout(() => setOpenRow(o => (o === i ? null : o)), 150)}
                  placeholder="Product — search the catalogue" className={inp} />
                {rowMatches.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {rowMatches.map(m => (
                      <button key={m.style_code} type="button"
                        onMouseDown={() => { set(i, { product_name: m.product_name, style_code: m.style_code, rrp: m.rrp }); setOpenRow(null); }}
                        className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                        <div className="font-semibold text-slate-700">{m.product_name}</div>
                        <div className="text-gray-400 text-[11px]">{m.brand} · {m.style_code} · RRP {m.rrp != null ? `$${m.rrp}` : "—"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={p.variant} onChange={e => set(i, { variant: e.target.value })} placeholder="Variant" className={inp} />
              <input type="number" min={1} value={p.quantity} onChange={e => set(i, { quantity: Number(e.target.value) || 1 })} className={inp} />
              <input type="number" value={p.rrp ?? ""} onChange={e => set(i, { rrp: e.target.value === "" ? null : Number(e.target.value) })} placeholder="RRP" className={inp} />
              {rows.length > 1 && <button type="button" onClick={() => remove(i)} className="text-gray-300 hover:text-rose-500">✕</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
