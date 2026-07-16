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

// Render freeform brief text: blank-line paragraphs; a short ALL-CAPS lead line
// styles as a section heading; numbered rule lines get emphasis.
function BriefBody({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const first = lines[0].trim();
        const isHeading = /^[A-Z0-9 ,&'()/—:·.–-]+$/.test(first) && first.length <= 70 && lines.length > 1;
        const heading = isHeading ? first.replace(/:$/, "") : null;
        const body = (isHeading ? lines.slice(1) : lines).join("\n");
        return (
          <section key={i}>
            {heading && <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">{heading}</h2>}
            <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap">{body}</p>
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
  const checklist: { text: string; done: boolean }[] = Array.isArray(job.checklist) ? job.checklist : [];
  const color = TYPE_COLOR[job.type] ?? "#64748b";

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-[760px] mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10 space-y-7 print:shadow-none print:border-0">
        <header className="border-b border-gray-100 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: `${color}1a`, color }}>{job.type}</span>
            {job.priority === "high" && <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">High priority</span>}
          </div>
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">{job.title}</h1>
          <p className="text-[13px] text-gray-500 mt-2">
            {job.brand && <span className="font-medium text-slate-600">{job.brand}</span>}
            {job.due_date && <span> · {job.type === "Shoot" ? "Shoot date" : "Due"}: <span className="font-medium text-slate-600">{dLong(job.due_date)}</span></span>}
            {ownerName && <span> · Owner: <span className="font-medium text-slate-600">{ownerName}</span></span>}
          </p>
        </header>

        {job.notes && <BriefBody text={job.notes} />}

        {checklist.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">{job.type === "Shoot" ? "Shot list" : "Deliverables"}</h2>
            <ul className="space-y-1.5">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 grid place-items-center ${c.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                    {c.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  <span className={`text-[14px] leading-snug ${c.done ? "text-gray-400 line-through" : "text-slate-700"}`}>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-gray-100 pt-3 text-[11px] text-gray-400 text-center">
          Coolkidz Australia · creative production brief{job.created_by ? ` · ${job.created_by}` : ""}
        </footer>
      </div>
    </main>
  );
}
