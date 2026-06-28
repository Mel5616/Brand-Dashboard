import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

// Active brand profiles for the Briefing Engine picker. Any logged-in user.
export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ brands: [] }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb
    .from("brand_profiles")
    .select("id, slug, name, tier, profile")
    .eq("active", true)
    .order("name");
  if (error) return NextResponse.json({ brands: [], needsSetup: /relation|does not exist|schema cache/i.test(error.message) });
  return NextResponse.json({ brands: data ?? [] });
}
