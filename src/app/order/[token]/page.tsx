"use client";

// PUBLIC opening order form. Reached from a tracked Retailer Hub "order" link
// (/hub/<token> redirects here). One form can cover multiple brands — products
// group by brand (brand-coloured bands) then category, each line with photo,
// description and wholesale pricing. Totals run live; prices are recomputed
// server-side on submit. token "preview" = dashboard-only, submissions off.
import { use, useEffect, useMemo, useState } from "react";

type Product = { id: string; brand_name: string; brand_color: string; category: string | null; sku: string | null; name: string; short_desc: string | null; wholesale: number; rrp: number | null; pack_qty: number; image_url: string | null };
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-sky-400";
const lbl = "block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1";

export default function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const isPreview = token === "preview";
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [products, setProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [f, setF] = useState<any>({ store_name: "", contact_name: "", email: "", phone: "", po_number: "", notes: "" });
  const [doneTotal, setDoneTotal] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hideImg, setHideImg] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const qs = isPreview ? `token=preview&brand=${encodeURIComponent(new URLSearchParams(window.location.search).get("brand") || "")}` : `token=${token}`;
    fetch(`/api/opening-order?${qs}`).then(r => r.json()).then(d => {
      if (!d.ok) { setState("invalid"); return; }
      setProducts(d.products || []);
      if (d.prefill) setF((prev: any) => ({ ...prev, ...Object.fromEntries(Object.entries(d.prefill).filter(([, v]) => v)) }));
      setState("ready");
    }).catch(() => setState("invalid"));
  }, [token, isPreview]);

  // brand → category → products, preserving catalogue sort order
  const brandGroups = useMemo(() => {
    const brands = new Map<string, { color: string; cats: Map<string, Product[]> }>();
    for (const p of products) {
      if (!brands.has(p.brand_name)) brands.set(p.brand_name, { color: p.brand_color, cats: new Map() });
      const g = brands.get(p.brand_name)!;
      const cat = p.category || "Products";
      g.cats.set(cat, [...(g.cats.get(cat) || []), p]);
    }
    return [...brands.entries()];
  }, [products]);

  const totals = useMemo(() => {
    let units = 0, total = 0;
    for (const p of products) { const q = qty[p.id] || 0; units += q; total += q * (p.wholesale || 0); }
    return { units, total: Math.round(total * 100) / 100 };
  }, [products, qty]);
  const chosen = useMemo(() => products.filter(p => (qty[p.id] || 0) > 0), [products, qty]);

  const setQ = (id: string, v: number) => setQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(100000, Math.floor(v) || 0)) }));
  const set = (k: string) => (e: any) => setF((prev: any) => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPreview) { setErr("This is a preview — submissions only work from a real order link."); return; }
    if (totals.units === 0) { setErr("Add at least one item to the order."); return; }
    setErr(""); setBusy(true);
    const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ id, qty: q }));
    const r = await fetch("/api/opening-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...f, lines }) }).then(x => x.json()).catch(() => ({ ok: false, error: "Something went wrong — please try again." }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Something went wrong — please try again."); return; }
    setDoneTotal(r.total || totals.total);
    setState("done");
    window.scrollTo({ top: 0 });
  }

  const brandNames = brandGroups.map(([b]) => b);

  if (state === "loading") return <Frame><p className="text-center text-slate-400 text-sm py-16">Loading…</p></Frame>;
  if (state === "invalid") return <Frame><div className="text-center py-16"><p className="text-3xl mb-2">🔗</p><h1 className="text-lg font-bold text-slate-800">This link isn&apos;t valid</h1><p className="text-sm text-slate-500 mt-1">Please contact the Coolkidz Australia team for a fresh order link.</p></div></Frame>;
  if (state === "done") return <Frame><div className="text-center py-16"><p className="text-3xl mb-2">🎉</p><h1 className="text-lg font-bold text-slate-800">Order received</h1><p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Thanks — we&apos;ve got your opening order ({money(doneTotal)} ex GST). The Coolkidz Australia team will confirm stock and delivery shortly.</p></div></Frame>;

  return (
    <Frame wide hero={<>
      <p className="text-white text-[22px] font-extrabold leading-tight">{brandNames.length > 1 ? "Opening Order" : `${brandNames[0] || ""} Opening Order`}</p>
      {brandNames.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {brandGroups.map(([b, g]) => <span key={b} className="text-[11px] font-bold text-white rounded-full px-2.5 py-1" style={{ background: `${g.color}cc` }}>{b}</span>)}
        </div>
      )}
      <p className="text-[#a8bfd4] text-[12.5px] mt-2">Wholesale prices ex GST · totals update as you go · nothing is charged now</p>
    </>}>
      {isPreview && <p className="mb-5 text-[12.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">Preview — this is exactly what a buyer sees, but submissions are disabled. Send a real link from Retailer Hub → Order Forms.</p>}

      <form onSubmit={submit} className="space-y-6 pb-24">
        {brandGroups.map(([brandName, g]) => (
          <div key={brandName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{ borderTopWidth: 3, borderTopColor: g.color }}>
            <div className="flex items-center gap-2.5 px-5 py-3" style={{ background: `${g.color}10` }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
              <h2 className="text-[15px] font-extrabold text-slate-900">{brandName}</h2>
            </div>
            {[...g.cats.entries()].map(([cat, list]) => (
              <div key={cat}>
                <h3 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 bg-slate-50 px-5 py-2 border-y border-slate-100">{cat}</h3>
                {list.map((p, i) => (
                  <div key={p.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3.5 ${i > 0 ? "border-t border-slate-50" : ""} ${qty[p.id] ? "bg-sky-50/50" : ""}`}>
                    {!hideImg[p.id] && p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" onError={() => setHideImg(prev => ({ ...prev, [p.id]: true }))}
                        className="w-14 h-14 rounded-xl object-cover border border-slate-100 bg-white shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 shrink-0 flex items-center justify-center text-slate-200 text-xl">📦</div>
                    )}
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-[14px] font-bold text-slate-800 leading-snug">{p.name}</p>
                      {p.short_desc && <p className="text-[12px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{p.short_desc}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">{[p.sku, p.rrp ? `RRP ${money(p.rrp)}` : null, p.pack_qty > 1 ? `pack of ${p.pack_qty}` : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="text-right w-[88px] shrink-0">
                      <p className="text-[14px] font-extrabold text-slate-800">{money(p.wholesale)}</p>
                      <p className="text-[9.5px] text-slate-400 uppercase tracking-wide">ex GST</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" aria-label="less" onClick={() => setQ(p.id, (qty[p.id] || 0) - 1)} className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 font-bold hover:border-sky-300">−</button>
                      <input inputMode="numeric" aria-label={`${p.name} quantity`} value={qty[p.id] || ""} placeholder="0" onChange={e => setQ(p.id, Number(e.target.value.replace(/\D/g, "")))}
                        className="w-14 h-9 text-center text-sm font-bold border border-slate-200 rounded-lg outline-none focus:border-sky-400 bg-white" />
                      <button type="button" aria-label="more" onClick={() => setQ(p.id, (qty[p.id] || 0) + 1)} className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 font-bold hover:border-sky-300">+</button>
                    </div>
                    <div className="text-right w-[88px] shrink-0 text-[14px] font-extrabold text-sky-600">{qty[p.id] ? money(qty[p.id] * p.wholesale) : <span className="text-slate-200 font-normal">—</span>}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Order summary */}
        {chosen.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Your order summary</h2>
            {chosen.map(p => (
              <div key={p.id} className="flex items-center gap-3 text-[13px] py-1.5 border-b border-slate-50 last:border-0">
                <span className="font-semibold text-slate-700 flex-1 min-w-0 truncate">{p.name}</span>
                <span className="text-slate-400">{qty[p.id]} × {money(p.wholesale)}</span>
                <span className="font-bold text-slate-800 w-20 text-right">{money(qty[p.id] * p.wholesale)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-slate-100">
              <span className="text-[13px] font-bold text-slate-500">{totals.units} unit{totals.units === 1 ? "" : "s"} · total ex GST</span>
              <span className="text-[17px] font-extrabold text-slate-900">{money(totals.total)}</span>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3.5">Your details</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={lbl}>Store / business name *</label><input required className={inp} value={f.store_name} onChange={set("store_name")} /></div>
            <div><label className={lbl}>Contact name</label><input className={inp} value={f.contact_name} onChange={set("contact_name")} /></div>
            <div><label className={lbl}>Email *</label><input required type="email" className={inp} value={f.email} onChange={set("email")} /></div>
            <div><label className={lbl}>Phone</label><input className={inp} value={f.phone} onChange={set("phone")} /></div>
            <div><label className={lbl}>PO number (optional)</label><input className={inp} value={f.po_number} onChange={set("po_number")} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Notes</label><textarea rows={2} className={inp} value={f.notes} onChange={set("notes")} placeholder="Delivery instructions, requested timing…" /></div>
          </div>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}

        {/* Sticky total bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 z-10">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <div>
              <p className="text-[11px] text-slate-400 uppercase font-bold">{totals.units} unit{totals.units === 1 ? "" : "s"}{chosen.length ? ` · ${chosen.length} line${chosen.length === 1 ? "" : "s"}` : ""}</p>
              <p className="text-lg font-extrabold text-slate-900">{money(totals.total)} <span className="text-[11px] font-semibold text-slate-400">ex GST</span></p>
            </div>
            <button type="submit" disabled={busy || totals.units === 0} className="ml-auto bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl px-8 py-3">
              {busy ? "Submitting…" : "Submit order →"}
            </button>
          </div>
        </div>
      </form>
    </Frame>
  );
}

function Frame({ children, wide, hero }: { children: React.ReactNode; wide?: boolean; hero?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className={`${wide ? "max-w-3xl" : "max-w-2xl"} mx-auto`}>
        <div className="bg-[#132741] rounded-t-2xl px-6 py-6">
          <img src="/logos/coolkidz-logo.png" alt="Coolkidz Australia" className="h-8" />
          {hero && <div className="mt-4">{hero}</div>}
        </div>
        <div className="bg-slate-50 border border-slate-200 border-t-0 rounded-b-2xl p-5 sm:p-6">{children}</div>
        <p className="text-center text-[11px] text-slate-400 mt-4">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside VIC 3195</p>
      </div>
    </div>
  );
}
