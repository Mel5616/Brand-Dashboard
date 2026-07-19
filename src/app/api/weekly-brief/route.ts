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
  const adCut = iso(new Date(Date.now() - 21 * 864e5));   // covers last week + the week before
  const [brands, daily, monthly, targets, campaigns, igMedia, klaviyo, promotions, googleDaily, metaDaily, pinterestDaily, ga4, ebEvents, shows, showReports, showAttendance] = await Promise.all([
    sb("brands?select=id,name,live"),
    sb("brand_daily?select=brand_id,day,revenue"),
    sb("brand_monthly?select=brand_id,month_key,revenue&order=month_key"),
    sb("brand_targets?select=brand_id,month_key,revenue_target"),
    sb("campaigns?select=campaign,brand,horizon,status,key_date,end_date,owner,brief,share_token&order=key_date"),
    sb(`instagram_media?select=brand_id,posted_at,caption,permalink,image_url,like_count,comments_count,reach,saved,shares&posted_at=gte.${wkAgo}`),
    sb("klaviyo_metrics?select=brand_id,month_key,revenue,open_rate,click_rate,emails_sent&order=month_key"),
    sb("promotions?select=brand,brand_id,period_start,period_end,note,price,tier,channel"),
    sb(`google_ads_daily?select=brand_id,date,spend,revenue&date=gte.${adCut}`),
    sb(`meta_ads_daily?select=brand_id,date,spend,revenue&date=gte.${adCut}`),
    sb(`pinterest_ads_daily?select=brand_id,date,spend,revenue&date=gte.${adCut}`),
    sb("ga4_metrics?select=brand_id,month_key,sessions,organic_sessions,new_users,engagement_rate&order=month_key"),
    sb("eventbrite_events?select=name,start_at,end_at,venue,status,url,capacity,tickets_sold&order=start_at"),
    sb("tradeshows?select=id,name,date_start,date_end,location,state,deals_token"),
    sb("tradeshow_reports?select=tradeshow_id"),
    sb("tradeshow_attendance?select=tradeshow_id,attendance"),
  ]);
  const nameById = new Map<number, string>(brands.map((b: any) => [b.id, b.name]));
  const today = new Date(); const todayStr = iso(today);

  // ── D2C results: the most recently COMPLETED week, compared to the week before.
  // Coolkidz weeks run Sunday → Saturday, so this is last week's finished numbers
  // (never the near-empty current week) and the week-on-week is a fair full-week
  // vs full-week comparison. ──
  const dow = today.getDay();                       // 0 = Sun … 6 = Sat
  const thisSunday = new Date(today); thisSunday.setDate(today.getDate() - dow);          // start of the current week (Sun)
  const weekStart = new Date(thisSunday); weekStart.setDate(thisSunday.getDate() - 7);    // last complete Sunday
  const weekEndSat = new Date(thisSunday); weekEndSat.setDate(thisSunday.getDate() - 1);  // last complete Saturday
  const prevStart = new Date(weekStart); prevStart.setDate(weekStart.getDate() - 7);
  const prevEnd = new Date(weekEndSat); prevEnd.setDate(weekEndSat.getDate() - 7);
  const sumDaily = (start: Date, end: Date, bid?: number) => (daily as any[])
    .filter((r: any) => (bid === undefined || r.brand_id === bid) && r.day >= iso(start) && r.day <= iso(end))
    .reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0);
  const total = sumDaily(weekStart, weekEndSat), prevTotal = sumDaily(prevStart, prevEnd);
  const movers = brands.filter((b: any) => b.live).map((b: any) => {
    const curV = sumDaily(weekStart, weekEndSat, b.id), prevV = sumDaily(prevStart, prevEnd, b.id);
    return { brand: b.name, revenue: Math.round(curV), wow: prevV > 0 ? Math.round(((curV - prevV) / prevV) * 100) : null };
  }).filter((m: any) => m.revenue > 0).sort((a: any, b: any) => b.revenue - a.revenue);
  const d2c = {
    weekStart: iso(weekStart), weekEnd: iso(weekEndSat), partial: false,
    total: Math.round(total),
    wowPct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    top: movers,   // every brand with D2C sales, biggest first — the team sees them all
    fallers: movers.filter((m: any) => m.wow !== null && m.wow <= -25).slice(0, 3),
  };

  // ── Upcoming launches: next 21 days, or Now/Next horizon, not finished ──
  const in21 = new Date(today); in21.setDate(in21.getDate() + 21);
  const dead = new Set(["Done", "Paused", "Complete"]);
  // Upcoming launches: only campaigns actually moving — Planned or Live (not Build,
  // Pipeline or Paused). The team wants what's booked in, not the wishlist.
  // Anything actively moving toward launch — Build campaigns ARE upcoming work
  // (only Paused/Complete stay off the brief).
  const launchStatuses = new Set(["Planned", "Live", "Build", "Pipeline"]);
  const launches = campaigns.filter((c: any) => {
    if (!c.campaign || !launchStatuses.has(c.status)) return false;
    const soon = c.key_date && c.key_date >= todayStr && c.key_date <= iso(in21);
    return soon || c.horizon === "now" || c.horizon === "next";
  }).slice(0, 12).map((c: any) => ({
    campaign: c.campaign, brand: c.brand, keyDate: c.key_date, status: c.status,
    oneLiner: c.brief?.oneLiner || c.note || "",
    briefUrl: c.share_token ? `/c/${c.share_token}` : null,
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
  // Prefer the CURRENT month-to-date when it has sends (timely stories), else the last complete month.
  const kLatest = kMonths.filter((mk: string) => mk <= curMK && (klaviyo as any[]).some((k: any) => k.month_key === mk && Number(k.emails_sent) > 0)).pop() || kMonths[kMonths.length - 1];
  const kRows = (klaviyo as any[]).filter((k: any) => k.month_key === kLatest);
  const topEmail = [...kRows].filter((k: any) => Number(k.revenue) > 0).sort((a: any, b: any) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))[0];
  const clickQualified = [...kRows].filter((k: any) => Number(k.emails_sent) >= 200 && Number(k.click_rate) > 0).sort((a: any, b: any) => (Number(b.click_rate) || 0) - (Number(a.click_rate) || 0));
  // Prefer a different brand from the revenue winner so two brands get a shout-out.
  const bestClick = clickQualified.find((k: any) => k.brand_id !== topEmail?.brand_id) || clickQualified[0];
  // Revenue per email sent — the "quality beats volume" hero. Small-but-real sends qualify.
  const perQualified = [...kRows].filter((k: any) => Number(k.emails_sent) >= 100 && Number(k.revenue) >= 500)
    .map((k: any) => ({ ...k, perEmail: Number(k.revenue) / Number(k.emails_sent) }))
    .sort((a: any, b: any) => b.perEmail - a.perEmail);
  const bestPer = perQualified.find((k: any) => k.brand_id !== topEmail?.brand_id) || perQualified[0];
  // Quiet lists: live brands that sent nothing this month (opens are privacy-inflated, so
  // this is the honest "needs a nudge" signal instead of celebrating open rates).
  const sentIds = new Set(kRows.filter((k: any) => Number(k.emails_sent) > 0).map((k: any) => k.brand_id));
  const quiet = (brands as any[]).filter((b: any) => b.live && !sentIds.has(b.id)).map((b: any) => b.name);
  const monthLabel = kLatest ? new Date(kLatest + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) + (kLatest === curMK ? " · month to date" : "") : "";
  const email = (topEmail || bestClick) ? {
    month: monthLabel,
    topRevenue: topEmail ? { brand: nameById.get(topEmail.brand_id) || "", revenue: Math.round(Number(topEmail.revenue) || 0) } : null,
    bestClick: bestClick ? { brand: nameById.get(bestClick.brand_id) || "", clickRate: Number(bestClick.click_rate) || 0 } : null,
    bestPerEmail: bestPer ? { brand: nameById.get(bestPer.brand_id) || "", perEmail: Math.round(bestPer.perEmail * 100) / 100, sent: Number(bestPer.emails_sent), revenue: Math.round(Number(bestPer.revenue)) } : null,
    quiet,
  } : null;

  // ── Promotions live this week, grouped by channel so it's clear WHAT they are
  // (e.g. "Amazon PD · Frida, Magic, …") rather than a wall of unlabelled brands. ──
  const curWeekEnd = new Date(thisSunday); curWeekEnd.setDate(thisSunday.getDate() + 6);
  const promoGroups = new Map<string, { channel: string; tier: number | null; endDate: string; note: string; brands: Set<string> }>();
  for (const p of (promotions as any[])) {
    if (!(p.period_start <= iso(curWeekEnd) && p.period_end >= iso(thisSunday))) continue;
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

  // ── Paid ads: last completed week (same Mon–Sun window as D2C), per platform,
  // ROAS this week vs prior week. Revenue is each platform's own reported
  // conversion value — see the honesty footnote on the sheet (Google goals /
  // untracked Amazon spend mean blended ROAS reads high). ──
  const sumAds = (rows: any[], s: Date, e: Date) => (rows as any[])
    .filter((r: any) => r.date >= iso(s) && r.date <= iso(e))
    .reduce((a: any, r: any) => { a.spend += Number(r.spend) || 0; a.revenue += Number(r.revenue) || 0; return a; }, { spend: 0, revenue: 0 });
  const platform = (name: string, rows: any[]) => {
    const cur = sumAds(rows, weekStart, weekEndSat), prev = sumAds(rows, prevStart, prevEnd);
    return {
      name, spend: Math.round(cur.spend), revenue: Math.round(cur.revenue),
      roas: cur.spend > 0 ? Math.round((cur.revenue / cur.spend) * 10) / 10 : null,
      roasPrev: prev.spend > 0 ? Math.round((prev.revenue / prev.spend) * 10) / 10 : null,
      spendWow: prev.spend > 0 ? Math.round(((cur.spend - prev.spend) / prev.spend) * 100) : null,
    };
  };
  const platforms = [platform("Google", googleDaily), platform("Meta", metaDaily), platform("Pinterest", pinterestDaily)].filter(p => p.spend > 0 || p.revenue > 0);
  const totSpend = platforms.reduce((s, p) => s + p.spend, 0), totRev = platforms.reduce((s, p) => s + p.revenue, 0);
  const paid = platforms.length ? {
    week: iso(weekStart), platforms,
    totalSpend: Math.round(totSpend), totalRevenue: Math.round(totRev),
    blendedRoas: totSpend > 0 ? Math.round((totRev / totSpend) * 10) / 10 : null,
  } : null;

  // ── Website traffic: GA4 is monthly, so this is the last complete month vs the
  // one before. GA4 here carries no conversion metric, so "per visit" is the
  // month's D2C revenue ÷ sessions — an honest efficiency proxy, not a GA4 rate. ──
  const g4Months: string[] = [...new Set<string>((ga4 as any[]).map((r: any) => String(r.month_key)))].sort();
  const g4Latest = g4Months.filter((mk: string) => mk < curMK && (ga4 as any[]).some((r: any) => r.month_key === mk && Number(r.sessions) > 0)).pop() || g4Months[g4Months.length - 1];
  const g4Prev = g4Months.filter((mk: string) => mk < g4Latest).pop();
  const g4Sum = (mk?: string) => (ga4 as any[]).filter((r: any) => r.month_key === mk).reduce((a: any, r: any) => {
    a.sessions += Number(r.sessions) || 0; a.organic += Number(r.organic_sessions) || 0; a.newUsers += Number(r.new_users) || 0;
    a.engW += Number(r.sessions) || 0; a.engSum += (Number(r.engagement_rate) || 0) * (Number(r.sessions) || 0); return a;
  }, { sessions: 0, organic: 0, newUsers: 0, engW: 0, engSum: 0 });
  const gCur = g4Sum(g4Latest), gPrev = g4Prev ? g4Sum(g4Prev) : null;
  const d2cRevForMonth = (mk?: string) => (monthly as any[]).filter((m: any) => m.month_key === mk).reduce((s: number, m: any) => s + (Number(m.revenue) || 0), 0);
  let engRate = gCur.engW > 0 ? gCur.engSum / gCur.engW : null;
  if (engRate !== null && engRate <= 1) engRate = engRate * 100;    // stored as fraction on some feeds
  const traffic = g4Latest && gCur.sessions > 0 ? {
    month: new Date(g4Latest + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    sessions: Math.round(gCur.sessions),
    sessionsMoM: gPrev && gPrev.sessions > 0 ? Math.round(((gCur.sessions - gPrev.sessions) / gPrev.sessions) * 100) : null,
    organicPct: gCur.sessions > 0 ? Math.round((gCur.organic / gCur.sessions) * 100) : null,
    engagementPct: engRate !== null ? Math.round(engRate) : null,
    revPerVisit: gCur.sessions > 0 ? Math.round((d2cRevForMonth(g4Latest) / gCur.sessions) * 100) / 100 : null,
  } : null;

  // ── What's on: Tune-Up Days / special events (Eventbrite) and tradeshows in
  // the next 14 days, so the team sees them coming a week out. ──
  const weekAhead = iso(new Date(Date.now() + 14 * 864e5));
  const events: { name: string; type: string; dateStart: string; dateEnd: string | null; venue: string | null; url: string | null; ticketsSold: number | null; capacity: number | null }[] = [];
  for (const e of (ebEvents as any[])) {
    const d = String(e.start_at || "").slice(0, 10);
    if (!d || d < todayStr || d > weekAhead) continue;
    if (/cancel|draft/i.test(e.status || "")) continue;
    events.push({
      name: e.name, type: /tune[\s-]?up/i.test(e.name || "") ? "Tune-Up Day" : "Event",
      dateStart: d, dateEnd: String(e.end_at || "").slice(0, 10) || null,
      venue: e.venue ?? null, url: e.url ?? null,
      ticketsSold: e.tickets_sold ?? null, capacity: e.capacity ?? null,
    });
  }
  // Same-day Tune-Up Days collapse into one line (five stores = one card), and
  // special events lead the section — they're the headline, not the service runs.
  const tuneUps = events.filter(e => e.type === "Tune-Up Day");
  const specials = events.filter(e => e.type !== "Tune-Up Day");
  const tuByDay = new Map<string, typeof events>();
  for (const e of tuneUps) tuByDay.set(e.dateStart, [...(tuByDay.get(e.dateStart) ?? []), e]);
  const groupedTuneUps = [...tuByDay.entries()].map(([day, list]) => {
    if (list.length === 1) return list[0];
    const stores = list.map(e => (e.venue || e.name.replace(/^Tune-?Up Day\s*[-·]\s*/i, "")).trim());
    const sold = list.reduce((s, e) => s + (e.ticketsSold ?? 0), 0);
    const cap = list.reduce((s, e) => s + (e.capacity ?? 0), 0);
    return { name: `Tune-Up Days · ${list.length} stores`, type: "Tune-Up Day", dateStart: day, dateEnd: null,
      venue: stores.join(" · "), url: null, ticketsSold: sold || null, capacity: cap || null };
  });
  const evOrder = (a: any, b: any) => a.dateStart.localeCompare(b.dateStart);
  events.length = 0;
  events.push(...specials.sort(evOrder), ...groupedTuneUps.sort(evOrder));

  // ── Tradeshows: their own section — coming up (next 45 days, with the deal
  // sheet) and just wrapped (last 21 days, with door attendance + post-show
  // report once attached). ──
  const reportIds = new Set((showReports as any[]).map((r: any) => String(r.tradeshow_id)));
  const doorByShow = new Map<string, number>();
  for (const a of (showAttendance as any[])) {
    const k = String(a.tradeshow_id);
    doorByShow.set(k, (doorByShow.get(k) ?? 0) + (Number(a.attendance) || 0));
  }
  const showAhead = iso(new Date(Date.now() + 45 * 864e5));
  const wrapCut = iso(new Date(Date.now() - 21 * 864e5));
  const showRow = (t: any) => ({
    name: t.name, dateStart: t.date_start, dateEnd: t.date_end ?? null,
    location: t.location ?? t.state ?? null,
    dealsUrl: t.deals_token ? `/deals/${t.deals_token}` : null,
    reportUrl: reportIds.has(String(t.id)) ? `/api/tradeshows/report/view?tradeshow_id=${t.id}` : null,
    attendance: doorByShow.get(String(t.id)) ?? null,
  });
  const tradeshows = {
    upcoming: (shows as any[])
      .filter((t: any) => t.date_start && t.date_start >= todayStr && t.date_start <= showAhead)
      .sort((a: any, b: any) => a.date_start.localeCompare(b.date_start)).map(showRow),
    wrapped: (shows as any[])
      .filter((t: any) => { const end = t.date_end ?? t.date_start; return end && end < todayStr && end >= wrapCut; })
      .sort((a: any, b: any) => (b.date_end ?? b.date_start).localeCompare(a.date_end ?? a.date_start)).map(showRow),
  };

  return { generatedAt: new Date().toISOString(), d2c, launches, promos, events, tradeshows, attention: attention.slice(0, 12), wins: { posts: topPosts, email }, paid, traffic };
}

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  // ?preview=1 → assemble the live auto-sections without saving, for the compose preview.
  if (params.get("preview")) return NextResponse.json({ ok: true, snapshot: await buildSnapshot() });
  // ?id=… → load one brief in full so it can be re-opened in the editor.
  const id = params.get("id");
  if (id) {
    const one = await fetch(`${sbUrl}/rest/v1/weekly_briefs?id=eq.${encodeURIComponent(id)}&select=id,share_token,week_label,intro,objectives,brand_updates,snapshot,published_at&limit=1`, { headers: h(), cache: "no-store" });
    const ot = await one.text();
    if (!one.ok) return NextResponse.json({ ok: false }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(ot || "[]")[0] ?? null });
  }
  // Drafts (null published_at) sort first — they're the ones still needing action.
  const res = await fetch(`${sbUrl}/rest/v1/weekly_briefs?select=id,share_token,week_label,published_at&order=published_at.desc.nullsfirst&limit=20`, { headers: h(), cache: "no-store" });
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
  const row: any = {
    share_token: randomBytes(9).toString("base64url"),
    week_label: b.weekLabel || new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
    intro: String(b.intro || "").slice(0, 4000),
    objectives: Array.isArray(b.objectives) ? b.objectives.slice(0, 50) : [],
    brand_updates: Array.isArray(b.brandUpdates) ? b.brandUpdates.slice(0, 50) : [],
    snapshot, published_at: b.draft ? null : new Date().toISOString(), created_by: access.user?.email ?? null,
  };
  const post = (r: any) => fetch(`${sbUrl}/rest/v1/weekly_briefs`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(r) });
  let res = await post(row);
  let text = await res.text();
  // Fallback if the brand_updates column hasn't been added yet — still publish.
  if (!res.ok && /brand_updates/i.test(text)) { const { brand_updates, ...rest } = row; res = await post(rest); text = await res.text(); }
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
  if (b.brandUpdates !== undefined) fields.brand_updates = Array.isArray(b.brandUpdates) ? b.brandUpdates.slice(0, 50) : [];
  if (b.week_label !== undefined) fields.week_label = String(b.week_label).slice(0, 120);
  // Publishing a draft (or re-publishing) rebuilds the snapshot so the frozen
  // figures are current as at the moment it actually goes out to the team.
  if (b.publish) { fields.published_at = new Date().toISOString(); fields.snapshot = await buildSnapshot(); }
  else if (b.refreshSnapshot) fields.snapshot = await buildSnapshot();
  const res = await fetch(`${sbUrl}/rest/v1/weekly_briefs?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(await res.text())[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/weekly_briefs?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h() });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
