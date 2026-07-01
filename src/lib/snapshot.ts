// Monthly brand "Performance Snapshot" — a one-page, print-ready report per brand.
// buildSnapshot() turns the dashboard data into the figures; snapshotHtml() renders
// the exact standalone HTML document (so it can be shown in an iframe, printed to PDF,
// or downloaded/emailed as a self-contained .html file).

import { fmt, fmtFull } from "./format";
import { buildChannels, channelColor, DIGITAL_CHANNELS, type ChannelSaleRow } from "./channels";

type IgPost = { brand_id: number; caption: string | null; media_type: string | null; permalink: string | null; posted_at: string | null; like_count: number; comments_count: number; image_url: string | null };

export type SnapshotInput = {
  brand: { id: number; name: string };
  month: string;            // selected month_key, e.g. "2026-06"
  monthKeys: string[];      // FY month keys in order
  monthLabels: string[];    // matching short labels, e.g. "Jun"
  fyLabel: string;          // e.g. "FY2025-26"
  monthly: { brand_id: number; month_key: string; revenue: number; orders: number }[];
  targets: { brand_id: number; month_key: string; revenue_target: number }[];
  googleAds: { brand_id: number; month_key: string; spend: number; roas: number }[];
  metaAds: { brand_id: number; month_key: string; spend: number; revenue: number; purchases: number }[];
  klaviyo: { brand_id: number; month_key: string; revenue: number; open_rate: number; click_rate: number; emails_sent?: number; list_size?: number; unsubscribes?: number; orders?: number; flow_revenue?: number; campaign_revenue?: number; bounces?: number; spam_complaints?: number }[];
  products: { brand_id: number; title: string; gross_sales: number }[];
  summaries: { brand_id: number; fy_refunds: number | null; fy_revenue: number }[];
  googleAdsCampaigns: { brand_id: number; month_key: string; campaign_name: string; spend: number; conv_value: number }[];
  // Whole-business (all channels) — built via buildChannels, so it needs the raw inputs
  brandsAll: { id: number; name: string }[];
  channelSales: ChannelSaleRow[];
  tradeshows: { id: string; date_start: string }[];
  tradeshowSales: { tradeshow_id: string; brand_id: number; revenue: number }[];
  shopifySources: { brand_id: number; month_key: string; source: string; revenue: number }[];
  instagramMedia: IgPost[];
  // Marketing budget vs spend (budgets already filtered to the FY, actuals to the FY months upstream)
  marketingBudgets: { brand_id: number; channel: string; annual_budget: number }[];
  budgetTopups?: { brand_id: number; month_key: string; channel: string; amount: number }[];
  marketingActuals: { brand_id: number; month_key: string; channel: string; spend: number }[];
  // AI insight narrative + SEMrush organic data for the "opportunities to move" block
  brandInsights: { brand_id: number; content: string; generated_at: string }[];
  semrushMetrics: { brand_id: number; month_key: string; organic_keywords: number; organic_traffic: number; traffic_value: number }[];
  semrushKeywords: { brand_id: number; month_key: string; phrase: string; position: number; search_volume: number; cpc: number; url: string }[];
  note?: string;            // editable commentary rendered into the report
  insightsOverride?: string; // edited "Insights and opportunities" text; replaces the AI version
};

// Rates may arrive as a fraction (0.515) or already as a percentage (51.5). Normalise to a percentage.
const pct = (n: number) => (n != null && n <= 1 ? n * 100 : n) || 0;
const delta = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

export type Snapshot = ReturnType<typeof buildSnapshot>;

