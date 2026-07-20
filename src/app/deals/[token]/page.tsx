import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/lib/brandLogos";
import { PrintButton } from "@/components/PrintButton";

export const revalidate = 0;

const NAME_TO_ID: Record<string, number> = {
  Nanit: 0, Magic: 1, Hannie: 2, "Gaia Baby": 3, WonderFold: 4, UPPAbaby: 5,
  ZAZU: 6, MiaMily: 7, Frida: 8, "Coolkidz Australia": 9, "Matchstick Monkey": 10, Mamave: 11, SmarTrike: 12,
};
const BRAND_COLOR: Record<string, string> = {
  Nanit: "#6366f1", Magic: "#7c3aed", Hannie: "#dc2626", "Gaia Baby": "#d97706", WonderFold: "#059669",
  UPPAbaby: "#0891b2", ZAZU: "#16a34a", MiaMily: "#0369a1", Frida: "#4f46e5", "Coolkidz Australia": "#0d9488",
  "Matchstick Monkey": "#ea580c", Mamave: "#9333ea", SmarTrike: "#0072CE",
};
const accentOf = (b: string) => BRAND_COLOR[b] ?? "#0e7490";
const aud = (n: any) => n == null ? "" : "$" + Number(n).toLocaleString("en-AU", { maximumFractionDigits: 2 });
const audK = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const items = (s?: string | null) => (s || "").split(",").map(x => x.trim()).filter(Boolean);
const fmtDate = (d?: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";

const PRINT_CSS = `@page{size:A4;margin:11mm}@media print{.no-print{display:none!important}body{background:#fff!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: s } = await sb.from("tradeshows").select("name, location, date_start").eq("deals_token", token).single();
  const title = s ? `${s.name} — Show Deals` : "Show Deals";
  const description = s ? `${s.location || ""}${s.location ? " · " : ""}Show specials deal brief` : "Show specials deal brief";
  return {
    title, description,
    openGraph: { title, description, type: "website", images: ["/logos/Coolkidz Logo.png"] },
    twitter: { card: "summary", title, description },
  };
}

export default async function DealSheet({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: show } = await sb.from("tradeshows").select("*").eq("deals_token", token).single();
  if (!show) return <div className="min-h-screen flex items-center justify-center text-slate-400">Deal sheet not found.</div>;
  const { data: dealsRaw } = await sb.from("show_deals").select("*").eq("show_id", show.id).neq("status", "draft").order("brand");
  const deals = dealsRaw || [];

  const byBrand = new Map<string, any[]>();
  for (const d of deals) { const a = byBrand.get(d.brand) || []; a.push(d); byBrand.set(d.brand, a); }
  // Whole-brand banners lead, then deals by show price, highest first.
  for (const [k, a] of byBrand) byBrand.set(k, [...a].sort((x, y) =>
    (x.scope === "whole_brand" ? 0 : 1) - (y.scope === "whole_brand" ? 0 : 1) ||
    (Number(y.show_price) || 0) - (Number(x.show_price) || 0)));
  const brandOrder = [...byBrand.keys()].sort((a, b) => a.localeCompare(b));
  // Two stands, matching the booth: UPPAbaby on its own, the rest as Coolkidz brands.
  const stands = [
    { name: "UPPAbaby Stand", note: null as string | null, brands: brandOrder.filter(b => b === "UPPAbaby") },
    { name: "Coolkidz Brands", note: "All Coolkidz Brands run through the Coolkidz website + POS", brands: brandOrder.filter(b => b !== "UPPAbaby") },
  ].filter(s => s.brands.length);
  const maxSave = Math.max(0, ...deals.map((d: any) => d.rrp && d.show_price ? Number(d.rrp) - Number(d.show_price) : 0));
  const dateStr = `${fmtDate(show.date_start)}${show.date_end !== show.date_start ? ` – ${fmtDate(show.date_end)}` : ""}`;

  const StatChip = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-lg bg-white/10 px-3 py-1.5"><p className="text-lg font-bold leading-none">{value}</p><p className="text-[10px] uppercase tracking-wider text-white/70 mt-0.5">{label}</p></div>
  );

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="max-w-5xl mx-auto">
        <div className="no-print flex justify-end mb-3"><PrintButton /></div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg,#0e7490 0%,#155e75 60%,#1e3a5f 100%)" }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">Show Specials · Deal Brief</p>
            <h1 className="text-[32px] font-black mt-1 leading-tight">{show.name}</h1>
            <p className="text-white/80 mt-1">{show.location}{show.location ? " · " : ""}{dateStr}</p>
            <div className="flex flex-wrap gap-2.5 mt-4">
              <StatChip label="Deals" value={String(deals.length)} />
              <StatChip label="Brands" value={String(byBrand.size)} />
              {maxSave > 0 && <StatChip label="Up to" value={`${audK(maxSave)} off`} />}
            </div>
          </div>

          <div className="px-8 pt-5">
            <p className="text-sm text-slate-500">Deal brief for the team — everything active for this show, for building the deal sheet, floor cheat sheet and booth assets.</p>
          </div>

          {/* Stands → brands → deals */}
          <div className="px-8 py-4 space-y-9">
            {stands.map(stand => (
              <div key={stand.name}>
                <div className="flex items-center gap-3 mb-5 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{stand.name}</span>
                  {stand.note && <span className="text-[12px] font-semibold text-cyan-800 bg-cyan-50 border border-cyan-100 rounded-full px-3 py-1">🛒 {stand.note}</span>}
                  <span className="flex-1 h-px bg-slate-100" />
                </div>

                <div className="space-y-7">
                  {stand.brands.map(brand => {
                    const bid = NAME_TO_ID[brand];
                    const logo = bid != null ? BRAND_LOGOS[bid] : undefined;
                    const accent = accentOf(brand);
                    const list = byBrand.get(brand)!;
                    return (
                      <section key={brand}>
                        <div className="flex items-center gap-3 pb-2.5 mb-4 border-b-2" style={{ borderColor: accent + "33" }}>
                          {logo ? <img src={logo} alt={brand} className="h-8 w-auto max-w-[150px] object-contain" /> : <span className="text-lg font-bold" style={{ color: accent }}>{brand}</span>}
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3 print:grid-cols-2">
                          {list.map((d: any) => {
                            if (d.scope === "whole_brand" && d.discount_type === "pct_off") {
                              return (
                                <div key={d.id} className="sm:col-span-2 rounded-xl px-5 py-4 flex items-center justify-between" style={{ background: accent + "0d", border: `1px solid ${accent}22` }}>
                                  <div>
                                    <p className="font-bold text-slate-800 text-xl">{Number(d.discount_value)}% off the entire {brand} range</p>
                                    <p className="text-[13.5px] text-slate-500 mt-0.5">Applies to every {brand} SKU · {d.channel === "both" ? "booth + retail" : d.channel === "retail" ? "retail" : "D2C booth"}</p>
                                  </div>
                                  <span className="text-5xl font-black" style={{ color: accent }}>−{Number(d.discount_value)}%</span>
                                </div>
                              );
                            }
                            const colours = items(d.range_label);
                            const includes = items(d.gift_label);
                            // Total value saved = price cut + the free accessory bundle's value.
                            const priceSave = d.rrp && d.show_price ? Number(d.rrp) - Number(d.show_price) : (d.discount_value ?? null);
                            const save = priceSave != null ? priceSave + (Number(d.gift_value) || 0) : (Number(d.gift_value) || null);
                            return (
                              <div key={d.id} className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${accent}` }}>
                                <div className="px-5 py-4">
                                  <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="min-w-0">
                                      <p className="font-bold text-slate-800 text-[17.5px] leading-snug">{d.product_name || brand}</p>
                                      {colours.length > 0 && <p className="text-[14px] text-slate-500 mt-1"><span className="font-semibold text-slate-400 uppercase text-[10px] tracking-wide">Colours</span> · {colours.join(" · ")}</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                      {d.rrp && <p className="text-[13px] text-slate-400 line-through">RRP {aud(d.rrp)}</p>}
                                      <p className="text-[30px] font-black text-slate-900 leading-none" style={{ color: accent }}>{aud(d.show_price)}</p>
                                      {save ? <span className="inline-block mt-1.5 text-[12.5px] font-bold text-white rounded-full px-3 py-1" style={{ background: accent }}>Save {aud(save)}{d.gift_value ? " total value" : ""}</span> : null}
                                    </div>
                                  </div>
                                  {includes.length > 0 && (
                                    <div className="mt-3.5 pt-3.5 border-t border-slate-50">
                                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>Bundle includes — free</p>
                                        {d.gift_value ? <span className="text-[12px] font-black text-white rounded-full px-3 py-1" style={{ background: accent }}>🎁 Accessory bundle valued at {aud(d.gift_value)}</span> : null}
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {includes.map((g, i) => (
                                          <span key={i} className="inline-flex items-center gap-1 text-[13px] bg-slate-50 border border-slate-100 rounded-full px-3 py-1 text-slate-600">
                                            <span className="font-bold" style={{ color: accent }}>+</span>{g}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {d.notes && <p className="text-[13px] text-slate-400 mt-2.5">{d.notes}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            ))}
            {deals.length === 0 && <p className="text-center text-slate-300 py-10">No active deals for this show yet.</p>}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/60 text-[12px] text-slate-500">
            {show.booth_url && <p><span className="font-semibold text-slate-600">Booth link:</span> {show.booth_url}</p>}
            <p className="mt-1">Show pricing valid {dateStr}. Free gifts added automatically at checkout while stocks last. · Coolkidz Marketing Command Centre.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
