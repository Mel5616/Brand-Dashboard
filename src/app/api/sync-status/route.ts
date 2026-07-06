import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-source sync health for the Sync Status panel. Read on demand so it never
// bloats the main page load. Rows come from sync_status (written by each sync).

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const res = await fetch(`${sbUrl}/rest/v1/sync_status?select=source,ok,message,ran_at&source=not.like.__*&order=source`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    if (missing(res.status, text)) return NextResponse.json({ ok: true, needsSetup: true, rows: [] });
    return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: JSON.parse(text || "[]") });
}
