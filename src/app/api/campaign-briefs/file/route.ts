import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Redirects to the brief's PDF in the public campaign-briefs bucket.
export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { data } = await sb.from("campaign_briefs").select("pdf_path, pdf_name").eq("id", id).single();
  if (!data?.pdf_path) return NextResponse.json({ ok: false, error: "No PDF for this brief" }, { status: 404 });
  const { data: pub } = sb.storage.from("campaign-briefs").getPublicUrl(data.pdf_path);
  return NextResponse.redirect(pub.publicUrl);
}
