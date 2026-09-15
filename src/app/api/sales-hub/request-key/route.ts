import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Hands the configured SALES_REQUEST_KEY to an authenticated admin so the
// Sales Hub can build working per-type /request links to send to reps (who
// aren't logged in, so their link needs the key baked in). Server-only env
// var — never exposed as NEXT_PUBLIC_, so this is the one legitimate way
// the client gets it.
export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true, key: process.env.SALES_REQUEST_KEY || null });
}
