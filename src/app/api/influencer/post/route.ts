import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { parseCount } from "@/lib/num";

// Social team updates a gift's POST RESULTS (link, likes, reach, posted date, type).
// Any logged-in user may use it; only engagement fields are touched — never cost or
// sales (those stay admin-only via /api/influencer/entries).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/influencer_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, Prefer: "return=minimal" },
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });

  const fields: Record<string, any> = {};
  if (b.content_url !== undefined) fields.content_url = b.content_url ? String(b.content_url).slice(0, 500) : null;
  if (b.content_type !== undefined) fields.content_type = b.content_type || null;
  if (b.status !== undefined) fields.status = b.status || null;
  if (b.posted_at !== undefined) fields.posted_at = b.posted_at || null;
  for (const k of ["likes", "reach"] as const) {
    if (b[k] !== undefined) fields[k] = parseCount(b[k]);
  }
  // The Instagram/profile link lives on the roster (keyed by handle), shared across
  // all that influencer's posts.
  if (b.profile_url !== undefined && b.handle) {
    let handle = String(b.handle).trim(); if (!handle.startsWith("@")) handle = "@" + handle.replace(/^@+/, "");
    await fetch(`${sbUrl}/rest/v1/influencers?on_conflict=handle`, {
      method: "POST",
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ handle, profile_url: b.profile_url ? String(b.profile_url).slice(0, 500) : null }),
    }).catch(() => {});
  }

  if (Object.keys(fields).length === 0) return NextResponse.json({ ok: true });

  const res = await fetch(`${sbUrl}/rest/v1/influencer_entries?id=eq.${encodeURIComponent(String(b.id))}`, {
    method: "PATCH",
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
