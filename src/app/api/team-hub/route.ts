import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Team hub: roster (team_members), weekly scorecard (team_scorecard) and per-person
// 1:1 notes (team_notes). GET returns all three (any signed-in user); POST performs
// an action (admin) selected by `action`. Separate from /api/team (user access).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as any) || {}), cache: "no-store" });

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const [mRes, sRes, nRes] = await Promise.all([
    rest("team_members?select=*&order=sort.asc,name.asc"),
    rest("team_scorecard?select=*"),
    rest("team_notes?select=*&order=created_at.desc"),
  ]);
  const mText = await mRes.text();
  if (!mRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(mRes.status, mText), members: [], scorecard: [], notes: [] });
  return NextResponse.json({
    ok: true,
    members: JSON.parse(mText || "[]"),
    scorecard: sRes.ok ? JSON.parse((await sRes.text()) || "[]") : [],
    notes: nRes.ok ? JSON.parse((await nRes.text()) || "[]") : [],
  });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const by = access.user?.email ?? null;

  try {
    switch (b.action) {
      case "member.save": {
        const row: any = { name: String(b.name || "").slice(0, 120), function: String(b.function || "").slice(0, 60), email: String(b.email || "").slice(0, 160), focus: String(b.focus || "").slice(0, 300), active: b.active !== false, sort: Number(b.sort) || 0 };
        if (!row.name || !row.function) return NextResponse.json({ ok: false, error: "Name and function required" }, { status: 400 });
        const res = b.id
          ? await rest(`team_members?id=eq.${encodeURIComponent(b.id)}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) })
          : await rest("team_members", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
        const text = await res.text();
        if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
        return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
      }
      case "member.delete": {
        if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
        const res = await rest(`team_members?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
        return NextResponse.json({ ok: res.ok });
      }
      case "scorecard.save": {
        const row: any = { function: String(b.function || "").slice(0, 60), owner_id: b.owner_id || null, status: ["green", "amber", "red"].includes(b.status) ? b.status : "green", headline: String(b.headline || "").slice(0, 300), updated_at: new Date().toISOString(), updated_by: by };
        if (!row.function) return NextResponse.json({ ok: false, error: "Function required" }, { status: 400 });
        const res = await rest("team_scorecard?on_conflict=function", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(row) });
        const text = await res.text();
        if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
        return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
      }
      case "note.add": {
        const row: any = { member_id: b.member_id, note_date: b.note_date || new Date().toISOString().slice(0, 10), kind: b.kind === "goal" ? "goal" : "note", body: String(b.body || "").slice(0, 1000), created_by: by };
        if (!row.member_id || !row.body) return NextResponse.json({ ok: false, error: "Member and text required" }, { status: 400 });
        const res = await rest("team_notes", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
        const text = await res.text();
        if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
        return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
      }
      case "note.toggle": {
        if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
        const res = await rest(`team_notes?id=eq.${encodeURIComponent(b.id)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ done: !!b.done }) });
        return NextResponse.json({ ok: res.ok });
      }
      case "note.delete": {
        if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
        const res = await rest(`team_notes?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
        return NextResponse.json({ ok: res.ok });
      }
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
