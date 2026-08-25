"use client";

// PUBLIC opening order form. Reached from a tracked Retailer Hub "order" link
// (/hub/<token> redirects here). Loads the brand's wholesale catalogue, lets
// the buyer set quantities with a live running total, and submits back against
// the token — prices are recomputed server-side on submit.
import { use, useEffect, useMemo, useState } from "react";

type Product = { id: string; category: string | null; sku: string | null; name: string; short_desc: string | null; wholesale: number; rrp: number | null; pack_qty: number };
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-sky-400";
const lbl = "block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1";

export default function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const isPreview = token === "preview";
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [brand, setBrand] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [f, setF] = useState<any>({ store_name: "", contact_name: "", email: "", phone: "", po_number: "", notes: "" });
  const [doneTotal, setDoneTotal] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const qs = isPreview ? `token=preview&brand=${encodeURIComponent(new URLSearchParams(window.location.search).get("brand") || "")}` : `token=${token}`;
    fetch(`/api/opening-order?${qs}`).then(r => r.json()).then(d => {
      if (!d.ok) { setState("invalid"); return; }
      setBrand(d.brand); setProducts(d.products || []);
      if (d.prefill) setF((prev: any) => ({ ...prev, ...Object.fromEntries(Object.entries(d.prefill).filter(([, v]) => v)) }));
      setState("ready");
    }).catch(() => setState("invalid"));
  }, [token]);

  const categories = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) m.set(p.category || "Products", [...(m.get(p.category || "Products") || []), p]);
    return [...m.entries()];
  }, [products]);

  const totals = useMemo(() => {
    let units = 0, total = 0;
    for (const p of products) {
      const q = qty[p.id] || 0;
      units += q; total += q * (p.wholesale || 0);
    }
    return { units, total: Math.round(total * 100) / 100 };
  }, [products, qty]);

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

  if (state === "loading") return <Frame><p className="text-center text-slate-400 text-sm py-16">Loading…</p></Frame>;
  if (state === "invalid") return <Frame><div className="text-center py-16"><p className="text-3xl mb-2">🔗</p><h1 className="text-lg font-bold text-slate-800">This link isn&apos;t valid</h1><p className="text-sm text-slate-500 mt-1">Please contact the Coolkidz Australia team for a fresh order link.</p></div></Frame>;
  if (state === "done") return <Frame><div className="text-center py-16"><p className="text-3xl mb-2">🎉</p><h1 className="text-lg font-bold text-slate-800">Order received</h1><p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Thanks — we&apos;ve got your opening order ({money(doneTotal)} ex GST). The Coolkidz Australia team will confirm stock and delivery shortly.</p></div></Frame>;

  return (
    <Frame wide>
      {isPreview && <p className="mb-4 text-[12.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">Preview — this is exactly what a buyer sees, but submissions are disabled. Send a real link from Retailer Hub → Order Forms.</p>}
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-slate-900">{brand ? `${brand} Opening Order` : "Opening Order"}</h1>
        <p className="text-sm text-slate-500 mt-1">Wholesale prices ex GST. Enter quantities below — your running total updates as you go.</p>
      </div>
      <form onSubmit={submit} className="space-y-5 pb-24">
        {categories.map(([cat, list]) => (
          <div key={cat} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 bg-slate-50 px-4 py-2.5 border-b border-slate-100">{cat}</h2>
            <div>
              {list.map((p, i) => (
                <div key={p.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${i > 0 ? "border-t border-slate-50" : ""}`}>
                  <div className="min-w-0 flex-1 basis-52">
                    <p className="text-[14px] font-bold text-slate-800">{p.name}</p>
                    <p className="text-[11.5px] text-slate-400">{p.sku}{p.rrp ? ` · RRP ${money(p.rrp)}` : ""}{p.pack_qty > 1 ? ` · pack of ${p.pack_qty}` : ""}</p>
                  </div>
                  <div className="text-right w-24 shrink-0">
                    <p className="text-[13.5px] font-bold text-slate-800">{money(p.wholesale)}</p>
                    <p className="text-[10px] text-slate-400 uppercase">ex GST</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => setQ(p.id, (qty[p.id] || 0) - 1)} className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 font-bold hover:border-sky-300">−</button>
                    <input inputMode="numeric" value={qty[p.id] || ""} placeholder="0" onChange={e => setQ(p.id, Number(e.target.value.replace(/\D/g, "")))}
                      className="w-14 h-9 text-center text-sm font-bold border border-slate-200 rounded-lg outline-none focus:border-sky-400" />
                    <button type="button" onClick={() => setQ(p.id, (qty[p.id] || 0) + 1)} className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 font-bold hover:border-sky-300">+</button>
                  </div>
                  <div className="text-right w-24 shrink-0 text-[13.5px] font-bold text-sky-600">{qty[p.id] ? money(qty[p.id] * p.wholesale) : <span className="text-slate-200">—</span>}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

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
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <div>
              <p className="text-[11px] text-slate-400 uppercase font-bold">{totals.units} unit{totals.units === 1 ? "" : "s"}</p>
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

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className={`${wide ? "max-w-3xl" : "max-w-2xl"} mx-auto`}>
        <div className="bg-[#132741] rounded-t-2xl px-6 py-5">
          <img src="/logos/coolkidz-logo.png" alt="Coolkidz Australia" className="h-8" />
        </div>
        <div className="bg-slate-50 border border-slate-200 border-t-0 rounded-b-2xl p-6">{children}</div>
        <p className="text-center text-[11px] text-slate-400 mt-4">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside VIC 3195</p>
      </div>
    </div>
  );
}
