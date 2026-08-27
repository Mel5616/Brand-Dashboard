import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { listLists } from "@/lib/klaviyo";

export const revalidate = 0;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!process.env.KLAVIYO_API_KEY) return NextResponse.json({ ok: false, error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
  try {
    const lists = await listLists();
    return NextResponse.json({ ok: true, lists });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Klaviyo request failed" }, { status: 502 });
  }
}
