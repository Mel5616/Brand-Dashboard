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
  const [brands, weekly, monthly, targets, campaigns] = await Promise.all([
    sb("brands?select=id,name,live"),
    sb("brand_weekly?select=brand_id,week_start,revenue&order=week_start"),
    sb("brand_monthly?select=brand_id,month_key,revenue&order=month_key"),
    sb("brand_targets?select=brand_id,month_key,revenue_target"),
    sb("campaigns?select=campaign,brand,horizon,status,key_date,end_date,owner,brief&order=key_date"),
  ]);
  const nameById = new Map<number, string>(brands.map((b: any) => [b.id, b.name]));
  const today = new Date(); const todayStr = iso(today);

  // ── D2C results: latest complete week vs the week before ──
  const complete: string[] = [...new Set<string>((weekly as any[]).map((w: any) => String(w.week_start)))].filter((ws: string) => {
    const e = new Date(ws + "T00:00:00"); e.setDate(e.getDate() + 7); return iso(e) <= todayStr;
  }).sort();
  const thisWk: string | undefined = complete[complete.length - 1], lastWk: string | undefined = complete[complete.length - 2];
  const wkRev = (ws: string | undefined, bid?: number) => weekly
    .filter((w: any) => w.week_start === ws && (bid === undefined || w.brand_id === bid))
    .reduce((s: number, w: any) => s + (Number(w.revenue) || 0), 0);
  const total = wkRev(thisWk), prevTotal = wkRev(lastWk);
  const movers = brands.filter((b: any) => b.live).map((b: any) => {
    const cur = wkRev(thisWk, b.id), prev = wkRev(lastWk, b.id);
    return { brand: b.name, revenue: Math.round(cur), wow: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null };
  }).filter((m: any) => m.revenue > 0).sort((a: any, b: any) => b.revenue - a.revenue);
  const d2c = {
    weekStart: thisWk ?? null,
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
    for (const b of brands.filter((x: any) => x.live)) {
      const act = monthly.find((m: any) => m.brand_id === b.id && m.month_key === latestMonth)?.revenue ?? 0;
      const tgt = targets.find((t: any) => t.brand_id === b.id && t.month_key === latestMonth)?.revenue_target ?? 0;
      if (tgt > 0 && act < tgt * 0.8) attention.push({ kind: "behind", text: `${b.name} is ${Math.round((1 - act / tgt) * 100)}% behind its ${latestMonth} D2C target` });
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
