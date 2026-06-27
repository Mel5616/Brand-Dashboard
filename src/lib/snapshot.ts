// Monthly brand "Performance Snapshot" — a one-page, print-ready report per brand.
// buildSnapshot() turns the dashboard data into the figures; snapshotHtml() renders
// the exact standalone HTML document (so it can be shown in an iframe, printed to PDF,
// or downloaded/emailed as a self-contained .html file).

import { fmt, fmtFull } from "./format";

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
  klaviyo: { brand_id: number; month_key: string; revenue: number; open_rate: number; click_rate: number }[];
  products: { brand_id: number; title: string; gross_sales: number }[];
  summaries: { brand_id: number; fy_refunds: number | null; fy_revenue: number }[];
  googleAdsCampaigns: { brand_id: number; month_key: string; campaign_name: string; spend: number; conv_value: number }[];
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

  // ── Top product (FY) ────────────────────────────────────────────────
  const topProduct = [...forBrand(d.products)].sort((a, b) => b.gross_sales - a.gross_sales)[0] ?? null;

  // ── Seasonality (share of FY revenue per month) ─────────────────────
  const seasonal = monthKeys.map((mk, i) => ({
    label: monthLabels[i], month_key: mk,
    rev: at(monthlyB, mk)?.revenue ?? 0,
    share: fyRevTotal > 0 ? ((at(monthlyB, mk)?.revenue ?? 0) / fyRevTotal) * 100 : 0,
  }));
  const peakShare = Math.max(...seasonal.map(s => s.share), 0.001);
  const topShare = [...seasonal].sort((a, b) => b.share - a.share)[0];

  return {
    brand, monthName, fyLabel: d.fyLabel,
    monthRev, monthOrders, aov, ytdRev, fyRevTotal, monthTarget, fyTarget, targetMultiple, returnRate,
    google: { spend: gSpend, rev: gRev, roas: gRoas, revDelta: delta(gRev, gRevPrev), roasDelta: delta(gRoas, gPrev?.roas ?? 0), topCampaign },
    meta: { spend: mSpend, rev: mRev, roas: mRoas, cpa: mCpa, revDelta: delta(mRev, mPrev?.revenue ?? 0), roasDelta: delta(mRoas, mPrev && mPrev.spend > 0 ? mPrev.revenue / mPrev.spend : 0), cpaDelta: delta(mCpa, mCpaPrev) },
    blendedRoas, blendedDelta: delta(blendedRoas, blendedPrev),
    email: { rev: kRev, openRate, clickRate, revDelta: delta(kRev, kPrev?.revenue ?? 0) },
    topProduct,
    seasonal, peakShare, peakMonthKey: topShare?.month_key,
  };
}

// ── HTML rendering ─────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const up = (n: number | null, suffix = "%") => n == null ? "" : ` <span class="up">${n >= 0 ? "+" : ""}${n.toFixed(0)}${suffix}</span>`;
const roundPct = (n: number) => `${n.toFixed(1)}%`;

