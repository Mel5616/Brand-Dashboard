import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";

export const revalidate = 0;

const NAVY = "#1f2a44";
const STATUS_COLOR: Record<string, string> = { Live: "#2E7D5B", Build: "#C77D3C", Planned: "#3C6E9E", Pipeline: "#8A7BB0", Paused: "#9A9A9A" };
const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);
const splitChannels = (s?: string | null) => (s || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const fmtDate = (s?: string | null) => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";

// Brief fields rendered as sections (oneLiner is shown as the lead-in, channels as chips).
const STRATEGY: { key: string; label: string }[] = [
  { key: "objective", label: "Objective" },
  { key: "whyNow", label: "Why now" },
  { key: "audience", label: "Audience" },
  { key: "keyMessage", label: "Key message" },
];
const EXECUTION: { key: string; label: string }[] = [
  { key: "offerMechanic", label: "Offer / mechanic" },
  { key: "deliverables", label: "Deliverables" },
  { key: "creativeDirection", label: "Creative direction" },
  { key: "do", label: "Do" },
  { key: "dont", label: "Don't" },
  { key: "successMeasure", label: "Success measure" },
  { key: "dependencies", label: "Dependencies" },
];

function Heading({ children }: { children: React.ReactNode }) {
  return <div className="inline-block bg-slate-100 text-[#1f2a44] font-bold uppercase tracking-[0.12em] text-[10px] px-2.5 py-1 rounded mb-2">{children}</div>;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  const paras = lines(value);
  if (!paras.length) return null;
  return (
    <section>
      <Heading>{label}</Heading>
      <div className="space-y-2 text-slate-700 leading-relaxed text-[13px]">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
    </section>
  );
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

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: c } = await sb.from("campaigns").select("campaign, brief, image_url").eq("share_token", token).single();
  if (!c) return { title: "Campaign brief — Coolkidz Australia" };
  const title = `${c.campaign || "Campaign brief"} — Coolkidz Australia`;
  const description = c.brief?.oneLiner || "Campaign brief · Coolkidz Australia";
  const img: string | undefined = c.image_url || undefined;
  return {
    title, description,
    openGraph: { title, description, type: "website", siteName: "Coolkidz Australia", images: img ? [{ url: img, alt: c.campaign }] : undefined },
    twitter: { card: img ? "summary_large_image" : "summary", title, description, images: img ? [img] : undefined },
  };
}

// Public, token-protected campaign brief (no login). Shareable with the team.
export default async function CampaignShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: c } = await sb.from("campaigns").select("*").eq("share_token", token).single();
  if (!c) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This brief link is not valid.</main>;

  const brief = c.brief || {};
  const statusColor = STATUS_COLOR[c.status] || "#3C6E9E";
  const start = fmtDate(c.key_date), end = fmtDate(c.end_date);
  const dateRange = start && end ? `${start} – ${end}` : start || end || "";
  const channels = splitChannels(brief.channels);
  const img: string | undefined = c.image_url || undefined;

  const meta = [
    c.brand ? { label: "Brand", value: c.brand } : null,
    dateRange ? { label: "Dates", value: dateRange } : null,
    c.owner ? { label: "Owner", value: c.owner } : null,
    c.tier ? { label: "Tier", value: `Tier ${c.tier}` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <main className="sheet-wrap min-h-screen bg-slate-100 py-8 px-4 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="max-w-[820px] mx-auto mb-4 flex justify-end no-print">
        <PrintButton />
      </div>

      <article id="product-sheet" className="sheet max-w-[820px] mx-auto bg-white rounded-xl shadow-lg ring-1 ring-slate-200/70 overflow-hidden print:shadow-none print:ring-0 print:rounded-none print:max-w-none print:overflow-visible">
        {/* Header */}
        <header className="px-8 pt-7 pb-4 flex items-center justify-between gap-4">
          <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-7 w-auto object-contain" />
          <span className="text-[10px] tracking-[0.16em] uppercase text-slate-400">Campaign Brief</span>
        </header>

        {/* Title + image */}
        <div className="px-8 grid md:grid-cols-2 gap-6 items-start print:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <div>
              <h1 className="text-[22px] font-extrabold leading-tight" style={{ color: NAVY }}>{c.campaign || "Campaign"}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <span className="inline-block text-white text-[11px] font-bold uppercase tracking-[0.07em] px-3 py-1 rounded-md" style={{ background: statusColor }}>{c.status || "Planned"}</span>
                {c.tier && <span className="inline-block text-[11px] font-bold uppercase tracking-[0.07em] px-3 py-1 rounded-md bg-slate-100 text-slate-600">Tier {c.tier}</span>}
              </div>
              {dateRange && <p className="mt-2 text-[11px] text-slate-500">{c.brand ? `${c.brand} · ` : ""}{dateRange}{c.owner ? ` · Owner: ${c.owner}` : ""}</p>}
            </div>
            {brief.oneLiner && <p className="italic leading-relaxed text-[13px]" style={{ color: "#ea580c" }}>{brief.oneLiner}</p>}
            {c.note && <div className="text-slate-700 leading-relaxed text-[13px]">{lines(c.note).map((p: string, i: number) => <p key={i}>{p}</p>)}</div>}
          </div>
          {img && (
            <div className="w-full aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden grid place-items-center">
              <img src={img} alt={c.campaign || ""} className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Brief body */}
        <div className="px-8 py-7 grid md:grid-cols-2 gap-8 print:grid-cols-2 print:gap-6">
          <div className="space-y-5">
            {STRATEGY.map(f => <Field key={f.key} label={f.label} value={brief[f.key]} />)}
          </div>
          <div className="space-y-5">
            {channels.length > 0 && (
              <section>
                <Heading>Channels</Heading>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map(ch => <span key={ch} className="inline-flex items-center text-[12px] rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-0.5">{ch}</span>)}
                </div>
              </section>
            )}
            {EXECUTION.map(f => <Field key={f.key} label={f.label} value={brief[f.key]} />)}
          </div>
        </div>

        {/* Footer band */}
        <footer className="px-8 py-3 text-[9px] tracking-[0.04em] text-slate-300" style={{ background: NAVY }}>
          Coolkidz Australia | Campaign Brief{c.brand ? ` | ${c.brand}` : ""}{start ? ` | ${start}` : ""}
        </footer>
      </article>
    </main>
  );
}
