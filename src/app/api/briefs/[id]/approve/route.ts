import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { createBriefTask, briefToHtmlNotes, ASANA_ROUTES, BRIEFING_STAGING, BRIEFING_ENGINE_PROJECT, APPROVED_SECTION_NAME } from "@/lib/briefing";

export const revalidate = 0;

// Approve a brief and push it to the correct downstream Asana board(s). Admin only.
// Blocked while any MUST compliance flag is unresolved (compliance_cleared = false).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;
  const sb = await createClient();

  const { data: brief } = await sb.from("briefs").select("*, brand_profiles(*)").eq("id", id).single();
  if (!brief) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hasBlockingFlag = (brief.compliance_flags || []).some((f: any) => f.level === "must");
  if (hasBlockingFlag && !brief.compliance_cleared) {
    return NextResponse.json({ error: "Compliance hold. Sign off the MUST flags before approving." }, { status: 409 });
  }

  const brand = (brief as any).brand_profiles;
  const pushed: string[] = [];

  if (process.env.ASANA_TOKEN) {
    if (BRIEFING_STAGING) {
      // Staging: keep everything in the Briefing Engine board (Approved section).
      if (BRIEFING_ENGINE_PROJECT) {
        const gid = await createBriefTask({
          projectGid: BRIEFING_ENGINE_PROJECT,
          sectionName: APPROVED_SECTION_NAME,
          name: `${brand.name} · ${brief.title}`,
          htmlNotes: briefToHtmlNotes(brief, brand.name, brand.tier),
          dueOn: brief.due_date,
        });
        if (gid) pushed.push(gid);
      }
    } else {
      // Live: push to the correct downstream board(s), deduped.
      const routes = ASANA_ROUTES[brand.slug] || {};
      const boards = new Set<string>();
      for (const ch of brief.channels) { const b = routes[ch] || routes._default; if (b) boards.add(b); }
      for (const projectGid of boards) {
        const gid = await createBriefTask({
          projectGid,
          name: `${brand.name} · ${brief.title}`,
          htmlNotes: briefToHtmlNotes(brief, brand.name, brand.tier),
          dueOn: brief.due_date,
        });
        if (gid) pushed.push(gid);
      }
    }
  }

  await sb.from("briefs").update({ status: pushed.length ? "pushed" : "approved" }).eq("id", id);
  return NextResponse.json({ ok: true, pushedTasks: pushed, staging: BRIEFING_STAGING });
}
