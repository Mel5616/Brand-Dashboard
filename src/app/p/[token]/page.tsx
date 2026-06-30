import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/lib/brandLogos";
import { PrintButton } from "@/components/PrintButton";

export const revalidate = 0;

const NAVY = "#1f2a44";
const STATUS: Record<string, { label: string; bg: string }> = {
  coming_soon: { label: "Coming soon", bg: "#0891b2" },
  launching: { label: "Launching", bg: "#d97706" },
  launched: { label: "Available now", bg: "#16a34a" },
  archived: { label: "Archived", bg: "#64748b" },
};
const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);
const baseSku = (sku?: string | null) => { const s = String(sku || "").trim(); return s.includes("-") ? s.slice(0, s.lastIndexOf("-")) : s; };
// Longest shared word-prefix across the colour names (the product title).
function commonPrefix(names: string[]): string {
  if (!names.length) return "";
  const split = names.map(n => n.trim().split(/\s+/)); const out: string[] = [];
  for (let i = 0; i < split[0].length; i++) { const w = split[0][i]; if (split.every(s => s[i] === w)) out.push(w); else break; }
  return out.join(" ").trim() || names[0];
}

// Small spec icons matching the PDF data sheet.
function SpecIcon({ name }: { name: string }) {
  const c = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "shrink-0" };
  switch (name) {
    case "Dimensions": return (<svg {...c}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>);
    case "Weight": return (<svg {...c}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>);
    case "SKU": return (<svg {...c}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>);
    case "Barcode": return (<svg {...c}><path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" /></svg>);
    default: return null;
  }
}

// Navy uppercase section heading on a soft panel, mirroring the PDF.
function Heading({ children }: { children: React.ReactNode }) {
  return <div className="inline-block bg-slate-100 text-[#1f2a44] font-bold uppercase tracking-[0.12em] text-[10px] px-2.5 py-1 rounded mb-2">{children}</div>;
}

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  main.sheet-wrap { min-height: 0 !important; padding: 0 !important; }
  .sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; max-width: none !important; margin: 0 !important; overflow: visible !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

