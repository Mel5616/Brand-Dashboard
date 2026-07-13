import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Serve a stored job-description document with the correct content-type so PDFs
// render inline and HTML renders as a page (Supabase forces text/plain otherwise).
export const revalidate = 0;

export async function GET(req: Request) {
  if (!(await getAccess()).role) return new Response("Unauthorised", { status: 401 });
  const id = new URL(req.url).searchParams.get("member_id");
  if (!id) return new Response("Missing member_id", { status: 400 });
  const sb = await createClient();
  const { data } = await sb.from("team_members").select("job_desc_url,job_desc_file").eq("id", id).single();
  if (!data?.job_desc_url) return new Response("Not found", { status: 404 });
  const res = await fetch(data.job_desc_url, { cache: "no-store" });
  if (!res.ok) return new Response("Could not load the document", { status: 502 });

  const name = String(data.job_desc_file || data.job_desc_url).toLowerCase();
  if (/\.pdf($|\?)/i.test(name)) {
    const buf = await res.arrayBuffer();
    return new Response(buf, { headers: { "content-type": "application/pdf", "content-disposition": "inline", "cache-control": "no-store" } });
  }
  if (/\.html?($|\?)/i.test(name)) {
    const html = await res.text();
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, { headers: { "content-type": res.headers.get("content-type") || "application/octet-stream", "content-disposition": "inline", "cache-control": "no-store" } });
}
