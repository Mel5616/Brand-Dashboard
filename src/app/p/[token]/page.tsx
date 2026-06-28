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
      <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <header className="px-7 py-6 border-b border-slate-100 flex items-center justify-between gap-4">
          {p.brand_id != null && BRAND_LOGOS[p.brand_id]
            ? <img src={BRAND_LOGOS[p.brand_id]} alt={brand ?? ""} className="h-7 max-w-[150px] object-contain" />
            : <span className="font-semibold text-slate-700">{brand ?? "Coolkidz Australia"}</span>}
          <span className="text-xs font-semibold text-white rounded-full px-3 py-1" style={{ background: st.bg }}>{st.label}{launch ? ` · ${launch}` : ""}</span>
        </header>

        {p.attrs?.image_url && <img src={p.attrs.image_url} alt={p.name} className="w-full max-h-80 object-contain bg-slate-50" />}

        <div className="px-7 py-7">
          <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
          {p.short_description && <p className="text-base text-slate-500 mt-1.5">{p.short_description}</p>}

          <section className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {p.sku && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">SKU</p><p className="font-medium text-slate-700">{p.sku}</p></div>}
            {p.barcode && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Barcode</p><p className="font-medium text-slate-700">{p.barcode}</p></div>}
            {dims && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Dimensions</p><p className="font-medium text-slate-700">{dims}</p></div>}
            {p.weight != null && <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Weight</p><p className="font-medium text-slate-700">{p.weight} kg</p></div>}
          </section>

          {p.long_description && (
            <div className="mt-6 space-y-3 text-slate-700 leading-relaxed">
              {lines(p.long_description.replace(/\n\n+/g, "\n")).map((para, i) => <p key={i}>{para}</p>)}
            </div>
          )}

          {lines(p.features).length > 0 && (
            <section className="mt-7">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Key features</h2>
              <ul className="space-y-1.5">{lines(p.features).map((f, i) => <li key={i} className="flex gap-2 text-slate-700"><span className="text-emerald-500">✓</span><span>{f}</span></li>)}</ul>
            </section>
          )}

          {lines(p.whats_in_box).length > 0 && (
            <section className="mt-7">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">What's in the box</h2>
              <ul className="space-y-1.5">{lines(p.whats_in_box).map((f, i) => <li key={i} className="flex gap-2 text-slate-700"><span className="text-slate-300">•</span><span>{f}</span></li>)}</ul>
            </section>
          )}

        </div>
        <footer className="px-7 py-3 border-t border-slate-100 text-[11px] text-slate-400">Coolkidz Australia · product information</footer>
      </article>
    </main>
  );
}
