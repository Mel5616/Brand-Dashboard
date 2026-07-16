import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

// Public, token-protected creative brief sheet — no login, print-friendly (the
// browser's Print → Save as PDF gives a clean A4 document).

const TYPE_COLOR: Record<string, string> = { Shoot: "#0891b2", Design: "#db2777", Video: "#7c3aed", Other: "#64748b" };
const dLong = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data } = await sb.from("creative_jobs").select("title").eq("share_token", token).single();
  const title = data?.title ? `Brief · ${data.title}` : "Creative Brief · Coolkidz Australia";
  return {
    title,
    openGraph: { title, description: "Creative production brief — Coolkidz Australia.", images: [{ url: "/og-image.jpg", width: 1200, height: 685 }] },
  };
}

// Inline emphasis: **bold** and *italic* markup, so briefs can be written with
// simple markdown-style styling.
function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${keyBase}-${i}`} className="font-bold text-slate-800">{p.slice(2, -2)}</strong>;
    if (/^\*[^*\n]+\*$/.test(p)) return <em key={`${keyBase}-${i}`} className="italic">{p.slice(1, -1)}</em>;
    return p;
  });
}

// Per line: bold a lead-in label ("Event:", "Arrival:", "1) BABIES & CHILDREN:")
// automatically, then apply inline emphasis to the rest.
function richLines(text: string, keyBase: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    if (li > 0) out.push("\n");
    const m = line.match(/^((?:\d+\)\s*)?[A-Z][^:\n]{1,48}):(\s|$)/);
    if (m) {
      out.push(<strong key={`${keyBase}-l${li}`} className="font-bold text-slate-800">{m[1]}:</strong>);
      out.push(...inline(line.slice(m[1].length + 1), `${keyBase}-l${li}`));
    } else out.push(...inline(line, `${keyBase}-l${li}`));
  });
  return out;
}

// Render freeform brief text: blank-line paragraphs; a short ALL-CAPS lead line
// styles as a section heading; numbered rule lines get emphasis.
function BriefBody({ text, accent }: { text: string; accent: string }) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const first = lines[0].trim();
        const isHeading = /^[A-Z0-9 ,&'()/—:·.–-]+$/.test(first) && first.length <= 70 && lines.length > 1;
        const heading = isHeading ? first.replace(/:$/, "") : null;
        const body = (isHeading ? lines.slice(1) : lines).join("\n");
        const critical = heading ? /non-negotiable|rule/i.test(heading) : false;
        return (
          <section key={i} className={critical ? "rounded-xl border px-4 py-3" : ""} style={critical ? { borderColor: `${accent}55`, background: `${accent}0d` } : undefined}>
            {heading && (
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600 mb-1.5">
                <span className="w-4 h-1 rounded-full shrink-0" style={{ background: accent }} />{heading}
              </h2>
            )}
            <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap">{richLines(body, `b${i}`)}</p>
          </section>
        );
      })}
    </div>
  );
}

export default async function BriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: job } = await sb.from("creative_jobs")
    .select("title,type,brand,status,priority,due_date,notes,checklist,owner_id,created_by")
    .eq("share_token", token).single();
  if (!job) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This brief link is not valid.</main>;

  let ownerName = "";
  if (job.owner_id) {
    const { data: m } = await sb.from("team_members").select("name").eq("id", job.owner_id).single();
    ownerName = m?.name ?? "";
  }
  // Accent: the brand's own colour where we know it, else the job-type colour.
  let accent = TYPE_COLOR[job.type] ?? "#64748b";
  if (job.brand) {
    const { data: br } = await sb.from("brands").select("color").eq("name", job.brand).single();
    if (br?.color) accent = br.color;
  }
  const checklist: { text: string; done: boolean }[] = Array.isArray(job.checklist) ? job.checklist : [];

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-[760px] mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden print:shadow-none print:border-0">
        {/* Cover band */}
        <header className="relative px-6 sm:px-10 pt-8 pb-9 text-white" style={{ background: `linear-gradient(120deg, ${accent} 0%, ${accent}e6 55%, ${accent}bf 100%)` }}>
          <div className="absolute inset-0 opacity-[0.14]" style={{ background: "radial-gradient(ellipse at 85% 0%, #ffffff 0%, transparent 55%)" }} />
          <div className="relative">
            <div className="flex items-center justify-between gap-3 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/ck_icons.png" alt="" className="w-10 h-10 bg-white rounded-xl p-1.5 shadow-sm" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur">{job.type} brief</span>
                {job.priority === "high" && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-rose-600">High priority</span>}
              </div>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">Creative production · Coolkidz Australia</p>
            <h1 className="text-[27px] sm:text-3xl font-extrabold leading-tight mt-1.5 drop-shadow-sm">{job.title}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-[13px] text-white/90">
              {job.brand && <span><span className="text-white/60">Brand</span> · <span className="font-semibold">{job.brand}</span></span>}
              {job.due_date && <span><span className="text-white/60">{job.type === "Shoot" ? "Shoot date" : "Due"}</span> · <span className="font-semibold">{dLong(job.due_date)}</span></span>}
              {ownerName && <span><span className="text-white/60">Owner</span> · <span className="font-semibold">{ownerName}</span></span>}
            </div>
          </div>
        </header>

        <div className="p-6 sm:p-10 space-y-7">

        {job.notes && <BriefBody text={job.notes} accent={accent} />}

        {checklist.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600 mb-2"><span className="w-4 h-1 rounded-full shrink-0" style={{ background: accent }} />{job.type === "Shoot" ? "Shot list" : "Deliverables"}</h2>
            <ul className="space-y-1.5">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 grid place-items-center ${c.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                    {c.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  <span className={`text-[14px] leading-snug ${c.done ? "text-gray-400 line-through" : "text-slate-700"}`}>{richLines(c.text, `c${i}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-gray-100 pt-3 text-[11px] text-gray-400 text-center">
          Coolkidz Australia · creative production brief{job.created_by ? ` · ${job.created_by}` : ""}
        </footer>
        </div>
      </div>
    </main>
  );
}
