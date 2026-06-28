import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

const FIELDS = ["name", "long_description", "short_description", "whats_in_box", "features", "status", "launch_date", "brand_id"];

// Update a product's editable fields (admin). Delete a product (admin).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) patch[f] = body[f] === "" && f === "launch_date" ? null : body[f];
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const sb = await createClient();
  const { data, error } = await sb.from("new_products").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;
  const sb = await createClient();
  const { error } = await sb.from("new_products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
