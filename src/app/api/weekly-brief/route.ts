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
  const wkAgo = iso(new Date(Date.now() - 7 * 864e5));
  const [brands, daily, monthly, targets, campaigns, igMedia, klaviyo, promotions] = await Promise.all([
    sb("brands?select=id,name,live"),
    sb("brand_daily?select=brand_id,day,revenue"),
    sb("brand_monthly?select=brand_id,month_key,revenue&order=month_key"),
    sb("brand_targets?select=brand_id,month_key,revenue_target"),
    sb("campaigns?select=campaign,brand,horizon,status,key_date,end_date,owner,brief&order=key_date"),
    sb(`instagram_media?select=brand_id,posted_at,caption,permalink,image_url,like_count,comments_count,reach,saved,shares&posted_at=gte.${wkAgo}`),
    sb("klaviyo_metrics?select=brand_id,month_key,revenue,open_rate,click_rate,emails_sent&order=month_key"),
    sb("promotions?select=brand,brand_id,period_start,period_end,note,price,tier,channel"),
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
  // Upcoming launches: only campaigns actually moving — Planned or Live (not Build,
  // Pipeline or Paused). The team wants what's booked in, not the wishlist.
  const launchStatuses = new Set(["Planned", "Live"]);
  const launches = campaigns.filter((c: any) => {
    if (!c.campaign || !launchStatuses.has(c.status)) return false;
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

  // ── Wins: top social posts this week + email highlights (good-news section) ──
  const eng = (p: any) => (Number(p.like_count) || 0) + (Number(p.comments_count) || 0) + (Number(p.saved) || 0) + (Number(p.shares) || 0);
  const topPosts = (igMedia as any[])
    .map((p: any) => ({ brand: nameById.get(p.brand_id) || "", engagement: eng(p), likes: Number(p.like_count) || 0, comments: Number(p.comments_count) || 0, reach: Number(p.reach) || 0, caption: (p.caption || "").split("\n")[0].slice(0, 90), permalink: p.permalink || "", image: p.image_url || "" }))
    .filter((p: any) => p.engagement > 0)
    .sort((a: any, b: any) => b.engagement - a.engagement).slice(0, 3);
  // Email: monthly (Klaviyo has no weekly), so use the last COMPLETE month for a
  // solid number — not the partial current one. Best-click needs real send volume
  // (a handful of emails at 100% is noise, not a win). Open rate is omitted: Apple
  // Mail Privacy inflates it, so it isn't an honest metric to celebrate.
  const curMK = todayStr.slice(0, 7);
  const kMonths = [...new Set<string>((klaviyo as any[]).map((k: any) => String(k.month_key)))].sort();
  const kLatest = kMonths.filter((mk: string) => mk < curMK && (klaviyo as any[]).some((k: any) => k.month_key === mk && Number(k.emails_sent) > 0)).pop() || kMonths[kMonths.length - 1];
  const kRows = (klaviyo as any[]).filter((k: any) => k.month_key === kLatest);
  const topEmail = [...kRows].filter((k: any) => Number(k.revenue) > 0).sort((a: any, b: any) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))[0];
  const clickQualified = [...kRows].filter((k: any) => Number(k.emails_sent) >= 200 && Number(k.click_rate) > 0).sort((a: any, b: any) => (Number(b.click_rate) || 0) - (Number(a.click_rate) || 0));
  // Prefer a different brand from the revenue winner so two brands get a shout-out.
  const bestClick = clickQualified.find((k: any) => k.brand_id !== topEmail?.brand_id) || clickQualified[0];
  const monthLabel = kLatest ? new Date(kLatest + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";
  const email = (topEmail || bestClick) ? {
    month: monthLabel,
    topRevenue: topEmail ? { brand: nameById.get(topEmail.brand_id) || "", revenue: Math.round(Number(topEmail.revenue) || 0) } : null,
    bestClick: bestClick ? { brand: nameById.get(bestClick.brand_id) || "", clickRate: Number(bestClick.click_rate) || 0 } : null,
  } : null;

  // ── Promotions live this week, grouped by channel so it's clear WHAT they are
  // (e.g. "Amazon PD · Frida, Magic, …") rather than a wall of unlabelled brands. ──
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const promoGroups = new Map<string, { channel: string; tier: number | null; endDate: string; note: string; brands: Set<string> }>();
  for (const p of (promotions as any[])) {
    if (!(p.period_start <= iso(weekEnd) && p.period_end >= iso(weekStart))) continue;
    const brand = p.brand || nameById.get(p.brand_id) || "";
    if (!brand) continue;
    const channel = p.channel || "Promotion";
    const tier = p.tier == null ? null : Number(p.tier);
    const key = `${channel}|${tier ?? ""}|${p.period_end}`;
    const cur = promoGroups.get(key) ?? { channel, tier, endDate: p.period_end, note: p.note || "", brands: new Set<string>() };
    cur.brands.add(brand);
    if (!cur.note && p.note) cur.note = p.note;
    promoGroups.set(key, cur);
  }
  const promos = [...promoGroups.values()]
    .map(g => ({ channel: g.channel, tier: g.tier, endDate: g.endDate, note: g.note, brands: [...g.brands].sort() }))
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.channel.localeCompare(b.channel));

  return { generatedAt: new Date().toISOString(), d2c, launches, promos, attention: attention.slice(0, 12), wins: { posts: topPosts, email } };
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
