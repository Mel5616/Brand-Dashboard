import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest, missingTable } from "@/lib/registry";

// Every Klaviyo flow per brand with its status (klaviyo_flows, synced every
// 3 hours). The Flows tab turns the drafts into a go-live checklist.
export const revalidate = 0;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await rest("klaviyo_flows?select=brand_id,flow_id,name,status,trigger_type,synced_at&order=brand_id.asc,name.asc");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missingTable(text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}
