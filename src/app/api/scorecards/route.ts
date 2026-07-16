import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Team Scorecards actions. STRICTLY admin-only — this is performance data.
// score.save upserts one KPI score for a period and writes an audit entry.
export const revalidate = 0;
const RAGS = ["green", "amber", "red", "not_scored"];

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sb = await createClient();
  const actor = access.user?.email ?? "admin";

  if (b.action === "score.save") {
    if (!b.kpi_id || !b.period) return NextResponse.json({ ok: false, error: "kpi_id and period required" }, { status: 400 });
    const row = {
      kpi_id: String(b.kpi_id), period: String(b.period).slice(0, 12),
      rag: RAGS.includes(b.rag) ? b.rag : "not_scored",
      actual_value: String(b.actual_value || "").slice(0, 200),
      notes: String(b.notes || "").slice(0, 1000),
      scored_by: actor, scored_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from("kpi_scores").upsert(row, { onConflict: "kpi_id,period" }).select().single();
    if (error) return NextResponse.json({ ok: false, needsSetup: /does not exist|schema cache/i.test(error.message), error: error.message.slice(0, 200) }, { status: 500 });
    await sb.from("audit_log").insert({ actor, action: "score.save", target: `kpi:${row.kpi_id}`, detail: { period: row.period, rag: row.rag, actual_value: row.actual_value } });
    return NextResponse.json({ ok: true, item: data });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
