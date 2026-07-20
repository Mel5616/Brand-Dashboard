import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Recent activity feed for the in-dashboard toast notifier: new design tasks,
// newly published blog posts, and influencer gifts logged. Client keeps its own
// last-seen watermark; we just return the last 48 hours.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const [tasks, blogs, gifts, alerts] = await Promise.all([
    // New design-board tasks: Asana modified in the window ≈ recently created for
    // fresh tasks (the sync mirrors modified_at). Blogs board excluded here.
    rest(`asana_tasks?select=gid,name,project_label,requested_by,modified_at&completed=eq.false&modified_at=gte.${since}&project_label=not.in.(${encodeURIComponent('"Blogs","Content To Do","Stock Report"')})&order=modified_at.desc&limit=20`),
    rest(`blog_articles?select=brand_id,title,url,published_at,synced_at&synced_at=gte.${since}&order=synced_at.desc&limit=20`),
    rest(`influencer_entries?select=id,handle,brand,product_name,created_at&created_at=gte.${since}&order=created_at.desc&limit=20`),
    rest(`metric_alerts?select=id,kind,title,detail,created_at&created_at=gte.${since}&order=created_at.desc&limit=10`),
  ]);
  const events = [
    ...tasks.map((t: any) => ({
      id: `d:${t.gid}:${t.modified_at}`, kind: "design", tab: "design-requests",
      title: t.name, sub: `${t.project_label ?? "Design"}${t.requested_by ? ` · req. ${String(t.requested_by).split(" ")[0]}` : ""}`,
      at: t.modified_at,
    })),
    ...blogs.filter((b: any) => b.published_at && new Date(b.published_at).getTime() > Date.now() - 14 * 86400_000)
      .map((b: any) => ({
        id: `b:${b.url}`, kind: "blog", tab: "tasks",
        title: b.title, sub: "New blog post published", at: b.synced_at,
      })),
    ...alerts.map((a: any) => ({
      id: `a:${a.id}`, kind: "alert", tab: "summary",
      title: a.title, sub: a.detail ?? "Metric alert", at: a.created_at,
    })),
    ...gifts.map((g: any) => ({
      id: `i:${g.id}`, kind: "influencer", tab: "gifting",
      title: `${g.handle ?? "Influencer"} · ${g.brand ?? ""}`, sub: g.product_name ? `Gifted: ${g.product_name}` : "New influencer logged",
      at: g.created_at,
    })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 30);
  return NextResponse.json({ ok: true, events });
}
