import Link from "next/link";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Team Scorecards index — one card per staff member. STRICTLY admin-only.
export const revalidate = 0;
export const metadata = { title: "Team Scorecards · Coolkidz Australia" };

const RAG_META: Record<string, { label: string; dot: string; bg: string }> = {
  green: { label: "On track", dot: "#10b981", bg: "bg-emerald-50 text-emerald-700" },
  amber: { label: "Watch", dot: "#f59e0b", bg: "bg-amber-50 text-amber-700" },
  red: { label: "Needs help", dot: "#ef4444", bg: "bg-rose-50 text-rose-700" },
  not_scored: { label: "Not scored", dot: "#cbd5e1", bg: "bg-slate-100 text-slate-500" },
};

// Overall RAG from the latest score per active KPI: green=1, amber=0.5, red=0;
// >=0.7 green, >=0.4 amber, else red. No scores at all → not_scored.
function overallRag(scores: { rag: string }[]) {
  const scored = scores.filter(s => s.rag && s.rag !== "not_scored");
  if (!scored.length) return "not_scored";
  const v = scored.reduce((s, x) => s + (x.rag === "green" ? 1 : x.rag === "amber" ? 0.5 : 0), 0) / scored.length;
  return v >= 0.7 ? "green" : v >= 0.4 ? "amber" : "red";
}

export default async function TeamScorecardsPage() {
  const access = await getAccess();
  if (access.role !== "admin") {
    return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">Team scorecards are restricted to the Marketing Director.</main>;
  }
  const sb = await createClient();
  const [{ data: staff }, { data: areas }, { data: kpis }, { data: scores }] = await Promise.all([
    sb.from("staff_members").select("id,full_name,role_title,active").eq("active", true).order("full_name"),
    sb.from("kpi_areas").select("id,staff_id"),
    sb.from("kpis").select("id,area_id,active"),
    sb.from("kpi_scores").select("kpi_id,rag,scored_at").order("scored_at", { ascending: false }),
  ]);
  const areaStaff = new Map((areas ?? []).map(a => [a.id, a.staff_id]));
  const kpiStaff = new Map((kpis ?? []).filter(k => k.active).map(k => [k.id, areaStaff.get(k.area_id)]));
  const latestByKpi = new Map<string, { rag: string; scored_at: string }>();
  for (const s of scores ?? []) if (!latestByKpi.has(s.kpi_id)) latestByKpi.set(s.kpi_id, s);

  const cards = (staff ?? []).map(m => {
    const mine = [...latestByKpi.entries()].filter(([kid]) => kpiStaff.get(kid) === m.id).map(([, v]) => v);
    const last = mine.map(v => v.scored_at).sort().pop() ?? null;
    return { ...m, rag: overallRag(mine), lastReview: last, kpiCount: [...kpiStaff.values()].filter(v => v === m.id).length };
  });

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Team scorecards</h1>
            <p className="text-sm text-gray-400">Role definitions, KPI frameworks and performance tracking. Visible to the Marketing Director only.</p>
          </div>
          <Link href="/" className="text-sm font-medium text-emerald-600 hover:underline shrink-0">← Dashboard</Link>
        </div>
        {cards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
            No staff yet — run <code className="bg-gray-100 px-1 rounded">supabase/seed_kye_scorecard.py</code> after the schema SQL.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map(m => {
              const rag = RAG_META[m.rag];
              return (
                <Link key={m.id} href={`/team/${m.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow hover:border-emerald-200 transition p-5 block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-11 h-11 rounded-full bg-slate-100 grid place-items-center text-sm font-bold text-slate-500">{m.full_name.split(" ").map((x: string) => x[0]).slice(0, 2).join("")}</div>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 ${rag.bg}`}><span className="w-2 h-2 rounded-full" style={{ background: rag.dot }} />{rag.label}</span>
                  </div>
                  <p className="text-base font-bold text-slate-800 mt-3">{m.full_name}</p>
                  <p className="text-[13px] text-gray-500">{m.role_title}</p>
                  <p className="text-[11px] text-gray-400 mt-2">{m.kpiCount} KPIs · {m.lastReview ? `last scored ${new Date(m.lastReview).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "not scored yet"}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
