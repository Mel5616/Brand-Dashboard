import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

// Clear (or re-flag) a brief's MUST compliance gate. Admin only — ticking this is a
// deliberate human sign-off that the MUST flags have been reviewed.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sb = await createClient();
  const patch: Record<string, unknown> = {};
  if (typeof body.compliance_cleared === "boolean") patch.compliance_cleared = body.compliance_cleared;
  if (typeof body.status === "string") patch.status = body.status;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { data, error } = await sb.from("briefs").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brief: data });
}
