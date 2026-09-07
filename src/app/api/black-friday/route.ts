import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Black Friday brand-by-brand planning — position is fixed by the stream
// plan, offer is "yours to set" (Mel fills it in as decisions land).
export const revalidate = 0;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("black_friday_plan").select("*").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), rows: [] });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = String(b.brand || "");
  if (!brand) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.offer !== undefined) fields.offer = String(b.offer).slice(0, 300);
  if (b.position !== undefined) fields.position = String(b.position).slice(0, 120);
  if (b.pill !== undefined) fields.pill = String(b.pill).slice(0, 10);
  if (b.sends !== undefined) fields.sends = String(b.sends).slice(0, 300);
  const sb = await createClient();
  const { error } = await sb.from("black_friday_plan").update(fields).eq("brand", brand);
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
