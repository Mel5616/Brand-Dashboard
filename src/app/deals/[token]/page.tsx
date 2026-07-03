import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/lib/brandLogos";
import { PrintButton } from "@/components/PrintButton";

export const revalidate = 0;

const NAME_TO_ID: Record<string, number> = {
  Nanit: 0, Magic: 1, Hannie: 2, "Gaia Baby": 3, WonderFold: 4, UPPAbaby: 5,
  ZAZU: 6, MiaMily: 7, Frida: 8, "Coolkidz Australia": 9, "Matchstick Monkey": 10, Mamave: 11, SmarTrike: 12,
};
const aud = (n: any) => n == null ? "" : "$" + Number(n).toLocaleString("en-AU", { maximumFractionDigits: 2 });
const items = (s?: string | null) => (s || "").split(",").map(x => x.trim()).filter(Boolean);
const fmtDate = (d?: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";

const PRINT_CSS = `@page{size:A4;margin:12mm}@media print{.no-print{display:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: s } = await sb.from("tradeshows").select("name").eq("deals_token", token).single();
  return { title: s ? `${s.name} — Show Deals` : "Show Deals" };
}

export default async function DealSheet({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: show } = await sb.from("tradeshows").select("*").eq("deals_token", token).single();
  if (!show) return <div className="min-h-screen flex items-center justify-center text-slate-400">Deal sheet not found.</div>;
  const { data: dealsRaw } = await sb.from("show_deals").select("*").eq("show_id", show.id).neq("status", "draft").order("brand");
  const deals = dealsRaw || [];

  // Group by brand; UPPAbaby first, then the rest alphabetically.
  const byBrand = new Map<string, any[]>();
  for (const d of deals) { const a = byBrand.get(d.brand) || []; a.push(d); byBrand.set(d.brand, a); }
  const brandOrder = [...byBrand.keys()].sort((a, b) => (a === "UPPAbaby" ? -1 : b === "UPPAbaby" ? 1 : a.localeCompare(b)));

  const booth = show.booth_url as string | null;

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="max-w-4xl mx-auto">
        <div className="no-print flex justify-end mb-3"><PrintButton /></div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="px-8 py-7 text-white" style={{ background: "linear-gradient(135deg,#0e7490,#155e75)" }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/70">Show Specials · Deal Brief</p>
            <h1 className="text-3xl font-bold mt-1">{show.name}</h1>
            <p className="text-white/80 mt-1">{show.location}{show.location ? " · " : ""}{fmtDate(show.date_start)}{show.date_end !== show.date_start ? ` – ${fmtDate(show.date_end)}` : ""}</p>
          </div>

          {/* Intro / brief note */}
          <div className="px-8 pt-5 pb-1">
            <p className="text-sm text-slate-500">Deal brief for the team — everything active for this show, for building the deal sheet, floor cheat sheet and booth assets. {deals.length} deal{deals.length === 1 ? "" : "s"}.</p>
          </div>

          {/* Brand sections */}
          <div className="px-8 py-4 space-y-8">
            {brandOrder.map(brand => {
              const bid = NAME_TO_ID[brand];
              const logo = bid != null ? BRAND_LOGOS[bid] : undefined;
              const list = byBrand.get(brand)!;
              return (
                <section key={brand}>
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-2 mb-4">
                    {logo && <img src={logo} alt={brand} className="h-7 w-auto max-w-[120px] object-contain" />}
                    <span className="text-lg font-bold text-slate-800">{brand}</span>
                  </div>

                  <div className="space-y-3">
                    {list.map((d: any) => {
                      // Whole-brand percentage banner.
                      if (d.scope === "whole_brand" && d.discount_type === "pct_off") {
                        return (
                          <div key={d.id} className="rounded-xl border border-teal-100 bg-teal-50/50 px-5 py-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800 text-lg">{Number(d.discount_value)}% off the entire {brand} range</p>
                              <p className="text-xs text-slate-500 mt-0.5">Show pricing applies to every {brand} SKU · {d.channel === "both" ? "booth + retail" : d.channel === "retail" ? "retail" : "D2C booth"}</p>
                            </div>
                            <span className="text-3xl font-black text-teal-600">−{Number(d.discount_value)}%</span>
                          </div>
                        );
                      }
                      // Bundle / product deal card.
                      const colours = items(d.range_label);
                      const includes = items(d.gift_label);
                      const save = d.rrp && d.show_price ? Number(d.rrp) - Number(d.show_price) : (d.discount_value ?? null);
                      return (
                        <div key={d.id} className="rounded-xl border border-slate-100 shadow-sm px-5 py-4">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800">{d.product_name || brand}</p>
                              {colours.length > 0 && <p className="text-[13px] text-slate-500 mt-0.5"><span className="font-semibold text-slate-400">Colours:</span> {colours.join(" · ")}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              {d.rrp && <p className="text-xs text-slate-400 line-through">RRP {aud(d.rrp)}</p>}
                              <p className="text-2xl font-bold text-slate-900 leading-none">{aud(d.show_price)}</p>
                              {save ? <span className="inline-block mt-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">Save {aud(save)}</span> : null}
                            </div>
                          </div>
                          {includes.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-50">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1.5">Bundle includes — free</p>
                              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                                {includes.map((g, i) => (
                                  <li key={i} className="text-[13px] text-slate-600 flex items-start gap-1.5"><span className="text-teal-500 mt-0.5">✓</span>{g}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {d.notes && <p className="text-[12px] text-slate-400 mt-2">{d.notes}</p>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {deals.length === 0 && <p className="text-center text-slate-300 py-10">No active deals for this show yet.</p>}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/60 text-[12px] text-slate-500">
            {booth && <p><span className="font-semibold text-slate-600">Booth link:</span> {booth}</p>}
            <p className="mt-1">Show pricing valid {fmtDate(show.date_start)}{show.date_end !== show.date_start ? ` – ${fmtDate(show.date_end)}` : ""}. Free gifts added automatically at checkout while stocks last. · Coolkidz Marketing Command Centre.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
