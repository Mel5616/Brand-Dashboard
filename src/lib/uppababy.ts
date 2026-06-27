// UPPAbaby monthly sell-through report. Parses the "CK - UPPAbaby Sales Report" xlsx
// (calendar-year channel comparison, 2025 vs 2026), computes YTD/quarter/monthly figures,
// and renders a branded, print-ready document — with the dashboard's UPPAbaby digital &
// marketing data (reused from the Snapshot computation) layered underneath.

import { fmt, fmtFull } from "./format";
import type { Snapshot } from "./snapshot";

export type UppaRow = { channel: string; year: number; month: number; value: number; forecast: boolean };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const UPPA_CHANNELS = ["BABY BUNTING", "INDEPENDENTS", "DIRECT SALES", "NEW ZEALAND", "AMAZON"];
const norm = (s: any) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

// Parse the sheet grid (array-of-arrays) into normalised rows. Reads each quarter block's
// header to map columns to (year, month), and flags "FORWARD" forecast columns.
export function parseUppababyGrid(grid: any[][]): UppaRow[] {
  const out: UppaRow[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (!/^QUARTER (ONE|TWO|THREE|FOUR)/.test(norm(grid[i]?.[1]))) continue;
    const hdr = grid[i + 1] || [];
    const colMap: Record<number, { year: number; month: number; forecast: boolean }> = {};
    for (let j = 1; j < hdr.length; j++) {
      const lab = String(hdr[j] ?? "").toLowerCase();
      if (/total|variance/.test(lab)) continue;
      const mi = MONTHS.findIndex(m => lab.includes(m)), ym = lab.match(/(20\d\d)/);
      if (mi >= 0 && ym) colMap[j] = { year: +ym[1], month: mi + 1, forecast: /forward|forecast/.test(lab) };
    }
    for (let r = i + 2; r < grid.length; r++) {
      const ch = norm(grid[r]?.[1]);
      if (!ch) continue;
      if (ch.startsWith("TOTAL SALES") || /^QUARTER/.test(ch)) break;
      if (!UPPA_CHANNELS.includes(ch)) continue;
      for (const js of Object.keys(colMap)) {
        const j = Number(js), v = grid[r][j], m = colMap[j];
        if (typeof v === "number" && v !== 0) out.push({ channel: ch, year: m.year, month: m.month, value: Math.round(v * 100) / 100, forecast: m.forecast });
      }
    }
  }
  return out;
}

export type Uppa = ReturnType<typeof buildUppababy>;

export function buildUppababy(rows: UppaRow[]) {
  const at = (ch: string, y: number, m: number) => rows.find(r => r.channel === ch && r.year === y && r.month === m);
  // Latest actual 2026 month = highest month with a non-forecast 2026 value.
  const latestActual = Math.max(0, ...rows.filter(r => r.year === 2026 && !r.forecast).map(r => r.month));
  const ytdSum = (ch: string, y: number) => sum(rows.filter(r => r.channel === ch && r.year === y && r.month <= latestActual && (y !== 2026 || !r.forecast)).map(r => r.value));
  const fullYear = (ch: string, y: number) => sum(rows.filter(r => r.channel === ch && r.year === y).map(r => r.value));

  const channels = UPPA_CHANNELS.map(ch => {
    const y25 = ytdSum(ch, 2025), y26 = ytdSum(ch, 2026);
    return { name: ch, ytd2025: y25, ytd2026: y26, delta: y26 - y25, pct: y25 > 0 ? (y26 - y25) / y25 : null, full2025: fullYear(ch, 2025) };
  });
  const total = {
    ytd2025: sum(channels.map(c => c.ytd2025)), ytd2026: sum(channels.map(c => c.ytd2026)),
    full2025: sum(channels.map(c => c.full2025)),
  };
  const totalDelta = total.ytd2026 - total.ytd2025;
  const totalPct = total.ytd2025 > 0 ? totalDelta / total.ytd2025 : null;

  // Monthly totals across channels, both years (2026 actual months only for the line)
  const monthTotal = (y: number, m: number) => sum(UPPA_CHANNELS.map(ch => at(ch, y, m)?.value ?? 0));
  const monthly2025 = MONTHS.map((_, i) => monthTotal(2025, i + 1));
  const monthly2026 = MONTHS.map((_, i) => (i + 1 <= latestActual ? monthTotal(2026, i + 1) : null));

  // Quarters — like-for-like: only months with 2026 actuals, comparing the same months
  // of 2025. Quarters not yet started are skipped, so no misleading "-100%" rows.
  const quarters = [0, 1, 2, 3].map(q => {
    const ms = [q * 3 + 1, q * 3 + 2, q * 3 + 3].filter(m => m <= latestActual);
    if (!ms.length) return null;
    const t25 = sum(ms.map(m => monthTotal(2025, m)));
    const t26 = sum(ms.map(m => monthTotal(2026, m)));
    return { label: `Q${q + 1}`, partial: ms.length < 3, t2025: t25, t2026: t26, delta: t26 - t25, pct: t25 > 0 ? (t26 - t25) / t25 : null };
  }).filter((x): x is NonNullable<typeof x> => x != null);
  const anyPartial = quarters.some(q => q.partial);

  return { channels, total, totalDelta, totalPct, latestActual, latestMonthLabel: MONTH_SHORT[latestActual - 1] ?? "", monthly2025, monthly2026, quarters, anyPartial };
}