export function buildSnapshot(d: SnapshotInput) {
  const { brand, month, monthKeys, monthLabels } = d;
  const idx = monthKeys.indexOf(month);
  const prevMonth = idx > 0 ? monthKeys[idx - 1] : null;
  const monthName = monthLabels[idx] ?? month;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [yy, mm] = month.split("-").map(Number);
  const monthLong = MONTHS[(mm || 1) - 1] ?? monthName;
  const monthFull = `${monthLong} ${yy || ""}`.trim();

  const forBrand = <T extends { brand_id: number }>(rows: T[]) => rows.filter(r => r.brand_id === brand.id);
  const at = <T extends { month_key: string }>(rows: T[], mk: string | null) => rows.find(r => r.month_key === mk);

  // ── Direct to consumer ──────────────────────────────────────────────
  const monthlyB = forBrand(d.monthly);
  const moRow = at(monthlyB, month);
  const monthRev = moRow?.revenue ?? 0;
  const monthOrders = moRow?.orders ?? 0;
  const aov = monthOrders > 0 ? monthRev / monthOrders : 0;
  // YTD = months elapsed up to and including the selected month
  const ytdRev = sum(monthlyB.filter(m => monthKeys.indexOf(m.month_key) <= idx).map(m => m.revenue));
  const fyRevTotal = sum(monthlyB.map(m => m.revenue));
  const monthTarget = at(forBrand(d.targets), month)?.revenue_target ?? 0;
  const fyTarget = sum(forBrand(d.targets).map(t => t.revenue_target));
  const targetMultiple = fyTarget > 0 ? ytdRev / fyTarget : null;
  const sm = forBrand(d.summaries)[0];
  const returnRate = sm && sm.fy_revenue > 0 && sm.fy_refunds != null ? Math.abs(sm.fy_refunds / sm.fy_revenue) * 100 : null;

  // ── Google Ads ──────────────────────────────────────────────────────
  const gNow = at(forBrand(d.googleAds), month);
  const gPrev = at(forBrand(d.googleAds), prevMonth);
  const gSpend = gNow?.spend ?? 0, gRoas = gNow?.roas ?? 0, gRev = gRoas * gSpend;
  const gRevPrev = (gPrev?.roas ?? 0) * (gPrev?.spend ?? 0);
  const gCampaigns = forBrand(d.googleAdsCampaigns).filter(c => c.month_key === month && c.spend > 100)
    .map(c => ({ name: c.campaign_name, roas: c.spend > 0 ? c.conv_value / c.spend : 0 }))
    .sort((a, b) => b.roas - a.roas);
  const topCampaign = gCampaigns[0] ?? null;

  // ── Meta Ads ────────────────────────────────────────────────────────
  const mNow = at(forBrand(d.metaAds), month);
  const mPrev = at(forBrand(d.metaAds), prevMonth);
  const mSpend = mNow?.spend ?? 0, mRev = mNow?.revenue ?? 0;
  const mRoas = mSpend > 0 ? mRev / mSpend : 0;
  const mCpa = (mNow?.purchases ?? 0) > 0 ? mSpend / (mNow!.purchases) : 0;
  const mCpaPrev = (mPrev?.purchases ?? 0) > 0 ? (mPrev!.spend) / (mPrev!.purchases) : 0;

  // ── Blended paid ROAS ───────────────────────────────────────────────
  const blendedRoas = (gSpend + mSpend) > 0 ? (gRev + mRev) / (gSpend + mSpend) : 0;
  const blendedPrev = ((gPrev?.spend ?? 0) + (mPrev?.spend ?? 0)) > 0
    ? (gRevPrev + (mPrev?.revenue ?? 0)) / ((gPrev?.spend ?? 0) + (mPrev?.spend ?? 0)) : 0;

  // ── Email · Klaviyo ─────────────────────────────────────────────────
  const kNow = at(forBrand(d.klaviyo), month);
  const kPrev = at(forBrand(d.klaviyo), prevMonth);
  const kRev = kNow?.revenue ?? 0;
  const openRate = pct(kNow?.open_rate ?? 0);
  const clickRate = pct(kNow?.click_rate ?? 0);
  const email = {
    rev: kRev, openRate, clickRate, revDelta: delta(kRev, kPrev?.revenue ?? 0),
    sent: kNow?.emails_sent ?? 0, listSize: kNow?.list_size ?? 0,
    flowRev: kNow?.flow_revenue ?? 0, campaignRev: kNow?.campaign_revenue ?? 0,
    orders: kNow?.orders ?? 0, unsubs: kNow?.unsubscribes ?? 0,
    bounces: kNow?.bounces ?? 0, spam: kNow?.spam_complaints ?? 0,
  };

  // ── Top product (FY) ────────────────────────────────────────────────
  const topProduct = [...forBrand(d.products)].sort((a, b) => b.gross_sales - a.gross_sales)[0] ?? null;

  // ── Whole business (all channels, not just D2C) ─────────────────────
  const channels = buildChannels(brand.id, {
    brands: d.brandsAll, channelSales: d.channelSales, monthly: d.monthly,
    tradeshows: d.tradeshows, tradeshowSales: d.tradeshowSales, shopifySources: d.shopifySources,
    monthKeys, latest: month,
  });
  const wholeFy = sum(channels.map(c => c.fy));
  const wholeMonth = sum(channels.map(c => c.latest));
  const wholeTrend = monthKeys.map((_, i) => sum(channels.map(c => c.series[i] ?? 0)));
  const digitalFy = sum(channels.filter(c => DIGITAL_CHANNELS.has(c.name)).map(c => c.fy));
  const digitalShare = wholeFy > 0 ? (digitalFy / wholeFy) * 100 : 0;
  const channelRows = channels.filter(c => c.fy > 0).map(c => ({
    name: c.name, fy: c.fy, latest: c.latest, color: channelColor(c.name),
    share: wholeFy > 0 ? (c.fy / wholeFy) * 100 : 0,
  }));
  // Website Sales + Tradeshows roll up under a "Direct to Consumer" parent (shown with
  // the two split underneath). Used by the report's channel donut + legend.
  const DTC_NAMES = ["Website Sales", "Tradeshows"];
  const dtcKids = channelRows.filter(c => DTC_NAMES.includes(c.name));
  type ChGroup = (typeof channelRows)[number] & { kids?: typeof channelRows };
  const channelGroups: ChGroup[] = dtcKids.length >= 2
    ? (() => {
        const others: ChGroup[] = channelRows.filter(c => !DTC_NAMES.includes(c.name));
        const fy = sum(dtcKids.map(k => k.fy));
        const grp: ChGroup = { name: "Direct to Consumer", fy, latest: sum(dtcKids.map(k => k.latest)), color: "#0f766e", share: wholeFy > 0 ? (fy / wholeFy) * 100 : 0, kids: [...dtcKids].sort((a, b) => b.fy - a.fy) };
        return [...others, grp].sort((a, b) => b.fy - a.fy);
      })()
    : channelRows;

  // ── Top Instagram posts (by engagement) ─────────────────────────────
  const igPosts = forBrand(d.instagramMedia)
    .map(p => ({ ...p, engagement: (p.like_count || 0) + (p.comments_count || 0) }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);

  // ── Marketing budget vs spend (this month) ──────────────────────────
  // Total spend mirrors the MER definition: Google + Meta + other marketing actuals
  // (the actuals table also carries Google/Meta lines, so exclude those to avoid double counting).
  // Per-channel monthly budget = the per-month override if set, else annual ÷ 12.
  const bRows = forBrand(d.marketingBudgets);
  const annualBudget = sum(bRows.map((b: any) => b.annual_budget));
  const bTopups = forBrand(d.budgetTopups ?? []);
  const ovr = (channel: string, mk: string): number | null => { const t = bTopups.find((x: any) => x.channel === channel && x.month_key === mk); return t ? (Number(t.amount) || 0) : null; };
  const mBudget = (mk: string) => sum(bRows.map((b: any) => { const o = ovr(b.channel, mk); return o != null ? o : b.annual_budget / 12; }));
  const monthsUpto = monthKeys.slice(0, idx + 1);
  const monthBudget = mBudget(month);
  const otherSpend = sum(forBrand(d.marketingActuals).filter(a => a.month_key === month && a.channel !== "Google Advertising" && a.channel !== "Social Media (Meta)").map(a => a.spend));
  const mktSpend = gSpend + mSpend + otherSpend;
  // MER = booked D2C revenue ÷ total marketing spend. The un-gameable efficiency
  // number (platform-attributed ROAS overlaps across channels and can't be summed).
  const mer = mktSpend > 0 ? monthRev / mktSpend : 0;
  // Financial year to date: spend across every month up to and including the selected one,
  // vs the monthly budget summed across those months (overrides honoured).
  const ytdSpend = sum(forBrand(d.googleAds).filter(r => monthsUpto.includes(r.month_key)).map(r => r.spend))
    + sum(forBrand(d.metaAds).filter(r => monthsUpto.includes(r.month_key)).map(r => r.spend))
    + sum(forBrand(d.marketingActuals).filter(a => monthsUpto.includes(a.month_key) && a.channel !== "Google Advertising" && a.channel !== "Social Media (Meta)").map(a => a.spend));
  const ytdBudget = sum(monthsUpto.map(mBudget));
  const mktChannels = [
    { name: "Google", spend: gSpend, color: "#2D4977" },
    { name: "Meta", spend: mSpend, color: "#6691AB" },
    { name: "Other", spend: otherSpend, color: "#BDD4E7" },
  ].filter(c => c.spend > 0);

  // ── AI insight + SEMrush organic opportunities ──────────────────────
  const aiInsight = (d.insightsOverride && d.insightsOverride.trim())
    ? d.insightsOverride
    : ([...forBrand(d.brandInsights)].sort((a, b) => (b.generated_at || "").localeCompare(a.generated_at || ""))[0]?.content ?? "");
  const smRows = forBrand(d.semrushKeywords);
  const smMonth = [...new Set(smRows.map(k => k.month_key))].sort().pop() ?? null;
  const opportunities = smRows
    .filter(k => k.month_key === smMonth && k.position >= 4 && k.position <= 20 && k.search_volume > 0)
    .sort((a, b) => b.search_volume - a.search_volume)
    .slice(0, 6)
    .map(k => ({ phrase: k.phrase, position: Math.round(k.position), volume: k.search_volume, cpc: k.cpc, url: k.url }));
  const smMetric = forBrand(d.semrushMetrics).find(m => m.month_key === smMonth)
    ?? [...forBrand(d.semrushMetrics)].sort((a, b) => b.month_key.localeCompare(a.month_key))[0];
  const seo = {
    month: smMonth,
    keywords: smMetric?.organic_keywords ?? 0,
    traffic: smMetric?.organic_traffic ?? 0,
    value: smMetric?.traffic_value ?? 0,
    opportunities,
  };

  // ── Seasonality (share of FY revenue per month) ─────────────────────
  const seasonal = monthKeys.map((mk, i) => ({
    label: monthLabels[i], month_key: mk,
    rev: at(monthlyB, mk)?.revenue ?? 0,
    share: fyRevTotal > 0 ? ((at(monthlyB, mk)?.revenue ?? 0) / fyRevTotal) * 100 : 0,
  }));
  const peakShare = Math.max(...seasonal.map(s => s.share), 0.001);
  const topShare = [...seasonal].sort((a, b) => b.share - a.share)[0];

  return {
    brand, month, monthName, monthLong, monthFull, fyLabel: d.fyLabel,
    monthRev, monthOrders, aov, ytdRev, fyRevTotal, monthTarget, fyTarget, targetMultiple, returnRate,
    google: { spend: gSpend, rev: gRev, roas: gRoas, revDelta: delta(gRev, gRevPrev), roasDelta: delta(gRoas, gPrev?.roas ?? 0), topCampaign },
    meta: { spend: mSpend, rev: mRev, roas: mRoas, cpa: mCpa, revDelta: delta(mRev, mPrev?.revenue ?? 0), roasDelta: delta(mRoas, mPrev && mPrev.spend > 0 ? mPrev.revenue / mPrev.spend : 0), cpaDelta: delta(mCpa, mCpaPrev) },
    blendedRoas, blendedDelta: delta(blendedRoas, blendedPrev), mer,
    email,
    topProduct,
    seasonal, peakShare, peakMonthKey: topShare?.month_key,
    wholeFy, wholeMonth, wholeTrend, digitalShare, channelRows, channelGroups,
    marketing: { annualBudget, monthBudget, spend: mktSpend, channels: mktChannels, ytdSpend, ytdBudget },
    aiInsight, seo,
    igPosts, monthLabelsAll: monthLabels,
    note: d.note ?? "",
  };
}

// ── HTML rendering ─────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const up = (n: number | null, suffix = "%") => n == null ? "" : ` <span class="up">${n >= 0 ? "+" : ""}${n.toFixed(0)}${suffix}</span>`;
const roundPct = (n: number) => `${n.toFixed(1)}%`;

// Inline SVG donut/pie — no JS, so it survives in the downloaded HTML and the PDF.
export function svgPie(slices: { value: number; color: string }[], centerText = "", size = 160): string {
  const pos = slices.filter(s => s.value > 0);
  const total = pos.reduce((t, s) => t + s.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 3, inner = r * 0.6;
  const pt = (rad: number, ang: number): [string, string] => [(cx + rad * Math.cos(ang)).toFixed(2), (cy + rad * Math.sin(ang)).toFixed(2)];
  let a0 = -Math.PI / 2, seg = "";
  if (pos.length === 1) {
    seg = `<circle cx="${cx}" cy="${cy}" r="${((r + inner) / 2).toFixed(1)}" fill="none" stroke="${pos[0].color}" stroke-width="${(r - inner).toFixed(1)}"/>`;
  } else {
    seg = pos.map(s => {
      const frac = s.value / total, a1 = a0 + frac * 2 * Math.PI, large = frac > 0.5 ? 1 : 0;
      const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1), [ix1, iy1] = pt(inner, a1), [ix0, iy0] = pt(inner, a0);
      const d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${ix1},${iy1} A${inner},${inner} 0 ${large} 0 ${ix0},${iy0} Z`;
      a0 = a1;
      return `<path d="${d}" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>`;
    }).join("");
  }
  const center = centerText ? `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="9" fill="#6a7787" font-weight="600">Total</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="15" fill="#2D4977" font-weight="800">${esc(centerText)}</text>` : "";
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">${seg}${center}</svg>`;
}

// Inline SVG area+line chart — no JS, so it survives in the downloaded HTML and the PDF.
function svgArea(values: number[], labels: string[], color = "#2D4977"): string {
  const W = 770, H = 168, padX = 6, padTop = 18, padBot = 22;
  const max = Math.max(...values, 1), n = values.length;
  const x = (i: number) => padX + (n > 1 ? (i / (n - 1)) * (W - 2 * padX) : 0);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBot);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = pts.join(" ");
  const area = `${x(0).toFixed(1)},${(H - padBot).toFixed(1)} ${line} ${x(n - 1).toFixed(1)},${(H - padBot).toFixed(1)}`;
  const peakI = values.indexOf(max);
  const ticks = labels.map((l, i) => (i % 2 === 0 || i === n - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="8.5" fill="#9aa6b4" font-weight="600">${esc(l)}</text>` : "").join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">
    <polygon points="${area}" fill="${color}" opacity="0.08"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === peakI ? 3.6 : 2.2}" fill="${color}"/>`).join("")}
    <text x="${x(peakI).toFixed(1)}" y="${(y(max) - 6).toFixed(1)}" text-anchor="middle" font-size="9" fill="${color}" font-weight="800">${fmt(max)}</text>
    ${ticks}
  </svg>`;
}

export function snapshotHtml(s: Snapshot): string {
  const bars = s.seasonal.map(m => {
    const h = Math.max(4, Math.round((m.share / s.peakShare) * 100));
    const isPeak = m.month_key === s.peakMonthKey || m.month_key === s.month;
    const showVal = isPeak && m.share > 0;
    const showM = isPeak || s.seasonal.indexOf(m) === 0 || s.seasonal.indexOf(m) === s.seasonal.length - 1;
    return `<div class="b${isPeak ? " peak" : ""}" style="height:${h}%">${showVal ? `<span class="v">${m.share.toFixed(1)}%</span>` : ""}${showM ? `<span class="m">${esc(m.label)}</span>` : ""}</div>`;
  }).join("");

  const ytdNote = s.targetMultiple != null
    ? `${s.targetMultiple.toFixed(1)}× the full-year D2C target`
    : `Direct-to-consumer revenue, financial year to date`;
  const d2cTag = s.monthTarget > 0
    ? (s.monthRev >= s.monthTarget ? `${s.monthLong} revenue ran ahead of target` : `${Math.round((s.monthRev / s.monthTarget) * 100)}% of the ${s.monthLong} target`)
    : "";
  const emailTag = s.email.openRate >= 30 ? "Open rate well above sector benchmark" : "";
  const googleTag = (s.google.revDelta ?? 0) > 0 ? "Revenue growing on steady spend" : "";
  const metaTag = (s.meta.cpaDelta ?? 0) < 0 ? "Acquisition getting cheaper as it scales" : "";

  const card = (h: string, rows: string, tag: string) =>
    `<div class="card"><div class="h">${h}</div><div class="rows">${rows}</div>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>`;
  const r = (k: string, v: string) => `<div class="r"><span class="k">${k}</span><span class="val">${v}</span></div>`;

  // Whole-business section: KPI strip + channel split (bar + legend) + monthly revenue trend graph.
  // Website Sales + Tradeshows roll up under a "Direct to Consumer" parent. The pie +
  // top-level rows use the groups (so they sum to the real total / 100%); the two
  // components show indented underneath with their $ only (no %), so they read as a
  // breakdown of D2C and can never be misread as additional, additive channels.
  const chanPie = svgPie(s.channelGroups.map(c => ({ value: c.fy, color: c.color })), fmt(s.wholeFy));
  const chanLegend = s.channelGroups.map(c => {
    const row = `<div class="cr"><span class="dot" style="background:${c.color}"></span><span class="cn">${esc(c.name)}</span><span class="cv">${fmtFull(c.fy)}</span><span class="cp">${c.share.toFixed(0)}%</span></div>`;
    const kids = c.kids ? c.kids.map(k => `<div class="cr ck"><span class="dot sm" style="background:${k.color}"></span><span class="cn">${esc(k.name)}</span><span class="cv">${fmtFull(k.fy)}</span><span class="cp"></span></div>`).join("") : "";
    return row + kids;
  }).join("");
  const wholeSection = s.wholeFy > 0 ? `
  <div class="sec">
    <div class="h">Whole business · all channels</div>
    <div class="kpis">
      <div class="c"><div class="l">Total brand revenue · FY</div><div class="v">${fmt(s.wholeFy)}</div></div>
      <div class="c"><div class="l">${esc(s.monthLong)} · all channels</div><div class="v">${fmt(s.wholeMonth)}</div></div>
      <div class="c"><div class="l">Channels</div><div class="v">${s.channelGroups.length}</div></div>
      <div class="c"><div class="l">Digital share</div><div class="v">${s.digitalShare.toFixed(0)}%</div></div>
    </div>
    <div class="chanwrap">
      <div style="display:flex;justify-content:center">${chanPie}</div>
      <div class="chanlist">${chanLegend}</div>
    </div>
    <div class="trend"><div class="tl">Total revenue by month · ${esc(s.fyLabel)}</div>${svgArea(s.wholeTrend, s.monthLabelsAll)}</div>
  </div>` : "";

  // Marketing budget vs spend section: KPI strip + spend-by-channel bar/legend.
  const mk = s.marketing;
  const mkTot = mk.channels.reduce((t, c) => t + c.spend, 0) || 1;
  const mkDiff = mk.monthBudget - mk.spend; // positive => under budget
  const mkBar = mk.channels.map(c => `<div style="width:${((c.spend / mkTot) * 100).toFixed(2)}%;background:${c.color}" title="${esc(c.name)}: ${fmtFull(c.spend)}"></div>`).join("");
  const mkLegend = mk.channels.map(c => `<div class="cr"><span class="dot" style="background:${c.color}"></span><span class="cn">${esc(c.name)}</span><span class="cv">${fmtFull(c.spend)}</span><span class="cp">${Math.round((c.spend / mkTot) * 100)}%</span></div>`).join("");
  const marketingSection = (mk.monthBudget > 0 || mk.spend > 0) ? `
  <div class="sec">
    <div class="h">Marketing budget &amp; spend · ${esc(s.monthLong)}</div>
    <div class="kpis">
      <div class="c"><div class="l">Monthly budget</div><div class="v">${fmt(mk.monthBudget)}</div></div>
      <div class="c"><div class="l">${esc(s.monthLong)} spend</div><div class="v">${fmt(mk.spend)}</div></div>
      <div class="c"><div class="l">% of budget</div><div class="v">${mk.monthBudget > 0 ? Math.round((mk.spend / mk.monthBudget) * 100) : "—"}%</div></div>
      <div class="c"><div class="l">${mkDiff >= 0 ? "Under budget" : "Over budget"}</div><div class="v">${fmt(Math.abs(mkDiff))}</div></div>
    </div>
    ${mk.channels.length ? `<div class="chanwrap"><div><div class="chanbar">${mkBar}</div></div><div class="chanlist">${mkLegend}</div></div>` : ""}
    ${mk.ytdBudget > 0 ? `<div class="seostat" style="margin-top:10px">Financial year to date: <strong>${fmt(mk.ytdSpend)}</strong> spent of <strong>${fmt(mk.ytdBudget)}</strong> budgeted &middot; <strong>${Math.round((mk.ytdSpend / mk.ytdBudget) * 100)}%</strong> ${mk.ytdSpend <= mk.ytdBudget ? "of pace" : "over pace"}</div>` : ""}
  </div>` : "";

  // Email · Klaviyo — the full monthly email dataset.
  const em = s.email;
  const emailSection = (em.sent > 0 || em.rev > 0) ? `
  <div class="sec">
    <div class="h">Email &middot; Klaviyo &middot; ${esc(s.monthLong)}</div>
    <div class="kpis">
      <div class="c"><div class="l">Emails delivered</div><div class="v">${em.sent.toLocaleString()}</div></div>
      <div class="c"><div class="l">Open rate</div><div class="v">${em.openRate.toFixed(1)}%</div></div>
      <div class="c"><div class="l">Click rate</div><div class="v">${em.clickRate.toFixed(1)}%</div></div>
      <div class="c"><div class="l">Attributed revenue</div><div class="v">${fmt(em.rev)}</div></div>
    </div>
    <div class="seostat">Flow <strong>${fmt(em.flowRev)}</strong> &middot; Campaign <strong>${fmt(em.campaignRev)}</strong> &middot; Orders <strong>${em.orders.toLocaleString()}</strong> &middot; Unsubscribes <strong>${em.unsubs.toLocaleString()}</strong>${em.bounces ? ` &middot; Bounces <strong>${em.bounces.toLocaleString()}</strong>` : ""}</div>
  </div>` : "";

  // Top Instagram posts by engagement.
  const igCards = s.igPosts.map(p => `<div class="igc"><div class="igimg"${p.image_url ? ` style="background-image:url('${esc(p.image_url)}')"` : ""}></div><div class="igb"><div class="igm">&#9829; ${p.like_count.toLocaleString()} &middot; ${p.comments_count.toLocaleString()} comments</div><div class="igcap">${esc((p.caption || "").replace(/\s+/g, " ").slice(0, 90))}</div></div></div>`).join("");
  const igSection = s.igPosts.length ? `
  <div class="sec">
    <div class="h">Top Instagram posts · by engagement</div>
    <div class="iggrid">${igCards}</div>
  </div>` : "";

  // AI insights + SEMrush "opportunities to move" (striking-distance keywords).
  const cleanInsight = (t: string) => esc(t).replace(/^#{1,6}\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ").replace(/\*\*(.+?)\*\*/g, "$1").trim().slice(0, 2000);
  const opp = s.seo.opportunities;
  const oppRows = opp.map(o => `<tr><td><span class="pos">#${o.position}</span> &nbsp;${esc(o.phrase)}</td><td class="r">${o.volume.toLocaleString()}</td><td class="r">${o.cpc ? "$" + o.cpc.toFixed(2) : "—"}</td></tr>`).join("");
  const aiBlock = s.aiInsight ? `<div class="ai"><div class="aitext">${cleanInsight(s.aiInsight).replace(/\n/g, "<br>")}</div></div>` : "";
  const seoBlock = opp.length ? `
    <div class="h" style="margin-top:24px">SEO opportunities</div>
    <div class="seostat">SEMrush organic visibility: <strong>${s.seo.keywords.toLocaleString()}</strong> keywords · <strong>${Math.round(s.seo.traffic).toLocaleString()}</strong> est. visits/mo · <strong>${fmt(s.seo.value)}</strong> traffic value</div>
    <table class="optbl"><thead><tr><th>Opportunity to move &middot; ranks 4&ndash;20</th><th class="r">Searches/mo</th><th class="r">CPC</th></tr></thead><tbody>${oppRows}</tbody></table>` : "";
  const aiSection = (aiBlock || seoBlock) ? `
  <div class="sec">
    <div class="h">Insights and opportunities</div>
    ${aiBlock}
    ${seoBlock}
  </div>` : "";

  const notesSection = (s.note && s.note.trim()) ? `
  <div class="notes"><div class="h">Notes &amp; commentary</div><div class="ntext">${esc(s.note.trim()).replace(/\n/g, "<br>")}</div></div>` : "";

  return `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.brand.name)} · ${esc(s.monthLong)} Performance Snapshot</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--navy:#0e7490;--blue:#0891b2;--blue-soft:#7dd3e8;--blue-wash:#ecfeff;--ink:#1c2733;--grey:#6a7787;--line:#e4e9ef;--up:#2f8d68;--paper:#fff;--bg:#eef1f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--ink);padding:28px 16px;-webkit-font-smoothing:antialiased;}
.page{max-width:860px;margin:0 auto;background:var(--paper);box-shadow:0 6px 30px rgba(20,30,50,.10);padding:42px 46px 30px;}
.eyebrow{font-size:11px;letter-spacing:.22em;font-weight:700;color:var(--blue);text-transform:uppercase;}
.masthead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--navy);padding-bottom:16px;}
.masthead h1{font-size:30px;font-weight:800;color:var(--navy);line-height:1.05;margin-top:6px;letter-spacing:-.02em;}
.masthead .sub{font-size:12.5px;color:var(--grey);margin-top:7px;font-weight:500;}
.stamp{text-align:right;font-size:11px;color:var(--grey);line-height:1.5;font-weight:500;}
.stamp strong{color:var(--navy);font-weight:700;display:block;font-size:12px;}
.hero{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);margin-top:22px;border:1px solid var(--line);}
.hero .cell{background:var(--paper);padding:18px 20px;}
.hero .lab{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--grey);font-weight:600;}
.hero .big{font-size:34px;font-weight:800;color:var(--navy);letter-spacing:-.025em;line-height:1.05;margin-top:8px;}
.hero .note{font-size:11.5px;color:var(--ink);margin-top:6px;font-weight:500;}
.hero .note .up{color:var(--up);font-weight:700;}
.seasonal{display:flex;align-items:center;gap:26px;margin-top:24px;background:var(--blue-wash);border:1px solid var(--blue-soft);padding:18px 22px;}
.seasonal .copy{flex:0 0 220px;}
.seasonal .copy .t{font-size:12.5px;font-weight:700;color:var(--navy);letter-spacing:.02em;}
.seasonal .copy .d{font-size:11.5px;color:var(--ink);margin-top:6px;line-height:1.45;font-weight:500;}
.bars{flex:1;display:flex;align-items:flex-end;gap:5px;height:74px;}
.bars .b{flex:1;background:var(--blue-soft);border-radius:2px 2px 0 0;position:relative;}
.bars .b.peak{background:var(--navy);}
.bars .b .v{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:9.5px;font-weight:700;color:var(--navy);white-space:nowrap;}
.bars .b .m{position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--grey);font-weight:600;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:30px;}
.card{border:1px solid var(--line);border-top:3px solid var(--blue);padding:15px 17px 16px;}
.card .h{font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:700;color:var(--navy);}
.rows{margin-top:11px;display:flex;flex-direction:column;gap:9px;}
.r{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
.r .k{font-size:12px;color:var(--grey);font-weight:500;}
.r .val{font-size:14.5px;font-weight:700;color:var(--ink);text-align:right;}
.r .val .up{color:var(--up);font-weight:700;font-size:11.5px;margin-left:5px;}
.tag{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:var(--blue-wash);color:var(--navy);padding:2px 7px;border-radius:3px;margin-top:11px;}
.product{margin-top:14px;display:flex;justify-content:space-between;align-items:center;background:var(--navy);color:#fff;padding:14px 20px;}
.product .l .lab{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue-soft);font-weight:600;}
.product .l .name{font-size:14.5px;font-weight:700;margin-top:3px;}
.product .l .sub{font-size:10.5px;color:var(--blue-soft);margin-top:2px;font-weight:500;}
.product .v{font-size:26px;font-weight:800;letter-spacing:-.02em;}
.foot{margin-top:20px;border-top:1px solid var(--line);padding-top:12px;font-size:10px;color:var(--grey);line-height:1.55;font-weight:500;}
.foot strong{color:var(--navy);}
.sec{margin-top:30px;}
.sec>.h{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--navy);border-bottom:1px solid var(--line);padding-bottom:7px;margin-bottom:14px;}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:16px;}
.kpis .c{background:var(--paper);padding:13px 15px;}
.kpis .c .l{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);font-weight:600;}
.kpis .c .v{font-size:22px;font-weight:800;color:var(--navy);margin-top:5px;letter-spacing:-.02em;}
.chanwrap{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center;}
.chanbar{display:flex;height:26px;border-radius:5px;overflow:hidden;background:#eef2f6;border:1px solid var(--line);}
.chanbar>div{height:100%;}
.chanlist{display:flex;flex-direction:column;gap:7px;}
.cr{display:flex;align-items:center;gap:8px;font-size:11.5px;}
.cr .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}
.cr .cn{flex:1;color:var(--ink);font-weight:600;}
.cr .cv{color:var(--grey);font-weight:600;}
.cr .cp{width:42px;text-align:right;color:var(--navy);font-weight:800;}
.cr.ck{padding-left:16px;}
.cr.ck .cn{color:var(--grey);font-weight:500;}
.cr .dot.sm{width:7px;height:7px;}
.trend{margin-top:16px;border:1px solid var(--line);padding:14px 16px 8px;}
.trend .tl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--grey);font-weight:700;margin-bottom:6px;}
.iggrid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
.igc{border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fbfcfd;}
.igc .igimg{height:108px;background:#dde6ef;background-size:cover;background-position:center;}
.igc .igb{padding:8px 9px 10px;}
.igc .igm{font-size:10px;font-weight:800;color:var(--navy);}
.igc .igcap{font-size:9.5px;color:var(--grey);margin-top:4px;line-height:1.35;font-weight:500;max-height:38px;overflow:hidden;}
.ai{border-left:3px solid var(--blue);background:#fbfcfd;padding:13px 16px;margin-bottom:14px;}
.ai .aitext{font-size:11.5px;color:var(--ink);line-height:1.6;font-weight:500;}
.seostat{font-size:11px;color:var(--grey);font-weight:600;margin:4px 0 2px;}
.seostat strong{color:var(--navy);font-weight:800;}
.optbl{width:100%;border-collapse:collapse;margin-top:8px;font-size:11.5px;}
.optbl th{text-align:left;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--grey);font-weight:700;padding:0 0 6px;border-bottom:1px solid var(--line);}
.optbl th.r,.optbl td.r{text-align:right;}
.optbl td{padding:7px 0;border-bottom:1px solid var(--line);color:var(--ink);font-weight:500;}
.optbl .pos{display:inline-block;min-width:26px;text-align:center;font-weight:800;color:#fff;background:var(--blue);border-radius:3px;font-size:10px;padding:1px 0;}
.notes{margin-top:30px;border:1px solid var(--blue-soft);background:var(--blue-wash);padding:16px 18px;}
.notes .h{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--navy);margin-bottom:9px;}
.notes .ntext{font-size:12px;color:var(--ink);line-height:1.6;font-weight:500;}
@media print{body{background:#fff;padding:0;}.page{box-shadow:none;max-width:none;padding:30px 34px;}@page{size:A4;margin:12mm;}.sec,.notes{break-inside:avoid;}.iggrid{break-inside:avoid;}.pagebreak{page-break-before:always;break-before:page;}}
@media(max-width:680px){.hero{grid-template-columns:1fr;}.grid{grid-template-columns:1fr;}.seasonal{flex-direction:column;align-items:stretch;}.seasonal .copy{flex:none;}.masthead{flex-direction:column;align-items:flex-start;gap:10px;}.stamp{text-align:left;}.kpis{grid-template-columns:1fr 1fr;}.chanwrap{grid-template-columns:1fr;}.iggrid{grid-template-columns:1fr 1fr;}}
</style></head>
<body><div class="page">
  <div class="masthead">
    <div>
      <div class="eyebrow">${esc(s.brand.name)} Australia</div>
      <h1>${esc(s.monthFull)}<br>Performance Snapshot</h1>
      <div class="sub">Whole-of-business sales and marketing performance · ${esc(s.fyLabel)}</div>
    </div>
    <div class="stamp"><strong>Coolkidz Australia</strong>Official AU distributor<br>Prepared ${esc(s.monthFull)}</div>
  </div>

  ${wholeSection}

  ${marketingSection}

  <div class="hero pagebreak">
    <div class="cell"><div class="lab">D2C revenue YTD</div><div class="big">${fmt(s.ytdRev)}</div><div class="note">${ytdNote}</div></div>
    <div class="cell"><div class="lab">${esc(s.monthLong)} D2C revenue</div><div class="big">${fmtFull(s.monthRev)}</div><div class="note">${s.monthOrders} orders · ${fmtFull(s.aov)} average order value</div></div>
    <div class="cell"><div class="lab">MER · ${esc(s.monthLong)}</div><div class="big">${s.mer > 0 ? s.mer.toFixed(2) + "×" : "—"}</div><div class="note">booked D2C revenue ÷ total marketing spend</div></div>
    <div class="cell"><div class="lab">Blended paid ROAS · ${esc(s.monthLong)}</div><div class="big">${s.blendedRoas.toFixed(2)}×</div><div class="note">platform-claimed · channel diagnostic only</div></div>
  </div>
  <div class="seostat" style="margin-top:16px;margin-bottom:8px">MER (revenue ÷ total spend) is the true efficiency measure. Per-platform ROAS (Google, Meta, email) is attributed inside each platform's own window, so those figures overlap and <strong>cannot be added together</strong>.</div>

  <div class="seasonal">
    <div class="copy"><div class="t">Where the year's revenue lands</div><div class="d">Share of the financial year's direct-to-consumer revenue by month. The navy bars are the peak.</div></div>
    <div class="bars">${bars}</div>
  </div>

  <div class="grid">
    ${card(`Direct to consumer · Shopify`, [
      r(`${s.monthLong} revenue`, fmtFull(s.monthRev)),
      r(`${s.monthLong} orders`, String(s.monthOrders)),
      r(`Average order value`, fmtFull(s.aov)),
      s.returnRate != null ? r(`FY return rate`, roundPct(s.returnRate)) : "",
    ].join(""), d2cTag)}
    ${card(`Email · Klaviyo · ${s.monthLong}`, [
      r(`Attributed revenue`, `${fmtFull(s.email.rev)}${up(s.email.revDelta)}`),
      r(`Open rate`, roundPct(s.email.openRate)),
      r(`Click rate`, roundPct(s.email.clickRate)),
    ].join(""), emailTag)}
    ${card(`Google Ads · ${s.monthLong}`, [
      r(`Spend`, fmtFull(s.google.spend)),
      r(`Revenue`, `${fmtFull(s.google.rev)}${up(s.google.revDelta)}`),
      r(`ROAS`, `${s.google.roas.toFixed(2)}×${up(s.google.roasDelta)}`),
      s.google.topCampaign ? r(`Top campaign`, `${s.google.topCampaign.roas.toFixed(1)}× ROAS`) : "",
    ].join(""), googleTag)}
    ${card(`Meta Ads · ${s.monthLong}`, [
      r(`Spend`, fmtFull(s.meta.spend)),
      r(`Revenue`, `${fmtFull(s.meta.rev)}${up(s.meta.revDelta)}`),
      r(`ROAS`, `${s.meta.roas.toFixed(2)}×${up(s.meta.roasDelta)}`),
      s.meta.cpaDelta != null ? r(`Cost per acquisition`, s.meta.cpaDelta < 0 ? `down ${Math.abs(s.meta.cpaDelta).toFixed(0)}%` : `up ${s.meta.cpaDelta.toFixed(0)}%`) : "",
    ].join(""), metaTag)}
  </div>

  ${emailSection}

  ${s.topProduct ? `<div class="product"><div class="l"><div class="lab">Top performing product · FY</div><div class="name">${esc(s.topProduct.title)}</div><div class="sub">The hero SKU driving the AU range</div></div><div class="v">${fmtFull(s.topProduct.gross_sales)}</div></div>` : ""}

  ${igSection}

  ${aiSection}

  ${notesSection}

  <div class="foot"><strong>Private &amp; confidential.</strong> Prepared by Coolkidz Australia, official Australian distributor of ${esc(s.brand.name)}. This report contains confidential business information intended solely for ${esc(s.brand.name)}. Please do not distribute, copy or share without prior written permission.</div>
</div></body></html>`;
}
