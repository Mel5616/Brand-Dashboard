import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { jobHealth } from "@/lib/jobs";

export const revalidate = 0;
export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await jobHealth()) });
}
