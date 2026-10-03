import { getAccess } from "@/lib/access";

// Admin: signups for one download, as JSON or CSV (?format=csv).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return new Response("Admins only", { status: 403 });
  const u = new URL(req.url);
  const id = u.searchParams.get("download_id"); if (!id) return new Response("Missing id", { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/download_signups?select=*&download_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=5000`, { headers: h, cache: "no-store" });
  const rows: any[] = res.ok ? await res.json() : [];
  if (u.searchParams.get("format") === "csv") {
    const lines = ["first_name,email,marketing_consent,source,date", ...rows.map(r => [r.first_name, r.email, r.consent ? "yes" : "no", r.source, r.created_at].map(csv).join(","))];
    return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="download-signups.csv"` } });
  }
  return Response.json({ ok: true, items: rows });
}
