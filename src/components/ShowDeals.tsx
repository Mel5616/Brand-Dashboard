"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tradeshow, Brand } from "@/lib/db";

// Tradeshow Deals — per-show, per-brand deal entry feeding a printable deal sheet.
// Cost/margin are admin-only; a deal below the portfolio margin floor can't go
// active without an approver (enforced server-side too).

type Deal = {
  id: string; show_id: string; brand: string; scope: string; product_code: string | null; product_name: string | null;
  range_label: string | null; mechanic: string; discount_type: string | null; discount_value: number | null;
  rrp: number | null; cost_price?: number | null; show_price: number | null;
  gift_code: string | null; gift_label: string | null; gift_value: number | null; gift_cost?: number | null; gift_qty: number | null;
  gwp_trigger: string | null; min_spend: number | null; stock_cap: number | null; auto_add: boolean;
  valid_from: string | null; valid_to: string | null; channel: string; stackable: boolean; one_per_customer: boolean;
  status: string; approved_by: string | null; notes: string | null;
};
type Product = { style_code: string; product_name: string; brand: string | null; rrp: number | null };

const aud = (n: number | null | undefined) => n == null ? "—" : "$" + Number(n).toLocaleString("en-AU", { maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;
const SCOPES = [["whole_brand", "Whole brand"], ["range", "Range"], ["product", "Product"], ["bundle", "Bundle"]] as const;
const CHANNELS = [["d2c_booth", "D2C booth"], ["retail", "Retail"], ["both", "Both"]] as const;
const scopeLabel = (s: string) => SCOPES.find(x => x[0] === s)?.[1] ?? s;

function calcShow(mechanic: string, dtype: string, rrp: number, dval: number, fixedShow: number) {
  if (mechanic !== "discount") return fixedShow || rrp;
  if (dtype === "pct_off") return round2(rrp * (1 - dval / 100));
  if (dtype === "amount_off") return round2(rrp - dval);
  if (dtype === "fixed_price") return fixedShow;
  return rrp;
}

export function ShowDeals({ tradeshows, brands }: { tradeshows: Tradeshow[]; brands: Brand[] }) {
  const shows = useMemo(() => [...tradeshows].sort((a, b) => a.date_start.localeCompare(b.date_start)), [tradeshows]);
  const nextShow = shows.find(s => s.date_end >= new Date().toISOString().slice(0, 10)) ?? shows[shows.length - 1];
  const [showId, setShowId] = useState<string>(nextShow?.id ?? "");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [marginFloor, setMarginFloor] = useState(20);
  const [admin, setAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [editing, setEditing] = useState<Deal | null | "new">(null);
  const [floorEdit, setFloorEdit] = useState(false);
  const [floorDraft, setFloorDraft] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const show = shows.find(s => s.id === showId);
  const brandNames = brands.map(b => b.name);

  async function load() {
    const [d, p] = await Promise.all([
      fetch(`/api/deals?show_id=${encodeURIComponent(showId)}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/influencer/products").then(r => r.json()).catch(() => ({ products: [] })),
    ]);
    if (d.needsSetup) { setState("needsSetup"); return; }
    if (!d.ok) { setState("error"); return; }
    setDeals(d.deals || []); setMarginFloor(d.marginFloor ?? 20); setAdmin(!!d.admin); setCanManage(!!d.canManage);
    setProducts(p.products || []); setState("ready");
  }
  useEffect(() => { if (showId) load(); /* eslint-disable-next-line */ }, [showId]);

  async function saveFloor() {
    const n = Number(floorDraft.replace(/[^0-9.]/g, "")) || 0;
    setMarginFloor(n); setFloorEdit(false);
    await fetch("/api/deals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ margin_floor: n }) }).catch(() => {});
  }
  async function remove(id: string) {
    if (!window.confirm("Remove this deal?")) return;
    await fetch(`/api/deals?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }
  useEffect(() => { setShareUrl(""); setCopied(false); }, [showId]);
  async function share() {
    if (shareUrl) { setShareUrl(""); return; }   // toggle the panel closed
    const r = await fetch("/api/deals/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ show_id: showId }) }).then(x => x.json()).catch(() => null);
    if (r?.token) setShareUrl(`${window.location.origin}/deals/${r.token}`);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked */ }
  }

  function printSheet() {
    if (!show) return;
    const esc = (t: string) => (t || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const active = deals.filter(d => d.status === "active");
    const list = (active.length ? active : deals);
    const dealLine = (d: Deal) => {
      const who = d.scope === "product" || d.scope === "bundle" ? (d.product_name || d.brand) : d.scope === "range" ? `${d.brand} · ${d.range_label || "range"}` : `${d.brand} (whole range)`;
      let offer = "";
      if (d.mechanic === "gwp") offer = `Free ${d.gift_label || d.gift_code || "gift"}${d.gift_value ? ` (worth ${aud(d.gift_value)})` : ""} with any ${d.scope === "whole_brand" ? d.brand : d.product_name || "purchase"}`;
      else if (d.discount_type === "pct_off") offer = `${d.discount_value}% off${d.show_price ? ` — now ${aud(d.show_price)}` : ""}`;
      else if (d.discount_type === "amount_off") offer = `${aud(d.discount_value)} off${d.show_price ? ` — now ${aud(d.show_price)}` : ""}`;
      else if (d.discount_type === "fixed_price") offer = `Show price ${aud(d.show_price)}${d.rrp ? ` (RRP ${aud(d.rrp)})` : ""}`;
      const extra = [d.range_label ? `Colours: ${esc(d.range_label)}` : "", d.gift_label && d.mechanic !== "gwp" ? `Includes (free): ${esc(d.gift_label)}` : ""].filter(Boolean).join("<br>");
      return `<tr><td><b>${esc(who)}</b></td><td>${esc(offer)}${extra ? `<div style="color:#64748b;font-size:11px;margin-top:3px">${extra}</div>` : ""}</td></tr>`;
    };
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(show.name)} — Deal Sheet</title>
      <style>@page{size:A4;margin:14mm}*{-webkit-print-color-adjust:exact}body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b}
      h1{font-size:22px;margin:0}.sub{color:#64748b;margin:2px 0 16px}
      table{width:100%;border-collapse:collapse}td{padding:8px 6px;border-bottom:1px solid #eef2f7;vertical-align:top}
      td:first-child{width:38%}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#0e7490;margin:18px 0 6px}
      .foot{color:#94a3b8;font-size:10px;margin-top:20px;border-top:1px solid #eef2f7;padding-top:8px}</style></head><body>
      <h1>${esc(show.name)} — Show Deals</h1>
      <div class="sub">${esc(show.location || "")}${show.location ? " · " : ""}${show.date_start}${show.date_end !== show.date_start ? " to " + show.date_end : ""}</div>
      <table><tbody>${list.map(dealLine).join("")}</tbody></table>
      <p class="foot">Coolkidz Marketing Command Centre · generated ${new Date().toLocaleString("en-AU")} · prices ex-GST unless stated</p>
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_show_deals.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load deals.</div>;

  return (
    <div className="space-y-4">
      {/* Show + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={showId} onChange={e => { setShowId(e.target.value); setEditing(null); }} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          {shows.map(s => <option key={s.id} value={s.id}>{s.name} · {s.date_start}</option>)}
        </select>
        <span className="text-[11px] text-gray-400">{deals.length} deal{deals.length === 1 ? "" : "s"}</span>
        {admin && (
          <span className="text-[11px] text-gray-400 flex items-center gap-1">· margin floor {floorEdit ? (
            <>
              <input autoFocus value={floorDraft} onChange={e => setFloorDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveFloor(); }} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" />%
              <button onClick={saveFloor} className="text-emerald-600 font-semibold">save</button>
            </>
          ) : <><b className="text-slate-600">{marginFloor}%</b><button onClick={() => { setFloorDraft(String(marginFloor)); setFloorEdit(true); }} className="text-emerald-600 hover:underline">edit</button></>}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canManage && <button onClick={share} className="text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg px-3 py-2 hover:bg-teal-100">🔗 Share link</button>}
          <button onClick={printSheet} className="text-xs font-semibold text-slate-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">⤓ Print</button>
          {canManage && <button onClick={() => setEditing(editing === "new" ? null : "new")} className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">{editing === "new" ? "Close" : "+ Add deal"}</button>}
        </div>
      </div>
      {shareUrl && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
          <span className="text-teal-700 font-semibold shrink-0">Shareable deal sheet:</span>
          <span className="text-slate-500 truncate flex-1 min-w-[160px]">{shareUrl}</span>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md px-3 py-1">View ↗</a>
          <button onClick={copyLink} className="shrink-0 font-semibold text-teal-700 border border-teal-300 rounded-md px-3 py-1 hover:bg-teal-100">{copied ? "✓ Copied" : "Copy link"}</button>
        </div>
      )}

      {editing !== null && (
        <DealForm show={show!} deal={editing === "new" ? null : editing} brandNames={brandNames} products={products}
          admin={admin} marginFloor={marginFloor}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      {/* Deal list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-3 py-3">Brand</th><th className="text-left font-semibold px-3 py-3">Scope</th>
              <th className="text-left font-semibold px-3 py-3">Deal</th><th className="text-right font-semibold px-3 py-3">RRP</th>
              <th className="text-right font-semibold px-3 py-3">Show price</th>{admin && <th className="text-right font-semibold px-3 py-3">Margin</th>}
              <th className="text-left font-semibold px-3 py-3">Status</th>{canManage && <th className="px-3 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {deals.map(d => {
              const cost = (d.cost_price ?? 0) + (d.mechanic === "gwp" ? (d.gift_cost ?? 0) * (d.gift_qty || 1) : 0);
              const margin = d.show_price && d.show_price > 0 ? ((d.show_price - cost) / d.show_price) * 100 : null;
              const below = margin != null && margin < marginFloor;
              const expired = d.valid_to && d.valid_to < new Date().toISOString().slice(0, 10);
              const label = d.mechanic === "gwp" ? `GWP: ${d.gift_label || d.gift_code || "gift"}` : d.discount_type === "pct_off" ? `${d.discount_value}% off` : d.discount_type === "amount_off" ? `${aud(d.discount_value)} off` : `Fixed ${aud(d.show_price)}`;
              return (
                <tr key={d.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-medium text-slate-700">{d.brand}</td>
                  <td className="px-3 py-2 text-slate-500">{scopeLabel(d.scope)}{d.product_name ? <span className="block text-[11px] text-gray-400 truncate max-w-[180px]">{d.product_name}</span> : d.range_label ? <span className="block text-[11px] text-gray-400">{d.range_label}</span> : null}</td>
                  <td className="px-3 py-2 text-slate-600">{label}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{aud(d.rrp)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{aud(d.show_price)}</td>
                  {admin && <td className={`px-3 py-2 text-right font-semibold ${below ? "text-rose-600" : "text-slate-600"}`}>{margin != null ? margin.toFixed(0) + "%" : "—"}</td>}
                  <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${expired ? "bg-gray-100 text-gray-400" : d.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{expired ? "Expired" : d.status === "active" ? "Active" : "Draft"}</span></td>
                  {canManage && <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => setEditing(d)} className="text-xs text-emerald-600 hover:underline mr-2">Edit</button><button onClick={() => remove(d.id)} className="text-xs text-rose-400 hover:underline">Delete</button></td>}
                </tr>
              );
            })}
            {deals.length === 0 && <tr><td colSpan={admin ? 8 : 6} className="px-4 py-8 text-center text-slate-300">No deals for this show yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DealForm({ show, deal, brandNames, products, admin, marginFloor, onClose, onSaved }: {
  show: Tradeshow; deal: Deal | null; brandNames: string[]; products: Product[]; admin: boolean; marginFloor: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [brand, setBrand] = useState(deal?.brand ?? brandNames[0] ?? "");
  const [scope, setScope] = useState(deal?.scope ?? "product");
  const [search, setSearch] = useState(deal?.product_name ?? "");
  const [productCode, setProductCode] = useState<string | null>(deal?.product_code ?? null);
  const [rangeLabel, setRangeLabel] = useState(deal?.range_label ?? "");
  const [mechanic, setMechanic] = useState(deal?.mechanic ?? "discount");
  const [dtype, setDtype] = useState(deal?.discount_type ?? "pct_off");
  const [dval, setDval] = useState(deal?.discount_value != null ? String(deal.discount_value) : "");
  const [rrp, setRrp] = useState(deal?.rrp != null ? String(deal.rrp) : "");
  const [cost, setCost] = useState(deal?.cost_price != null ? String(deal.cost_price) : "");
  const [fixedShow, setFixedShow] = useState(deal?.discount_type === "fixed_price" && deal?.show_price != null ? String(deal.show_price) : "");
  const [giftLabel, setGiftLabel] = useState(deal?.gift_label ?? "");
  const [giftValue, setGiftValue] = useState(deal?.gift_value != null ? String(deal.gift_value) : "");
  const [giftCost, setGiftCost] = useState(deal?.gift_cost != null ? String(deal.gift_cost) : "");
  const [giftQty, setGiftQty] = useState(deal?.gift_qty != null ? String(deal.gift_qty) : "1");
  const [trigger, setTrigger] = useState(deal?.gwp_trigger ?? "any_purchase");
  const [minSpend, setMinSpend] = useState(deal?.min_spend != null ? String(deal.min_spend) : "");
  const [autoAdd, setAutoAdd] = useState(deal?.auto_add ?? true);
  const [stockCap, setStockCap] = useState(deal?.stock_cap != null ? String(deal.stock_cap) : "");
  const [validFrom, setValidFrom] = useState(deal?.valid_from ?? show.date_start);
  const [validTo, setValidTo] = useState(deal?.valid_to ?? show.date_end);
  const [channel, setChannel] = useState(deal?.channel ?? "d2c_booth");
  const [stackable, setStackable] = useState(deal?.stackable ?? false);
  const [status, setStatus] = useState(deal?.status ?? "draft");
  const [approvedBy, setApprovedBy] = useState(deal?.approved_by ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isProductScope = scope === "product" || scope === "bundle";
  const matches = search.trim().length < 2 || productCode ? [] : products.filter(p => `${p.product_name} ${p.style_code}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  function pick(p: Product) {
    setProductCode(p.style_code); setSearch(p.product_name); if (p.rrp != null) setRrp(String(p.rrp));
    if (admin) fetch(`/api/deals?cost_code=${encodeURIComponent(p.style_code)}`).then(r => r.json()).then(j => { if (j?.cost_price != null) setCost(String(j.cost_price)); }).catch(() => {});
  }

  const rrpN = Number(rrp) || 0, dvalN = Number(dval) || 0, fixedN = Number(fixedShow) || 0;
  const showPrice = calcShow(mechanic, dtype, rrpN, dvalN, fixedN);
  const costN = (Number(cost) || 0) + (mechanic === "gwp" ? (Number(giftCost) || 0) * (Number(giftQty) || 1) : 0);
  const margin = showPrice > 0 ? ((showPrice - costN) / showPrice) * 100 : null;
  const belowFloor = admin && margin != null && margin < marginFloor;

  const valid = brand && (isProductScope ? !!productCode || !!search : true) && (mechanic === "discount" ? dtype && (dtype === "fixed_price" ? fixedShow : dval) : (giftLabel));

  async function save() {
    setBusy(true); setErr("");
    const body: any = {
      id: deal?.id, show_id: show.id, brand, scope,
      product_code: isProductScope ? productCode : null, product_name: isProductScope ? (search || null) : null, range_label: rangeLabel || null,
      mechanic, discount_type: mechanic === "discount" ? dtype : null, discount_value: mechanic === "discount" ? dval : null,
      rrp, cost_price: cost, show_price: dtype === "fixed_price" ? fixedShow : showPrice,
      gift_label: giftLabel || null, gift_value: mechanic === "gwp" ? giftValue : null, gift_cost: mechanic === "gwp" ? giftCost : null, gift_qty: giftQty,
      gwp_trigger: mechanic === "gwp" ? trigger : null, min_spend: trigger === "min_spend" ? minSpend : null, auto_add: autoAdd, stock_cap: stockCap,
      valid_from: validFrom, valid_to: validTo, channel, stackable,
      status, approved_by: approvedBy || null, notes,
    };
    const res = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (res.error === "below_floor") { setErr(`Margin ${res.margin}% is below the ${res.floor}% floor — add an approver to save this deal active.`); return; }
    if (!res.ok) { setErr("Couldn’t save."); return; }
    onSaved();
  }

  const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400";
  const lbl = "text-[10px] font-semibold text-slate-400 uppercase";
  const Radio = ({ opts, val, set }: { opts: readonly (readonly string[])[]; val: string; set: (v: string) => void }) => (
    <div className="inline-flex flex-wrap bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {opts.map(([v, l]) => <button key={v} onClick={() => set(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${val === v ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{l}</button>)}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{deal ? "Edit deal" : "Add deal"}</h3>
        <span className="text-[11px] text-gray-400">{show.name} · {show.date_start}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div><label className={lbl}>Brand</label><select value={brand} onChange={e => setBrand(e.target.value)} className={inp + " bg-white"}>{brandNames.map(b => <option key={b}>{b}</option>)}</select></div>
        <div><label className={lbl}>Scope</label><div className="mt-0.5"><Radio opts={SCOPES} val={scope} set={setScope} /></div></div>
      </div>

      {isProductScope ? (
        <div className="relative">
          <label className={lbl}>Product</label>
          <input value={search} onChange={e => { setSearch(e.target.value); setProductCode(null); }} placeholder="Search name or SKU…" className={inp} />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {matches.map(p => <button key={p.style_code} onClick={() => pick(p)} className="block w-full text-left text-sm px-3 py-2 hover:bg-emerald-50"><span className="text-slate-700">{p.product_name}</span><span className="text-gray-400 text-xs"> · {p.style_code} · {aud(p.rrp)}</span></button>)}
            </div>
          )}
        </div>
      ) : scope === "range" ? (
        <div><label className={lbl}>Range label</label><input value={rangeLabel} onChange={e => setRangeLabel(e.target.value)} placeholder="e.g. Bubba's range" className={inp} /></div>
      ) : (
        <p className="text-[11px] text-gray-400">Applies across the whole {brand} range — show prices resolve per SKU from the product master.</p>
      )}

      {/* Colours + bundle contents (shown on the deal sheet) */}
      {isProductScope && (
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className={lbl}>Colours / variants</label><input value={rangeLabel} onChange={e => setRangeLabel(e.target.value)} placeholder="e.g. Greyson, Evelyn, Ada" className={inp} /></div>
          {mechanic === "discount" && <div><label className={lbl}>Bundle includes — free (comma-separated)</label><input value={giftLabel} onChange={e => setGiftLabel(e.target.value)} placeholder="e.g. Cup Holder, Snack Tray, Parent Organiser" className={inp} /></div>}
        </div>
      )}

      {/* Mechanic */}
      <div><label className={lbl}>Mechanic</label><div className="mt-0.5"><Radio opts={[["discount", "Discount"], ["gwp", "Gift with purchase"]]} val={mechanic} set={setMechanic} /></div></div>

      {mechanic === "discount" ? (
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className={lbl}>Discount type</label><select value={dtype} onChange={e => setDtype(e.target.value)} className={inp + " bg-white"}><option value="pct_off">Percentage off</option><option value="amount_off">Dollar amount off</option><option value="fixed_price">Fixed show price</option></select></div>
          {dtype === "fixed_price"
            ? <div><label className={lbl}>Show price $</label><input value={fixedShow} onChange={e => setFixedShow(e.target.value)} inputMode="decimal" className={inp} /></div>
            : <div><label className={lbl}>{dtype === "pct_off" ? "Percent off" : "Dollars off"}</label><input value={dval} onChange={e => setDval(e.target.value)} inputMode="decimal" className={inp} /></div>}
          <div><label className={lbl}>RRP $</label><input value={rrp} onChange={e => setRrp(e.target.value)} inputMode="decimal" placeholder="auto from SKU" className={inp} /></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2"><label className={lbl}>Gift (name)</label><input value={giftLabel} onChange={e => setGiftLabel(e.target.value)} placeholder="e.g. Changing bag" className={inp} /></div>
          <div><label className={lbl}>Gift value $ (for "worth $X")</label><input value={giftValue} onChange={e => setGiftValue(e.target.value)} inputMode="decimal" className={inp} /></div>
          <div><label className={lbl}>Qty per purchase</label><input value={giftQty} onChange={e => setGiftQty(e.target.value)} inputMode="numeric" className={inp} /></div>
          <div><label className={lbl}>Trigger</label><select value={trigger} onChange={e => setTrigger(e.target.value)} className={inp + " bg-white"}><option value="any_purchase">Any qualifying purchase</option><option value="min_spend">Minimum spend</option><option value="specific_sku">Specific SKU</option></select></div>
          {trigger === "min_spend" && <div><label className={lbl}>Min spend $</label><input value={minSpend} onChange={e => setMinSpend(e.target.value)} inputMode="decimal" className={inp} /></div>}
          <div><label className={lbl}>Stock cap (optional)</label><input value={stockCap} onChange={e => setStockCap(e.target.value)} inputMode="numeric" placeholder="while stocks last" className={inp} /></div>
          <label className="flex items-center gap-2 text-xs text-slate-600 mt-5"><input type="checkbox" checked={autoAdd} onChange={e => setAutoAdd(e.target.checked)} /> Auto-add at checkout</label>
        </div>
      )}

      {/* Pricing + live margin (admin) */}
      <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-500">Show price <b className="text-slate-800">{aud(round2(showPrice))}</b></span>
        {admin && <span className="text-slate-500 flex items-center gap-1">Cost $<input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="auto" className="w-20 text-xs border border-gray-200 rounded px-1.5 py-0.5" /></span>}
        {admin && <span className={belowFloor ? "text-rose-600 font-semibold" : "text-emerald-600 font-semibold"}>Margin {margin != null ? margin.toFixed(0) + "%" : "—"}{belowFloor ? ` · below ${marginFloor}% floor` : ""}</span>}
      </div>

      {belowFloor && status === "active" && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-[13px] text-rose-700">
          This deal is below the {marginFloor}% margin floor. Enter an approver to make it active.
          <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Approved by" className="ml-2 text-sm border border-rose-200 rounded px-2 py-1 w-40" />
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        <div><label className={lbl}>Valid from</label><input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Valid to</label><input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Channel</label><select value={channel} onChange={e => setChannel(e.target.value)} className={inp + " bg-white"}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className={lbl}>Status</label><select value={status} onChange={e => setStatus(e.target.value)} className={inp + " bg-white"}><option value="draft">Draft</option><option value="active">Active</option></select></div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={stackable} onChange={e => setStackable(e.target.checked)} /> Stackable with other deals</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
      </div>

      {err && <p className="text-[13px] text-rose-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button onClick={save} disabled={!valid || busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Saving…" : deal ? "Save deal" : "Add deal"}</button>
      </div>
    </div>
  );
}
