import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Influencer master list (the roster). Names + contacts live here, one record
// per handle. The team form auto-suggests from this; gift entries reference it.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function missing(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, influencers: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/influencers?select=*&order=name.asc.nullslast`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), influencers: [] });
  return NextResponse.json({ ok: true, influencers: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  let handle = (b.handle || "").trim();
  if (!handle) return NextResponse.json({ ok: false, error: "handle required" }, { status: 400 });
  if (!handle.startsWith("@")) handle = "@" + handle.replace(/^@+/, "");
  // only send provided fields so a partial update doesn't wipe existing values
  const row: any = { handle, updated_at: new Date().toISOString() };
  for (const k of ["name", "platform", "contact", "notes"]) if (b[k] != null && b[k] !== "") row[k] = b[k];
  if (b.followers != null && b.followers !== "") row.followers = Number(String(b.followers).replace(/[^0-9]/g, ""));
  const res = await fetch(`${sbUrl}/rest/v1/influencers?on_conflict=handle`, {
    method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
  });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: missing(res.status, t) }, { status: 500 }); }
  return NextResponse.json({ ok: true, handle });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const handle = new URL(req.url).searchParams.get("handle");
  if (!handle) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/influencers?handle=eq.${encodeURIComponent(handle)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
