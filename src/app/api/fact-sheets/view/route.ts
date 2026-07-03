import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Serve a stored fact-sheet HTML with the correct content-type so it RENDERS.
// (Supabase Storage forces text/plain on user HTML, which shows source instead.)
export const revalidate = 0;

export async function GET(req: Request) {
  if (!(await getAccess()).role) return new Response("Unauthorised", { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });
  const sb = await createClient();
  const { data } = await sb.from("product_fact_sheets").select("html_url").eq("id", id).single();
  if (!data?.html_url) return new Response("Not found", { status: 404 });
  const res = await fetch(data.html_url, { cache: "no-store" });
  if (!res.ok) return new Response("Could not load the fact sheet", { status: 502 });
  const html = await res.text();
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
