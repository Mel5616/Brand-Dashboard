import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { randomBytes } from "crypto";

// Weekly team brief. POST assembles a FROZEN snapshot (D2C results, upcoming
// launches, needs-attention) from live data + the user's objectives/intro, and
// publishes it to a token link. GET lists recent briefs. PATCH edits one in place.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const sb = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: h(), cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function buildSnapshot() {
  const [brands, daily, monthly, targets, campaigns] = await Promise.all([
    sb("brands?select=id,name,live"),
    sb("brand_daily?select=brand_id,day,revenue"),
    sb("brand_monthly?select=brand_id,month_key,revenue&order=month_key"),
    sb("brand_targets?select=brand_id,month_key,revenue_target"),
    sb("campaigns?select=campaign,brand,horizon,status,key_date,end_date,owner,brief&order=key_date"),
  ]);
  const nameById = new Map<number, string>(brands.map((b: any) => [b.id, b.name]));
  const today = new Date(); const todayStr = iso(today);

  // ── D2C results: THIS week (Mon → today), compared same-days vs last week ──
  // From daily data so a mid-week brief compares Mon–today against Mon–same-day
  // last week (fair), not against a full prior week. Complete once today is Sunday.
  const dow = today.getDay();                       // 0 = Sun … 6 = Sat
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((dow + 6) % 7));  // this Monday
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekEnd = new Date(today); lastWeekEnd.setDate(today.getDate() - 7);
  const partial = dow !== 0;                         // week isn't over until Sunday
  const sumDaily = (start: Date, end: Date, bid?: number) => (daily as any[])
    .filter((r: any) => (bid === undefined || r.brand_id === bid) && r.day >= iso(start) && r.day <= iso(end))
    .reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0);
  const total = sumDaily(weekStart, today), prevTotal = sumDaily(lastWeekStart, lastWeekEnd);
  const movers = brands.filter((b: any) => b.live).map((b: any) => {
    const curV = sumDaily(weekStart, today, b.id), prevV = sumDaily(lastWeekStart, lastWeekEnd, b.id);
    return { brand: b.name, revenue: Math.round(curV), wow: prevV > 0 ? Math.round(((curV - prevV) / prevV) * 100) : null };
  }).filter((m: any) => m.revenue > 0).sort((a: any, b: any) => b.revenue - a.revenue);
  const d2c = {
    weekStart: iso(weekStart), partial,
    total: Math.round(total),
    wowPct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    top: movers.slice(0, 5),
    fallers: movers.filter((m: any) => m.wow !== null && m.wow <= -25).slice(0, 3),
  };

  // ── Upcoming launches: next 21 days, or Now/Next horizon, not finished ──
  const in21 = new Date(today); in21.setDate(in21.getDate() + 21);
  const dead = new Set(["Done", "Paused", "Complete"]);
  const launches = campaigns.filter((c: any) => {
    if (!c.campaign || dead.has(c.status)) return false;
    const soon = c.key_date && c.key_date >= todayStr && c.key_date <= iso(in21);
    return soon || c.horizon === "now" || c.horizon === "next";
  }).slice(0, 12).map((c: any) => ({
    campaign: c.campaign, brand: c.brand, keyDate: c.key_date, status: c.status,
    oneLiner: c.brief?.oneLiner || c.note || "",
  }));

  // ── Needs attention ──
  const attention: { text: string; kind: string }[] = [];
  // Brands behind target on the latest month with actuals.
  const months: string[] = [...new Set<string>((monthly as any[]).map((m: any) => String(m.month_key)))].sort();
  const latestMonth: string | undefined = months.filter((mk: string) => monthly.some((m: any) => m.month_key === mk && Number(m.revenue) > 0)).pop();
  if (latestMonth) {
    // If the latest month is the CURRENT (partial) one, pro-rate the target by days
    // elapsed — otherwise every brand looks "behind" simply because the month isn't over.
    const curMonthKey = todayStr.slice(0, 7);
    const partial = latestMonth === curMonthKey;
    const frac = partial ? today.getDate() / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : 1;
    for (const b of brands.filter((x: any) => x.live)) {
      const act = monthly.find((m: any) => m.brand_id === b.id && m.month_key === latestMonth)?.revenue ?? 0;
      const fullTgt = targets.find((t: any) => t.brand_id === b.id && t.month_key === latestMonth)?.revenue_target ?? 0;
      const tgt = fullTgt * frac;
      if (tgt > 0 && act < tgt * 0.8) {
        const pct = Math.round((1 - act / tgt) * 100);
        attention.push({ kind: "behind", text: partial ? `${b.name} is pacing ${pct}% behind its ${latestMonth} D2C target` : `${b.name} finished ${latestMonth} ${pct}% behind its D2C target` });
      }
    }
  }
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
  for (const c of campaigns) {
    if (!c.campaign || dead.has(c.status) || !c.key_date || c.key_date < todayStr) continue;
    if (c.key_date <= iso(in7) && (!c.owner || /tbc/i.test(c.owner))) attention.push({ kind: "owner", text: `"${c.campaign}" launches ${c.key_date} with no owner` });
    const flags = Array.isArray(c.brief?.complianceFlags) ? c.brief.complianceFlags.filter((f: any) => f && (f.label || f.note)) : [];
    if (c.key_date <= iso(in14) && flags.length) attention.push({ kind: "compliance", text: `"${c.campaign}" (${c.key_date}) has ${flags.length} compliance check${flags.length === 1 ? "" : "s"} open` });
  }

  return { generatedAt: new Date().toISOString(), d2c, launches, attention: attention.slice(0, 12) };
}

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  // ?preview=1 → assemble the live auto-sections without saving, for the compose preview.
  if (new URL(req.url).searchParams.get("preview")) return NextResponse.json({ ok: true, snapshot: await buildSnapshot() });
  const res = await fetch(`${sbUrl}/rest/v1/weekly_briefs?select=id,share_token,week_label,published_at&order=published_at.desc.nullslast&limit=20`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const snapshot = await buildSnapshot();
  const row = {
    share_token: randomBytes(9).toString("base64url"),
    week_label: b.weekLabel || new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
    intro: String(b.intro || "").slice(0, 4000),
    objectives: Array.isArray(b.objectives) ? b.objectives.slice(0, 50) : [],
    snapshot, published_at: new Date().toISOString(), created_by: access.user?.email ?? null,
  };
  const res = await fetch(`${sbUrl}/rest/v1/weekly_briefs`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.intro !== undefined) fields.intro = String(b.intro).slice(0, 4000);
  if (b.objectives !== undefined) fields.objectives = Array.isArray(b.objectives) ? b.objectives.slice(0, 50) : [];
  if (b.week_label !== undefined) fields.week_label = String(b.week_label).slice(0, 120);
  if (b.refreshSnapshot) fields.snapshot = await buildSnapshot();
  const res = await fetch(`${sbUrl}/rest/v1/weekly_briefs?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(await res.text())[0] });
}
