import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { REWARD_BRANDS } from "@/lib/reviewRewards";
import { ownerOf } from "@/lib/socialOwners";

// Team workload — who owns what, and what's overdue, pulled live from the
// three places "ownership" actually lives in this app: campaigns.owner
// (free text), social_drafts (owner derived from the fixed brand→person map,
// there's no owner column), and the Briefing Engine's briefs.owner. Nothing
// is stored here; it's computed fresh on each load, same as Today.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const brandName = (id: number | null) => (id == null ? null : REWARD_BRANDS.find(b => b.id === id)?.name ?? null);

export type WorkItem = {
  id: string; kind: "campaign" | "social" | "brief";
  title: string; brand: string | null; status: string; due: string | null; overdue: boolean;
  tab: string;
};

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const [membersRes, campaignsRes, socialRes, briefsRes, profilesRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/team_members?select=id,name,function,active&order=sort.asc,name.asc`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/campaigns?select=id,campaign,brand,owner,status,key_date,end_date`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/social_drafts?select=id,brand_id,status,scheduled_for,caption`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/briefs?select=id,title,moment,brand_id,owner,due_date,status`, { headers: h, cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/brand_profiles?select=id,name`, { headers: h, cache: "no-store" }),
  ]);
  const membersText = await membersRes.text();
  if (!membersRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(membersRes.status, membersText), owners: [] });
  const members: { id: string; name: string; function: string; active: boolean }[] = JSON.parse(membersText || "[]");

  const today = new Date().toISOString().slice(0, 10);
  const items: (WorkItem & { owner: string })[] = [];

  if (campaignsRes.ok) {
    const rows = JSON.parse((await campaignsRes.text()) || "[]");
    for (const c of rows) {
      if (c.status === "Completed") continue;
      const due = c.end_date || c.key_date || null;
      items.push({
        id: `campaign:${c.id}`, kind: "campaign", title: c.campaign, brand: c.brand, status: c.status,
        due, overdue: !!(due && due < today), tab: "campaign-calendar",
        owner: (c.owner || "").trim() || "Unassigned",
      });
    }
  }

  if (socialRes.ok) {
    const rows = JSON.parse((await socialRes.text()) || "[]");
    for (const s of rows) {
      if (s.status === "posted" || s.status === "rejected") continue;
      const owner = ownerOf(s.brand_id);
      if (!owner) continue; // no brand mapping — nothing to attribute
      items.push({
        id: `social:${s.id}`, kind: "social", title: s.caption ? (s.caption.length > 60 ? s.caption.slice(0, 60).trim() + "…" : s.caption) : "Untitled draft",
        brand: brandName(s.brand_id), status: s.status, due: s.scheduled_for || null,
        overdue: !!(s.scheduled_for && s.scheduled_for < today), tab: "social-writing", owner,
      });
    }
  }

  if (briefsRes.ok) {
    const rows = JSON.parse((await briefsRes.text()) || "[]");
    const profiles: { id: string; name: string }[] = profilesRes.ok ? JSON.parse((await profilesRes.text()) || "[]") : [];
    const profileName = (id: string) => profiles.find(p => p.id === id)?.name ?? null;
    for (const b of rows) {
      if (b.status === "pushed" || b.status === "archived") continue;
      items.push({
        id: `brief:${b.id}`, kind: "brief", title: `${b.moment}${b.title ? ` — ${b.title}` : ""}`,
        brand: profileName(b.brand_id), status: b.status, due: b.due_date || null,
        overdue: !!(b.due_date && b.due_date < today), tab: "documents",
        owner: (b.owner || "").trim() || "Unassigned",
      });
    }
  }

  // Fold items onto the roster by case-insensitive name match; anything that
  // doesn't match an active member (a stray name, or genuinely unassigned)
  // still gets its own bucket rather than being dropped silently.
  const rosterNames = new Map(members.filter(m => m.active).map(m => [m.name.toLowerCase(), m.name]));
  const buckets = new Map<string, { name: string; function: string | null; items: WorkItem[] }>();
  for (const it of items) {
    const canonical = rosterNames.get(it.owner.toLowerCase()) || it.owner;
    if (!buckets.has(canonical)) {
      const m = members.find(mm => mm.name.toLowerCase() === canonical.toLowerCase());
      buckets.set(canonical, { name: canonical, function: m?.function ?? null, items: [] });
    }
    const { owner, ...rest } = it;
    buckets.get(canonical)!.items.push(rest);
  }
  // Members with zero open items still show up, at 0 — a clean plate is a signal too.
  for (const m of members.filter(mm => mm.active)) if (!buckets.has(m.name)) buckets.set(m.name, { name: m.name, function: m.function, items: [] });

  const owners = [...buckets.values()].sort((a, b) => {
    const overdueDiff = b.items.filter(i => i.overdue).length - a.items.filter(i => i.overdue).length;
    if (overdueDiff) return overdueDiff;
    return b.items.length - a.items.length;
  });

  return NextResponse.json({ ok: true, owners });
}
