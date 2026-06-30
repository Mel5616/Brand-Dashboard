import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/components/BrandCard";

export const revalidate = 0;

const STATUS: Record<string, { label: string; bg: string }> = {
  coming_soon: { label: "Coming soon", bg: "#0891b2" },
  launching: { label: "Launching", bg: "#d97706" },
  launched: { label: "Available now", bg: "#16a34a" },
  archived: { label: "Archived", bg: "#64748b" },
};
const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);

// Small spec icons matching the PDF data sheet.
function SpecIcon({ name }: { name: string }) {
  const c = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "shrink-0" };
  switch (name) {
    case "Dimensions": return (<svg {...c}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>);
    case "Weight": return (<svg {...c}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>);
    case "SKU": return (<svg {...c}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>);
    case "Barcode": return (<svg {...c}><path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" /></svg>);
    default: return null;
  }
}

// Public, token-protected product page (no login). Shared with the team / suppliers.
export default async function ProductShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: p } = await sb.from("new_products").select("*").eq("share_token", token).single();

  if (!p) return (
    <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This product link is not valid.</main>
  );
  let brand: string | undefined;
  if (p.brand_id != null) { const { data: b } = await sb.from("brands").select("name").eq("id", p.brand_id).single(); brand = b?.name ?? undefined; }
  const st = STATUS[p.status] ?? STATUS.coming_soon;
  const dims = [p.length, p.width, p.height].every((v: any) => v != null) ? `${p.length} × ${p.width} × ${p.height} cm` : null;
  const launch = p.launch_date ? new Date(p.launch_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <article className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <header className="px-7 py-6 border-b border-slate-100 flex items-center justify-between gap-4">
          {p.brand_id != null && BRAND_LOGOS[p.brand_id]
            ? <img src={BRAND_LOGOS[p.brand_id]} alt={brand ?? ""} className="h-7 max-w-[150px] object-contain" />
            : <span className="font-semibold text-slate-700">{brand ?? "Coolkidz Australia"}</span>}
          <span className="text-xs font-semibold text-white rounded-full px-3 py-1" style={{ background: st.bg }}>{st.label}{launch ? ` · ${launch}` : ""}</span>
        </header>

        <div className="px-7 py-7">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">{p.name}</h1>
          {p.short_description && <p className="text-lg text-slate-500 mt-2">{p.short_description}</p>}

          <div className={`mt-6 ${p.attrs?.image_url ? "grid md:grid-cols-[1fr_300px] gap-8 items-start" : ""}`}>
            <div className={`${p.attrs?.image_url ? "order-2 md:order-1" : ""} space-y-6`}>
              <section className="grid grid-cols-2 gap-3 text-sm">
                {p.sku && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><SpecIcon name="SKU" />SKU</p><p className="font-medium text-slate-700">{p.sku}</p></div>}
                {p.barcode && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><SpecIcon name="Barcode" />Barcode</p><p className="font-medium text-slate-700">{p.barcode}</p></div>}
                {dims && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><SpecIcon name="Dimensions" />Dimensions</p><p className="font-medium text-slate-700">{dims}</p></div>}
                {p.weight != null && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><SpecIcon name="Weight" />Weight</p><p className="font-medium text-slate-700">{p.weight} kg</p></div>}
              </section>

              {p.long_description && (
                <div className="space-y-3 text-slate-700 leading-relaxed">
                  {lines(p.long_description.replace(/\n\n+/g, "\n")).map((para, i) => <p key={i}>{para}</p>)}
                </div>
              )}

              {lines(p.features).length > 0 && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Key features</h2>
                  <ul className="space-y-1.5">{lines(p.features).map((f, i) => <li key={i} className="flex gap-2 text-slate-700"><span className="text-emerald-500">✓</span><span>{f}</span></li>)}</ul>
                </section>
              )}

              {lines(p.whats_in_box).length > 0 && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">What's in the box</h2>
                  <ul className="space-y-1.5">{lines(p.whats_in_box).map((f, i) => <li key={i} className="flex gap-2 text-slate-700"><span className="text-slate-300">•</span><span>{f}</span></li>)}</ul>
                </section>
              )}
            </div>

            {p.attrs?.image_url && (
              <div className="order-1 md:order-2 md:sticky md:top-6">
                <img src={p.attrs.image_url} alt={p.name} className="w-full rounded-xl border border-slate-100 bg-slate-50 object-contain" />
              </div>
            )}
          </div>
        </div>
        <footer className="px-7 py-3 border-t border-slate-100 text-[11px] text-slate-400">Coolkidz Australia · product information</footer>
      </article>
    </main>
  );
}
