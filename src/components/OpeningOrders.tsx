"use client";

// Retailer Hub → Order Forms: send tokenised opening-order links (buyer sets
// quantities against live wholesale pricing at /order/<token>) and review what
// comes back. Catalogues are seeded per brand from the trade price lists.
import { useEffect, useState } from "react";
import { HubSendModal, SendRow } from "./HubSendModal";

const money = (n: number) => `$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dShort = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function OpeningOrders({ canEdit, admin }: { canEdit: boolean; admin: boolean }) {
  const [brands, setBrands] = useState<{ brand: string; products: number }[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  function load() {
    fetch("/api/order-forms", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      if (!d.ok) { setState("error"); return; }
      setBrands(d.brands || []); setOrders(d.orders || []); setState("ready");
    }).catch(() => setState("error"));
    fetch("/api/hub-send?kind=order", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.ok) setSends(d.sends || []); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    await fetch(`/api/order-forms?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => {});
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this order link?")) return;
    await fetch(`/api/hub-send?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_opening_orders.sql</code> in Supabase, then reload (Mel seeds each brand&apos;s catalogue from its trade price list).</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load.</div>;

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-slate-500">Send a buyer a tokenised opening-order link — they set quantities against live wholesale pricing, and the submitted order lands here (and emails marketing@). Catalogues are seeded from each brand&apos;s trade price list.</p>

      {/* Build an order form — tick the brands to include */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Build an order form — tick the brands to include</h3>
        {brands.length === 0 ? (
          <p className="text-slate-300 text-sm">No catalogues loaded yet — ask Mel to seed a brand from its trade price list.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {brands.map(b => {
                const on = selected.has(b.brand);
                return (
                  <label key={b.brand} className={`flex items-center gap-2 cursor-pointer rounded-xl border px-3.5 py-2.5 transition-colors ${on ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white hover:border-sky-200"}`}>
                    <input type="checkbox" checked={on} onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(b.brand)) n.delete(b.brand); else n.add(b.brand); return n; })} className="accent-sky-500" />
                    <span>
                      <span className="block text-[13.5px] font-bold text-slate-800">{b.brand}</span>
                      <span className="block text-[10.5px] text-slate-400">{b.products} products</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={`/order/preview?brand=${encodeURIComponent([...selected].join(","))}`} target="_blank" rel="noopener noreferrer"
                className={`text-[12.5px] font-semibold border rounded-lg px-4 py-2 ${selected.size ? "text-slate-600 border-slate-200 hover:border-sky-300" : "text-slate-300 border-slate-100 pointer-events-none"}`}>
                Preview {selected.size > 1 ? `combined form (${selected.size})` : "form"}
              </a>
              {canEdit && (
                <button onClick={() => setSending(true)} disabled={selected.size === 0}
                  className="text-[12.5px] font-bold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-30 rounded-lg px-4 py-2">
                  Send {selected.size > 1 ? `${selected.size}-brand order form` : "order form"} →
                </button>
              )}
              <p className="text-[11px] text-slate-400 ml-auto">Ticking several brands builds one combined form, grouped by brand.</p>
            </div>
          </>
        )}
      </div>

      {/* Links sent */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Order links sent</h3>
        {sends.length === 0 ? <p className="text-sm text-slate-300 py-2">No order links sent yet.</p> : sends.map(s => <SendRow key={s.id} s={s} admin={admin} onRevoke={revoke} />)}
      </div>

      {/* Orders received */}
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Orders received ({orders.length})</h3>
        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-slate-300">No orders yet.</div>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 cursor-pointer" onClick={() => setOpen(open === o.id ? null : o.id)}>
                  <span className="text-sm font-bold text-slate-800">{o.store_name}</span>
                  {o.brand_name && <span className="text-[11.5px] font-semibold text-violet-600">{o.brand_name}</span>}
                  <span className="text-[12px] text-slate-400">{o.contact_name} · {o.email}</span>
                  <span className="text-[12px] text-slate-300">{dShort(o.created_at)}</span>
                  <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${o.status === "processed" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>{o.status}</span>
                  <span className="ml-auto text-[13.5px] font-extrabold text-slate-800">{money(o.total_ex_gst)} <span className="text-[10px] font-semibold text-slate-400">ex GST</span></span>
                  <span className="text-slate-300 text-xs">{open === o.id ? "▲" : "▼"}</span>
                </div>
                {open === o.id && (
                  <div className="mt-3 pt-3 border-t border-slate-50">
                    <table className="w-full text-[12.5px]">
                      <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="py-1">SKU</th><th className="py-1">Product</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Each</th><th className="py-1 text-right">Total</th>
                      </tr></thead>
                      <tbody>
                        {(o.lines || []).map((l: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="py-1.5 font-mono text-[11.5px] text-slate-400">{l.sku || "—"}</td>
                            <td className="py-1.5 font-semibold text-slate-700">{l.name}</td>
                            <td className="py-1.5 text-right text-slate-600">{l.qty}</td>
                            <td className="py-1.5 text-right text-slate-600">{money(l.wholesale)}</td>
                            <td className="py-1.5 text-right font-bold text-slate-800">{money(l.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(o.po_number || o.phone || o.notes) && (
                      <p className="text-[12px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mt-2 whitespace-pre-line">{[o.po_number ? `PO ${o.po_number}` : null, o.phone].filter(Boolean).join(" · ")}{o.notes ? `\n${o.notes}` : ""}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {canEdit && o.status !== "processed" && <button onClick={() => setStatus(o.id, "processed")} className="text-[12px] font-semibold rounded-lg px-3 py-1.5 border border-slate-200 text-slate-600 hover:border-emerald-300">Mark processed</button>}
                      {canEdit && o.status === "processed" && <button onClick={() => setStatus(o.id, "new")} className="text-[12px] font-semibold rounded-lg px-3 py-1.5 border border-slate-200 text-slate-500">Reopen</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {sending && selected.size > 0 && (
        <HubSendModal
          items={[{
            kind: "order",
            title: `${[...selected].join(" + ")} Opening Order Form`,
            brand: [...selected].join(", "),
          }]}
          onClose={() => setSending(false)}
          onSent={load}
        />
      )}
    </div>
  );
}
