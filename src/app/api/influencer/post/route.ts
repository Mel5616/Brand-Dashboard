import { NextResponse } from "next/server";
import { canManage } from "@/lib/access";
import { parseCount } from "@/lib/num";

// Social team updates a gift's POST RESULTS (link, likes, reach, posted date, type).
// Any logged-in user may use it; only engagement fields are touched — never cost or
// sales (those stay admin-only via /api/influencer/entries).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Content pieces for one entry (up to 5 posts/reels/stories per gift)
export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await canManage("gifting"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const entryId = new URL(req.url).searchParams.get("entry_id");
  if (!entryId) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/influencer_content?entry_id=eq.${encodeURIComponent(entryId)}&order=created_at.asc`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(text), pieces: [] });
  return NextResponse.json({ ok: true, pieces: JSON.parse(text || "[]") });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await canManage("gifting"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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
  if (!(await canManage("gifting"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });

  const fields: Record<string, any> = {};
  if (b.content_url !== undefined) fields.content_url = b.content_url ? String(b.content_url).slice(0, 500) : null;
  if (b.content_type !== undefined) fields.content_type = b.content_type || null;
  if (b.status !== undefined) fields.status = b.status || null;
  if (b.posted_at !== undefined) fields.posted_at = b.posted_at || null;
  for (const k of ["likes", "reach", "engagements", "shares", "saves", "new_followers"] as const) {
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

  // Multiple content pieces (max 5): replace the entry's set, then roll the
  // sums back onto the entry so ROI/CPM reporting keeps working unchanged.
  if (Array.isArray(b.pieces)) {
    const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" };
    const pieces = b.pieces.slice(0, 5).map((p: any) => ({
      entry_id: Number(b.id),
      url: p.url ? String(p.url).slice(0, 500) : null,
      content_type: p.content_type || null,
      posted_at: p.posted_at || null,
      likes: parseCount(p.likes),
      reach: parseCount(p.reach),
      engagements: parseCount(p.engagement),
      shares: parseCount(p.shares),
      saves: parseCount(p.saves),
      new_followers: parseCount(p.new_followers),
    })).filter((p: any) => p.url || p.likes != null || p.reach != null || p.engagements != null || p.shares != null || p.saves != null || p.new_followers != null || p.posted_at);
    await fetch(`${sbUrl}/rest/v1/influencer_content?entry_id=eq.${encodeURIComponent(String(b.id))}`, { method: "DELETE", headers: h });
    if (pieces.length) {
      const ins = await fetch(`${sbUrl}/rest/v1/influencer_content`, { method: "POST", headers: h, body: JSON.stringify(pieces) });
      if (!ins.ok) return NextResponse.json({ ok: false, needsSetup: true, error: "Run add_influencer_content.sql" }, { status: 500 });
    }
    const sum = (k: string) => pieces.reduce((s: number, p: any) => s + (p[k] ?? 0), 0);
    fields.likes = pieces.some((p: any) => p.likes != null) ? sum("likes") : null;
    fields.reach = pieces.some((p: any) => p.reach != null) ? sum("reach") : null;
    fields.engagements = pieces.some((p: any) => p.engagements != null) ? sum("engagements") : null;
    fields.shares = pieces.some((p: any) => p.shares != null) ? sum("shares") : null;
    fields.saves = pieces.some((p: any) => p.saves != null) ? sum("saves") : null;
    fields.new_followers = pieces.some((p: any) => p.new_followers != null) ? sum("new_followers") : null;
    fields.content_url = pieces[0]?.url ?? null;
    fields.content_type = pieces[0]?.content_type ?? null;
    fields.posted_at = pieces.map((p: any) => p.posted_at).filter(Boolean).sort()[0] ?? null;
  }

  if (Object.keys(fields).length === 0) return NextResponse.json({ ok: true });

  const res = await fetch(`${sbUrl}/rest/v1/influencer_entries?id=eq.${encodeURIComponent(String(b.id))}`, {
    method: "PATCH",
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