export function snapshotHtml(s: Snapshot): string {
  const bars = s.seasonal.map(m => {
    const h = Math.max(4, Math.round((m.share / s.peakShare) * 100));
    const isPeak = m.month_key === s.peakMonthKey || (s.monthName && m.label === s.monthName);
    const showVal = isPeak && m.share > 0;
    const showM = isPeak || s.seasonal.indexOf(m) === 0 || s.seasonal.indexOf(m) === s.seasonal.length - 1;
    return `<div class="b${isPeak ? " peak" : ""}" style="height:${h}%">${showVal ? `<span class="v">${m.share.toFixed(1)}%</span>` : ""}${showM ? `<span class="m">${esc(m.label)}</span>` : ""}</div>`;
  }).join("");

  const ytdNote = s.targetMultiple != null
    ? `${s.targetMultiple.toFixed(1)}× the full-year D2C target`
    : `Direct-to-consumer revenue, financial year to date`;
  const d2cTag = s.monthTarget > 0
    ? (s.monthRev >= s.monthTarget ? `${s.monthName} revenue ran ahead of target` : `${Math.round((s.monthRev / s.monthTarget) * 100)}% of the ${s.monthName} target`)
    : "";
  const emailTag = s.email.openRate >= 30 ? "Open rate well above sector benchmark" : "";
  const googleTag = (s.google.revDelta ?? 0) > 0 ? "Revenue growing on steady spend" : "";
  const metaTag = (s.meta.cpaDelta ?? 0) < 0 ? "Acquisition getting cheaper as it scales" : "";

  const card = (h: string, rows: string, tag: string) =>
    `<div class="card"><div class="h">${h}</div><div class="rows">${rows}</div>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>`;
  const r = (k: string, v: string) => `<div class="r"><span class="k">${k}</span><span class="val">${v}</span></div>`;

  return `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.brand.name)} · ${esc(s.monthName)} Performance Snapshot</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--navy:#2D4977;--blue:#6691AB;--blue-soft:#BDD4E7;--blue-wash:#Eaf1f7;--ink:#1c2733;--grey:#6a7787;--line:#e4e9ef;--up:#2f8d68;--paper:#fff;--bg:#eef1f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--ink);padding:28px 16px;-webkit-font-smoothing:antialiased;}
.page{max-width:860px;margin:0 auto;background:var(--paper);box-shadow:0 6px 30px rgba(20,30,50,.10);padding:42px 46px 30px;}
.eyebrow{font-size:11px;letter-spacing:.22em;font-weight:700;color:var(--blue);text-transform:uppercase;}
.masthead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--navy);padding-bottom:16px;}
.masthead h1{font-size:30px;font-weight:800;color:var(--navy);line-height:1.05;margin-top:6px;letter-spacing:-.02em;}
.masthead .sub{font-size:12.5px;color:var(--grey);margin-top:7px;font-weight:500;}
.stamp{text-align:right;font-size:11px;color:var(--grey);line-height:1.5;font-weight:500;}
.stamp strong{color:var(--navy);font-weight:700;display:block;font-size:12px;}
.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);margin-top:22px;border:1px solid var(--line);}
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
@media print{body{background:#fff;padding:0;}.page{box-shadow:none;max-width:none;padding:30px 34px;}@page{size:A4;margin:12mm;}}
@media(max-width:680px){.hero{grid-template-columns:1fr;}.grid{grid-template-columns:1fr;}.seasonal{flex-direction:column;align-items:stretch;}.seasonal .copy{flex:none;}.masthead{flex-direction:column;align-items:flex-start;gap:10px;}.stamp{text-align:left;}}
</style></head>
<body><div class="page">
  <div class="masthead">
    <div>
      <div class="eyebrow">${esc(s.brand.name)} Australia</div>
      <h1>${esc(s.monthName)}<br>Performance Snapshot</h1>
      <div class="sub">Direct-to-consumer and marketing performance · ${esc(s.fyLabel)}</div>
    </div>
    <div class="stamp"><strong>Coolkidz Australia</strong>Official AU distributor<br>Prepared ${esc(s.monthName)}</div>
  </div>

  <div class="hero">
    <div class="cell"><div class="lab">D2C revenue YTD</div><div class="big">${fmt(s.ytdRev)}</div><div class="note">${ytdNote}</div></div>
    <div class="cell"><div class="lab">${esc(s.monthName)} D2C revenue</div><div class="big">${fmtFull(s.monthRev)}</div><div class="note">${s.monthOrders} orders · ${fmtFull(s.aov)} average order value</div></div>
    <div class="cell"><div class="lab">Blended paid ROAS · ${esc(s.monthName)}</div><div class="big">${s.blendedRoas.toFixed(2)}×</div><div class="note">${s.blendedDelta != null ? `<span class="up">${s.blendedDelta >= 0 ? "+" : ""}${s.blendedDelta.toFixed(0)}%</span> on the prior month` : "blended Google and Meta"}</div></div>
  </div>

  <div class="seasonal">
    <div class="copy"><div class="t">Where the year's revenue lands</div><div class="d">Share of the financial year's direct-to-consumer revenue by month. The navy bars are the peak.</div></div>
    <div class="bars">${bars}</div>
  </div>

  <div class="grid">
    ${card(`Direct to consumer · Shopify`, [
      r(`${s.monthName} revenue`, fmtFull(s.monthRev)),
      r(`${s.monthName} orders`, String(s.monthOrders)),
      r(`Average order value`, fmtFull(s.aov)),
      s.returnRate != null ? r(`FY return rate`, roundPct(s.returnRate)) : "",
    ].join(""), d2cTag)}
    ${card(`Email · Klaviyo · ${s.monthName}`, [
      r(`Attributed revenue`, `${fmtFull(s.email.rev)}${up(s.email.revDelta)}`),
      r(`Open rate`, roundPct(s.email.openRate)),
      r(`Click rate`, roundPct(s.email.clickRate)),
    ].join(""), emailTag)}
    ${card(`Google Ads · ${s.monthName}`, [
      r(`Spend`, fmtFull(s.google.spend)),
      r(`Revenue`, `${fmtFull(s.google.rev)}${up(s.google.revDelta)}`),
      r(`ROAS`, `${s.google.roas.toFixed(2)}×${up(s.google.roasDelta)}`),
      s.google.topCampaign ? r(`Top campaign`, `${s.google.topCampaign.roas.toFixed(1)}× ROAS`) : "",
    ].join(""), googleTag)}
    ${card(`Meta Ads · ${s.monthName}`, [
      r(`Spend`, fmtFull(s.meta.spend)),
      r(`Revenue`, `${fmtFull(s.meta.rev)}${up(s.meta.revDelta)}`),
      r(`ROAS`, `${s.meta.roas.toFixed(2)}×${up(s.meta.roasDelta)}`),
      s.meta.cpaDelta != null ? r(`Cost per acquisition`, s.meta.cpaDelta < 0 ? `down ${Math.abs(s.meta.cpaDelta).toFixed(0)}%` : `up ${s.meta.cpaDelta.toFixed(0)}%`) : "",
    ].join(""), metaTag)}
  </div>

  ${s.topProduct ? `<div class="product"><div class="l"><div class="lab">Top performing product · FY</div><div class="name">${esc(s.topProduct.title)}</div><div class="sub">The hero SKU driving the AU range</div></div><div class="v">${fmtFull(s.topProduct.gross_sales)}</div></div>` : ""}

  <div class="foot"><strong>Source:</strong> Coolkidz Australia sales &amp; marketing dashboard, ${esc(s.fyLabel)}. Channel data from Google Ads, Meta Ads Manager, Shopify and Klaviyo. Deltas shown against the prior month.<br>Figures reflect ${esc(s.brand.name)} AU direct-to-consumer and digital marketing performance. Retail (Baby Bunting and other partners) is reported separately.</div>
</div></body></html>`;
}
