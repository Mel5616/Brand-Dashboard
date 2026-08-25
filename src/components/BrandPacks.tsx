"use client";

// Retailer Hub → Brands: everything for one brand in one place. A card per
// brand showing its current overview, price lists and fact sheet, with
// tick-boxes to bundle any of them (plus the application form) into ONE
// tracked email — each document still gets its own /hub/<token> open tracking.
// The per-type tabs remain the place to upload/version documents.
import { useEffect, useMemo, useState } from "react";
import { HubSendModal, type SendItem } from "./HubSendModal";

type Doc = { id: string; category: string; brand_name: string | null; title: string; version: string; html_url: string | null; pdf_url: string | null; created_at: string };
type Sheet = { id: string; brand_name: string; html_url: string | null; pdf_url: string | null; version: string };

const CAT_LABEL: Record<string, string> = { brand_overview: "Brand Overview", price_list: "Price List", fact_sheet: "Fact Sheet" };

export function BrandPacks({ brands }: { brands: { name: string; color?: string }[] }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sends, setSends] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  // per-brand selected item keys ("kind:id"); default = everything the brand has
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [sendBrand, setSendBrand] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/sales-docs", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/fact-sheets", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/hub-send", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
    ]).then(([d, f, s]) => {
      if (d.needsSetup) { setState("needsSetup"); return; }
      if (!d.ok) { setState("error"); return; }
      setDocs((d.docs || []).filter((x: Doc) => x.category === "price_list" || x.category === "brand_overview"));
      if (f.ok) setSheets(f.sheets || []);
      if (s.ok) setSends(s.sends || []);
      setState("ready");
    });
  }, []);

  // Build each brand's pack: overview(s) + price list(s) + fact sheet + form.
  const packs = useMemo(() => brands.map(b => {
    const items: (SendItem & { key: string; meta: string })[] = [];
    for (const d of docs.filter(x => x.brand_name === b.name).sort((x, y) => x.category.localeCompare(y.category))) {
      items.push({ kind: d.category as SendItem["kind"], id: d.id, title: d.title, brand: b.name, key: `${d.category}:${d.id}`, meta: `${CAT_LABEL[d.category] || d.category} · v${d.version}` });
    }
    const sheet = sheets.find(s => s.brand_name === b.name);
    if (sheet) items.push({ kind: "fact_sheet", id: sheet.id, title: `${b.name} Fact Sheet`, brand: b.name, key: `fact_sheet:${sheet.id}`, meta: `Fact Sheet · v${sheet.version}` });
    // One company-wide form (covers all brands) — offered in every pack so a
    // new account can open trade alongside the brand documents.
    items.push({ kind: "form", title: "Credit Application Form", brand: null, key: "form", meta: "Coolkidz Australia · covers all brands" });
    return { brand: b, items, docCount: items.length - 1 };
  }), [brands, docs, sheets]);

  const brandOpens = useMemo(() => {
    const m = new Map<string, { sends: number; opens: number }>();
    for (const s of sends) {
      if (!s.brand_name) continue;
      const r = m.get(s.brand_name) || { sends: 0, opens: 0 };
      r.sends += 1; r.opens += s.open_count || 0;
      m.set(s.brand_name, r);
    }
    return m;
  }, [sends]);

  function sel(brand: string, pack: (SendItem & { key: string })[]) {
    // default selection: every real document (form off by default)
    return selected[brand] ?? new Set(pack.filter(i => i.kind !== "form").map(i => i.key));
  }
  function toggle(brand: string, pack: (SendItem & { key: string })[], key: string) {
    const cur = new Set(sel(brand, pack));
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    setSelected(prev => ({ ...prev, [brand]: cur }));
  }

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_retailer_hub.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load.</div>;

  const sendPack = packs.find(p => p.brand.name === sendBrand);
  const sendItems = sendPack ? sendPack.items.filter(i => sel(sendPack.brand.name, sendPack.items).has(i.key)) : [];

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-500">Everything for a brand in one send — tick what to include and it goes out as a single tracked email (each document tracks its own opens). Upload and update documents in the Price Lists / Brand Overview / Fact Sheets tabs.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {packs.map(({ brand: b, items, docCount }) => {
          const stats = brandOpens.get(b.name);
          const chosen = sel(b.name, items);
          return (
            <div key={b.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color || "#94a3b8" }} />
                <h3 className="text-[15px] font-extrabold text-slate-900">{b.name}</h3>
                {stats && stats.sends > 0 && <span className="ml-auto text-[11px] font-semibold text-emerald-600">{stats.sends} sent · {stats.opens} opens</span>}
              </div>
              {docCount === 0 ? (
                <p className="text-[12.5px] text-slate-300 flex-1">No documents yet — upload a price list or brand overview to build this pack.</p>
              ) : (
                <div className="space-y-1.5 flex-1">
                  {items.map(i => (
                    <label key={i.key} className="flex items-start gap-2 cursor-pointer group">
                      <input type="checkbox" checked={chosen.has(i.key)} onChange={() => toggle(b.name, items, i.key)} className="mt-0.5 accent-sky-500" />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold text-slate-700 truncate group-hover:text-slate-900">{i.title}</span>
                        <span className="block text-[10.5px] text-slate-400">{i.meta}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button onClick={() => setSendBrand(b.name)} disabled={docCount === 0 || chosen.size === 0}
                className="mt-3 w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-30 text-white text-[13px] font-bold rounded-lg py-2">
                Send {b.name} pack ({chosen.size}) →
              </button>
            </div>
          );
        })}
      </div>

      {sendBrand && sendItems.length > 0 && (
        <HubSendModal
          items={sendItems.map(({ kind, id, title, brand }) => ({ kind, id, title, brand }))}
          onClose={() => setSendBrand(null)}
          onSent={() => fetch("/api/hub-send", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.ok) setSends(d.sends || []); }).catch(() => {})}
        />
      )}
    </div>
  );
}