// Public, token-protected product page (no login). Shared with the team / suppliers.
// Styled to match the PDF data sheet and to print cleanly on A4.
export default async function ProductShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: p } = await sb.from("new_products").select("*").eq("share_token", token).single();

  if (!p) return (
    <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This product link is not valid.</main>
  );

  let brand: string | undefined, accent = "#C9A24B";
  if (p.brand_id != null) { const { data: b } = await sb.from("brands").select("name,color").eq("id", p.brand_id).single(); brand = b?.name ?? undefined; if (b?.color) accent = b.color; }

  // Gather the whole colour line by base SKU (same logic as the PDF data sheet).
  const base = baseSku(p.sku);
  let members: any[] = [p];
  if (base) {
    const { data } = await sb.from("new_products").select("*").or(`sku.like.${base}-*,sku.eq.${base}`);
    if (data && data.length) members = data;
  }
  members.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const groupTitle = commonPrefix(members.map(m => m.name)) || p.name;
  const variantLabel = (name: string) => name.replace(groupTitle, "").trim() || name;
  const multi = members.length > 1;
  const st = STATUS[p.status] ?? STATUS.coming_soon;
  const dims = [p.length, p.width, p.height].every((v: any) => v != null) ? `${p.length} × ${p.width} × ${p.height} cm` : null;
  const launch = p.launch_date ? new Date(p.launch_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;
  const created = p.created_at ? new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" }) : "";

  const specRows: [string, string][] = [];
  if (dims) specRows.push(["Dimensions", dims]);
  if (p.weight != null) specRows.push(["Weight", `${p.weight} kg`]);
  if (p.sku) specRows.push(["SKU", p.sku]);
  if (p.barcode) specRows.push(["Barcode", p.barcode]);

  const features = lines(p.features);
  const box = lines(p.whats_in_box);
  const body = lines((p.long_description || "").replace(/\n\n+/g, "\n"));

  return (
    <main className="sheet-wrap min-h-screen bg-slate-100 py-8 px-4 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="max-w-[820px] mx-auto mb-4 flex justify-end no-print">
        <PrintButton />
      </div>

      <article id="product-sheet" className="sheet max-w-[820px] mx-auto bg-white rounded-xl shadow-lg ring-1 ring-slate-200/70 overflow-hidden print:shadow-none print:ring-0 print:rounded-none print:max-w-none print:overflow-visible">
        {/* Header — Coolkidz logo + sheet label */}
        <header className="px-8 pt-7 pb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-7 w-auto object-contain" />
            {p.brand_id != null && BRAND_LOGOS[p.brand_id] && (
              <>
                <span className="h-6 w-px bg-slate-200" />
                <img src={BRAND_LOGOS[p.brand_id]} alt={brand ?? ""} className="h-6 max-w-[150px] object-contain" />
              </>
            )}
          </div>
          <span className="text-[10px] tracking-[0.16em] uppercase text-slate-400">Product Data Sheet</span>
        </header>

        {/* Body — title + description (left) · image + specs (right) */}
        <div className="px-8 py-6 grid md:grid-cols-2 gap-8 items-start print:grid-cols-2 print:gap-6">
          <div className="min-w-0 space-y-5">
            <div>
              <h1 className="text-[22px] font-extrabold leading-tight" style={{ color: NAVY }}>{p.name}</h1>
              <span className="inline-block mt-2.5 text-white text-[11px] font-bold uppercase tracking-[0.07em] px-3.5 py-1.5 rounded-md" style={{ background: accent }}>{brand ?? "Coolkidz"}</span>
              <p className="mt-2 text-[11px] text-slate-500">
                {launch
                  ? <><span className="font-semibold text-slate-600">Launch Date:</span> {launch}</>
                  : <span className="font-semibold" style={{ color: st.bg }}>{st.label}</span>}
              </p>
            </div>
            {(p.short_description || body.length > 0) && (
              <section>
                <Heading>Description</Heading>
                {p.short_description && <p className="italic leading-relaxed mb-2.5 text-[13px]" style={{ color: "#ea580c" }}>{p.short_description}</p>}
                {body.length > 0 && <div className="space-y-2.5 text-slate-700 leading-relaxed text-[13px]">{body.map((para, i) => <p key={i}>{para}</p>)}</div>}
              </section>
            )}
          </div>

          <div className="space-y-5">
            {/* Square image placeholder — fills the column and always stays square */}
            <div className="w-full aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden grid place-items-center">
              {p.attrs?.image_url
                ? <img src={p.attrs.image_url} alt={p.name} className="w-full h-full object-cover" />
                : <span className="text-[11px] uppercase tracking-[0.12em] text-slate-300">No image</span>}
            </div>
            {specRows.length > 0 && (
              <section>
                <Heading>Specification data</Heading>
                <table className="w-full text-[13px] border-collapse">
                  <tbody>
                    {specRows.map(([label, val], i) => (
                      <tr key={label} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                        <td className="px-2.5 py-1.5 text-slate-500 border border-slate-200 whitespace-nowrap align-middle">
                          <span className="inline-flex items-center gap-1.5">{<SpecIcon name={label} />}{label}</span>
                        </td>
                        <td className="px-2.5 py-1.5 font-semibold text-slate-700 border border-slate-200">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {features.length > 0 && (
              <section>
                <Heading>Key features</Heading>
                <ul className="space-y-1.5 text-[13px]">{features.map((f, i) => <li key={i} className="flex gap-2 text-slate-700"><span style={{ color: accent }} className="font-bold">✓</span><span>{f}</span></li>)}</ul>
              </section>
            )}

            {box.length > 0 && (
              <section>
                <Heading>What&apos;s in the box</Heading>
                <ul className="space-y-1.5 text-[13px]">{box.map((f, i) => <li key={i} className="flex gap-2 text-slate-700"><span className="text-slate-300">•</span><span>{f}</span></li>)}</ul>
              </section>
            )}
          </div>
        </div>

        {/* Colours — every variant in this product line */}
        {multi && (
          <div className="px-8 pb-8">
            <Heading>Colours ({members.length})</Heading>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
              {members.map(m => (
                <div key={m.id} className={`rounded-lg border overflow-hidden ${m.id === p.id ? "border-slate-300 ring-1 ring-slate-200" : "border-slate-100"}`}>
                  <div className="aspect-square bg-slate-50 grid place-items-center overflow-hidden">
                    {m.attrs?.image_url
                      ? <img src={m.attrs.image_url} alt={variantLabel(m.name)} className="w-full h-full object-cover" />
                      : <span className="text-[10px] uppercase tracking-wide text-slate-300">No image</span>}
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="text-[12px] font-semibold text-slate-700 leading-tight">{variantLabel(m.name)}</p>
                    {m.sku && <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><SpecIcon name="SKU" />{m.sku}</p>}
                    {m.barcode && <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1"><SpecIcon name="Barcode" />{m.barcode}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer band */}
        <footer className="px-8 py-3 text-[9px] tracking-[0.04em] text-slate-300" style={{ background: NAVY }}>
          Coolkidz Australia | New Product Submission{brand ? ` | ${brand}` : ""}{created ? ` | ${created}` : ""}
        </footer>
      </article>
    </main>
  );
}
