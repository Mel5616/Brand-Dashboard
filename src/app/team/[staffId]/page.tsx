import Link from "next/link";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { ScorecardView } from "@/components/ScorecardView";

// One staff member's scorecard: role snapshot, brand assignments, KPI areas with
// scoring, and the transparent quarterly rollup. STRICTLY admin-only.
export const revalidate = 0;

export default async function StaffScorecardPage({ params }: { params: Promise<{ staffId: string }> }) {
  const access = await getAccess();
  if (access.role !== "admin") {
    return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">Team scorecards are restricted to the Marketing Director.</main>;
  }
  const { staffId } = await params;
  const sb = await createClient();
  const [{ data: staff }, { data: assignments }, { data: areas }, { data: docs }] = await Promise.all([
    sb.from("staff_members").select("*").eq("id", staffId).single(),
    sb.from("staff_brand_assignments").select("brand,tier,ownership").eq("staff_id", staffId).order("tier"),
    sb.from("kpi_areas").select("*").eq("staff_id", staffId).order("sort_order"),
    sb.from("role_documents").select("id,version,label,source,created_at").eq("staff_id", staffId).order("version", { ascending: false }),
  ]);
  if (!staff) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">Staff member not found.</main>;

  const areaIds = (areas ?? []).map(a => a.id);
  const { data: kpis } = areaIds.length
    ? await sb.from("kpis").select("*").in("area_id", areaIds).eq("active", true).order("sort_order")
    : { data: [] as any[] };
  const kpiIds = (kpis ?? []).map(k => k.id);
  const { data: scores } = kpiIds.length
    ? await sb.from("kpi_scores").select("*").in("kpi_id", kpiIds).order("scored_at", { ascending: false })
    : { data: [] as any[] };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/team" className="text-sm font-medium text-emerald-600 hover:underline">← All scorecards</Link>
          <Link href={`/team/${staffId}/documents`} className="text-sm font-medium text-slate-500 hover:text-slate-700">Role documents ({docs?.length ?? 0}) →</Link>
        </div>
        <ScorecardView staff={staff} assignments={assignments ?? []} areas={areas ?? []} kpis={kpis ?? []} scores={scores ?? []} />
      </div>
    </main>
  );
}