// ── HTML ───────────────────────────────────────────────────────────────────
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pctTag = (p: number | null) => p == null ? "" : `<span class="${p >= 0 ? "up" : "dn"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p * 100).toFixed(1)}%</span>`;
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// Two-series (2025 vs 2026) monthly line chart.
function svgCompare(s25: number[], s26: (number | null)[]): string {
  const W = 770, H = 180, padX = 8, padTop = 16, padBot = 24;
  const all = [...s25, ...s26.filter((v): v is number => v != null)];
  const max = Math.max(...all, 1), n = 12;
  const x = (i: number) => padX + (i / (n - 1)) * (W - 2 * padX);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBot);
  const line = (s: (number | null)[], col: string, w: number) => {
    const pts = s.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  const dots = (s: (number | null)[], col: string) => s.map((v, i) => v == null ? "" : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4" fill="${col}"/>`).join("");
  const ticks = MONTH_SHORT.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="#94a3b8" font-weight="600">${m}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">
    ${line(s25, "#cbd5e1", 2)}${line(s26, "#0891b2", 2.6)}${dots(s26, "#0891b2")}${ticks}</svg>`;
}

export function uppababyHtml(u: Uppa, snap: Snapshot, periodLabel: string): string {
  const ch = (c: typeof u.channels[number]) => `<tr><td class="cn">${titleCase(c.name)}</td><td>${fmtFull(c.ytd2025)}</td><td>${fmtFull(c.ytd2026)}</td><td class="${c.delta >= 0 ? "up" : "dn"}">${c.delta >= 0 ? "+" : "−"}${fmtFull(Math.abs(c.delta))}</td><td class="${(c.pct ?? 0) >= 0 ? "up" : "dn"}">${pctTag(c.pct)}</td></tr>`;
  const q = (x: typeof u.quarters[number]) => `<tr><td class="cn">${x.label}${x.partial ? "<span style='color:var(--grey);font-weight:600'> · to date</span>" : ""}</td><td>${fmtFull(x.t2025)}</td><td>${fmtFull(x.t2026)}</td><td class="${x.delta >= 0 ? "up" : "dn"}">${x.delta >= 0 ? "+" : "−"}${fmtFull(Math.abs(x.delta))}</td><td>${pctTag(x.pct)}</td></tr>`;
  const m = snap; // marketing numbers reused from the Snapshot computation
  const r = (k: string, v: string) => `<div class="r"><span class="k">${k}</span><span class="val">${v}</span></div>`;

  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UPPAbaby · ${esc(periodLabel)} Sales Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--teal:#0891b2;--teal-d:#0e7490;--ink:#0f2330;--grey:#64748b;--line:#e2e8f0;--up:#15803d;--dn:#dc2626;--wash:#ecfeff;--paper:#fff;--bg:#eef2f5;font-family:'Inter',-apple-system,sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--ink);padding:28px 16px;-webkit-font-smoothing:antialiased;}
.page{max-width:880px;margin:0 auto;background:var(--paper);box-shadow:0 6px 30px rgba(20,30,50,.10);padding:42px 46px 30px;}
.mast{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid var(--teal);padding-bottom:16px;}
.mast .eyebrow{font-size:11px;letter-spacing:.22em;font-weight:700;color:var(--teal);text-transform:uppercase;}
.mast h1{font-size:29px;font-weight:800;color:var(--ink);line-height:1.05;margin-top:6px;letter-spacing:-.02em;}
.mast .sub{font-size:12.5px;color:var(--grey);margin-top:7px;font-weight:500;}
.stamp{text-align:right;font-size:11px;color:var(--grey);line-height:1.5;font-weight:500;}
.stamp strong{color:var(--ink);font-weight:700;display:block;font-size:12px;}
.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);margin-top:22px;border:1px solid var(--line);}
.hero .c{background:var(--paper);padding:17px 20px;}
.hero .l{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);font-weight:600;}
.hero .big{font-size:31px;font-weight:800;color:var(--teal-d);letter-spacing:-.025em;line-height:1.05;margin-top:7px;}
.hero .note{font-size:11.5px;color:var(--ink);margin-top:6px;font-weight:600;}
.sec{margin-top:30px;}
.sec>.h{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--teal-d);border-bottom:1px solid var(--line);padding-bottom:7px;margin-bottom:12px;}
table.cmp{width:100%;border-collapse:collapse;font-size:12.5px;}
table.cmp th{text-align:right;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);font-weight:700;padding:0 0 7px;border-bottom:1px solid var(--line);}
table.cmp th:first-child{text-align:left;}
table.cmp td{text-align:right;padding:7px 0;border-bottom:1px solid var(--line);font-weight:600;}
table.cmp td.cn{text-align:left;color:var(--ink);font-weight:700;}
table.cmp tr:last-child td{border-bottom:none;}
table.cmp .tot td{border-top:2px solid var(--line);font-weight:800;color:var(--ink);padding-top:9px;}
.up{color:var(--up);}.dn{color:var(--dn);}
.trend{margin-top:14px;border:1px solid var(--line);padding:14px 16px 8px;}
.trend .tl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--grey);font-weight:700;}
.lgnd{display:flex;gap:16px;margin-top:4px;}
.lgnd span{font-size:10.5px;color:var(--grey);font-weight:600;display:inline-flex;align-items:center;gap:5px;}
.lgnd i{width:14px;height:3px;border-radius:2px;display:inline-block;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px;}
.card{border:1px solid var(--line);border-top:3px solid var(--teal);padding:14px 16px;}
.card .h{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--teal-d);}
.rows{margin-top:10px;display:flex;flex-direction:column;gap:8px;}
.r{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
.r .k{font-size:12px;color:var(--grey);font-weight:500;}
.r .val{font-size:14px;font-weight:700;color:var(--ink);}
.foot{margin-top:24px;border-top:1px solid var(--line);padding-top:12px;font-size:10px;color:var(--grey);line-height:1.55;font-weight:500;}
.foot strong{color:var(--ink);}
@media print{body{background:#fff;padding:0;}.page{box-shadow:none;max-width:none;padding:30px 34px;}@page{size:A4;margin:12mm;}.sec{break-inside:avoid;}}
@media(max-width:680px){.hero,.grid{grid-template-columns:1fr;}.mast{flex-direction:column;align-items:flex-start;gap:10px;}.stamp{text-align:left;}}
</style></head>
<body><div class="page">
  <div class="mast">
    <div><div class="eyebrow">UPPAbaby Australia</div><h1>${esc(periodLabel)}<br>Sales Report</h1><div class="sub">Sell-through by channel · 2026 vs 2025 · year to date</div></div>
    <div class="stamp"><strong>Coolkidz Australia</strong>Official AU distributor<br>Prepared ${esc(periodLabel)}</div>
  </div>

  <div class="hero">
    <div class="c"><div class="l">Total sales · YTD 2026</div><div class="big">${fmt(u.total.ytd2026)}</div><div class="note">through ${esc(u.latestMonthLabel)} 2026</div></div>
    <div class="c"><div class="l">vs YTD 2025</div><div class="big">${u.totalDelta >= 0 ? "+" : "−"}${fmt(Math.abs(u.totalDelta))}</div><div class="note">${pctTag(u.totalPct) || "—"} on last year</div></div>
    <div class="c"><div class="l">2025 full year</div><div class="big">${fmt(u.total.full2025)}</div><div class="note">all channels</div></div>
  </div>

  <div class="sec">
    <div class="h">Sales by channel · year to date (through ${esc(u.latestMonthLabel)})</div>
    <table class="cmp"><thead><tr><th>Channel</th><th>2025 YTD</th><th>2026 YTD</th><th>Difference</th><th>Change</th></tr></thead>
    <tbody>${u.channels.map(ch).join("")}<tr class="tot"><td class="cn">Total</td><td>${fmtFull(u.total.ytd2025)}</td><td>${fmtFull(u.total.ytd2026)}</td><td class="${u.totalDelta >= 0 ? "up" : "dn"}">${u.totalDelta >= 0 ? "+" : "−"}${fmtFull(Math.abs(u.totalDelta))}</td><td>${pctTag(u.totalPct)}</td></tr></tbody></table>
    <div class="trend"><div class="tl">Monthly sales · 2025 vs 2026</div>${svgCompare(u.monthly2025, u.monthly2026)}<div class="lgnd"><span><i style="background:#cbd5e1"></i>2025</span><span><i style="background:#0891b2"></i>2026</span></div></div>
  </div>

  <div class="sec">
    <div class="h">Quarterly comparison</div>
    <table class="cmp"><thead><tr><th>Quarter</th><th>2025</th><th>2026</th><th>Difference</th><th>Change</th></tr></thead><tbody>${u.quarters.map(q).join("")}</tbody></table>
    ${u.anyPartial ? `<p style="font-size:10px;color:var(--grey);margin-top:8px;font-weight:500">Quarters in progress compare the same completed months in each year (like-for-like).</p>` : ""}
  </div>

  <div class="sec">
    <div class="h">Digital &amp; marketing · ${esc(m.monthLong)}</div>
    <div class="grid">
      <div class="card"><div class="h">Direct to consumer · Shopify</div><div class="rows">${r("Revenue", fmtFull(m.monthRev))}${r("Orders", String(m.monthOrders))}${r("Average order value", fmtFull(m.aov))}${r("D2C revenue YTD", fmt(m.ytdRev))}</div></div>
      <div class="card"><div class="h">Paid media</div><div class="rows">${r("Google ROAS", m.google.roas.toFixed(2) + "×")}${r("Meta ROAS", m.meta.roas.toFixed(2) + "×")}${r("Blended paid ROAS", m.blendedRoas.toFixed(2) + "×")}${r("Paid spend", fmtFull(m.google.spend + m.meta.spend))}</div></div>
      <div class="card"><div class="h">Email · Klaviyo</div><div class="rows">${r("Attributed revenue", fmtFull(m.email.rev))}${r("Open rate", m.email.openRate.toFixed(1) + "%")}${r("Click rate", m.email.clickRate.toFixed(1) + "%")}${r("Emails delivered", m.email.sent.toLocaleString())}</div></div>
      <div class="card"><div class="h">Social &amp; search</div><div class="rows">${r("Organic keywords", m.seo.keywords.toLocaleString())}${r("Est. organic visits/mo", Math.round(m.seo.traffic).toLocaleString())}${r("Traffic value", fmt(m.seo.value))}${r("Top IG post", m.igPosts[0] ? (m.igPosts[0].like_count + m.igPosts[0].comments_count).toLocaleString() + " eng." : "—")}</div></div>
    </div>
  </div>

  <div class="foot"><strong>Private &amp; confidential.</strong> Prepared by Coolkidz Australia, official Australian distributor of UPPAbaby. Sell-through figures are calendar-year actuals by channel; "FORWARD" months are forecasts and excluded from year-to-date totals. Digital &amp; marketing data covers Coolkidz-run UPPAbaby channels. Please do not distribute without prior written permission.</div>
</div></body></html>`;
}
