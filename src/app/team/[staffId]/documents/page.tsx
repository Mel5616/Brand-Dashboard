import Link from "next/link";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { RoleDocUpload } from "@/components/RoleDocUpload";

// Role document versions for a staff member — reference attachments only (the
// database is the source of truth for KPIs). Private bucket, signed URLs.
export const revalidate = 0;

export default async function RoleDocumentsPage({ params }: { params: Promise<{ staffId: string }> }) {
  const access = await getAccess();
  if (access.role !== "admin") {
    return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">Team scorecards are restricted to the Marketing Director.</main>;
  }
  const { staffId } = await params;
  const sb = await createClient();
  const [{ data: staff }, { data: docs }] = await Promise.all([
    sb.from("staff_members").select("id,full_name,role_title").eq("id", staffId).single(),
    sb.from("role_documents").select("id,version,label,source,created_at").eq("staff_id", staffId).order("version", { ascending: false }),
  ]);
  if (!staff) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">Staff member not found.</main>;

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href={`/team/${staffId}`} className="text-sm font-medium text-emerald-600 hover:underline">← {staff.full_name}&apos;s scorecard</Link>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Role documents · {staff.full_name}</h1>
            <p className="text-sm text-gray-400">Reference attachments only — KPIs are edited in the dashboard, never parsed from documents. Downloads use short-lived signed links.</p>
          </div>
          <RoleDocUpload staffId={staffId} />
          {(docs ?? []).length === 0 ? <p className="text-sm text-gray-300 py-3">No documents yet.</p> : (
            <div className="divide-y divide-gray-50">
              {(docs ?? []).map(d => (
                <div key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">v{d.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{d.label || "Untitled"}</p>
                    <p className="text-[11px] text-gray-400">{d.source === "generated" ? "Generated from dashboard" : "Uploaded"} · {new Date(d.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <a href={`/api/scorecards/document?id=${d.id}`} className="text-sm font-medium text-emerald-600 hover:underline shrink-0">Download ↗</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
