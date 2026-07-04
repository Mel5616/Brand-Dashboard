"use client";

import { useEffect, useState, useRef } from "react";
import type { Brand } from "@/lib/db";

type Row = { brand_id: number; name: string; boothRevenue: number; boothOrders: number; onlineRevenue: number; onlineOrders: number };
type Prod = { title: string; brand_id: number; revenue: number; qty: number };
type Compare = { name: string; date_start: string; boothTotal: number; showTotal: number; onlineTotal: number; samePoint?: boolean; atFraction?: number };
type LiveData = {
  live: boolean; boothTotal: number; boothOrders: number; showTotal: number; showOrders: number; onlineTotal: number; onlineOrders: number;
  rows: Row[]; updatedAt: string; topProducts?: Prod[]; byHour?: number[]; byDay?: { date: string; booth: number; boothOrders: number; online: number; onlineOrders: number; total: number; orders: number }[]; perDay?: { date: string; byHour: number[]; topProducts: Prod[] }[]; compare?: Compare | null; target?: number | null;
  recent?: { at: string; label: string; brand_id: number; amount: number; kind: string }[]; scans?: number; brandHours?: Record<string, number[]>;
  show?: { name?: string; state?: string; date_start?: string; date_end?: string };
};

const aud = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const REFRESH_MS = 45000;

const STATE_ABBR: Record<string, string> = {
  "queensland": "QLD", "new south wales": "NSW", "victoria": "VIC",
  "south australia": "SA", "western australia": "WA", "tasmania": "TAS",
  "northern territory": "NT", "australian capital territory": "ACT",
};
const stateAbbr = (s?: string) => s ? (STATE_ABBR[s.toLowerCase()] ?? s.slice(0, 3).toUpperCase()) : "";

// Show open hours (Melbourne) used for pacing
const OPEN = 9, CLOSE = 17;
const hourLabel = (h: number) => { const ap = h < 12 ? "am" : "pm"; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}${ap}`; };

// "Now" in Melbourne time (DST-aware, AEST/AEDT) — matches the store timezone
function aestNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) + Number(get("minute")) / 60 };
}

// Fraction of the show's selling hours elapsed (1 if not live / already finished)
function pacingFraction(start?: string, end?: string, live = true): number {
  if (!start || !end || !live) return 1;
  const now = aestNow();
  const days: string[] = [];
  for (let d = new Date(start + "T00:00:00Z"); d <= new Date(end + "T00:00:00Z"); d = new Date(d.getTime() + 86400000)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const perDay = CLOSE - OPEN;
  let elapsed = 0;
  for (const day of days) {
    if (day < now.date) elapsed += perDay;
    else if (day === now.date) elapsed += Math.min(perDay, Math.max(0, now.hour - OPEN));
  }
  const total = days.length * perDay;
  return total > 0 ? Math.min(1, elapsed / total) : 1;
}

export function LiveShowPanel({ showId, brands, live = true }: { showId: string; brands: Brand[]; live?: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [loading, setLoading] = useState(true);
  const [ago, setAgo] = useState(0);
  const [localTarget, setLocalTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [daySel, setDaySel] = useState<string>("all"); // "all" or a show-day date
  const [toast, setToast] = useState<string | null>(null); // milestone / target celebration
  const [kiosk, setKiosk] = useState(false);               // fullscreen big-screen mode
  const compareFetched = useRef(false);
  const lastTotalRef = useRef(0);
  const colorOf = (id: number) => brands.find(b => b.id === id)?.color ?? "#6366f1";

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(`showTarget:${showId}`) : null;
    setLocalTarget(v ? Number(v) : null);
  }, [showId]);

  // Server target (shared) wins; localStorage is the offline/pre-migration fallback
  const target = data?.target ?? localTarget;

  useEffect(() => {
    let alive = true;
    const load = () => {
      const withCompare = !compareFetched.current;
      fetch(`/api/live-show?showId=${showId}${withCompare ? "&compare=1" : ""}`)
        .then(r => r.json())
        .then((d: LiveData) => {
          if (!alive) return;
          setData(d); setLoading(false); setAgo(0);
          if (withCompare) { compareFetched.current = true; setCompare(d.compare ?? null); }
        })
        .catch(() => { if (alive) setLoading(false); });
    };
    load();
    if (!live) return () => { alive = false; };
    const iv = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setAgo(a => a + 1), 1000);
    return () => { alive = false; clearInterval(iv); clearInterval(tick); };
  }, [showId, live]);

  const saveTarget = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    const val = n > 0 ? n : null;
    setLocalTarget(val);
    if (val) window.localStorage.setItem(`showTarget:${showId}`, String(val));
    else window.localStorage.removeItem(`showTarget:${showId}`);
    // persist to Supabase (shared across devices); ignore failure (falls back to local)
    fetch("/api/live-show", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showId, target: val }),
    }).then(r => r.json()).then(j => { if (j?.ok) setData(d => d ? { ...d, target: val } : d); }).catch(() => {});
    setEditing(false);
  };

  const maxRev = Math.max(1, ...(data?.rows ?? []).map(r => r.boothRevenue + r.onlineRevenue));

  // Pacing
  const booth = data?.boothTotal ?? 0;
  const frac = pacingFraction(data?.show?.date_start, data?.show?.date_end, live);
  const pct = target ? Math.min(100, (booth / target) * 100) : 0;
  const expected = target ? target * frac : 0;
  const onPace = booth >= expected;
  const finished = frac >= 1;

  // Compare delta (booth vs booth)
  const cmpDelta = compare && compare.boothTotal > 0 ? ((booth - compare.boothTotal) / compare.boothTotal) * 100 : null;

  // ── Live show-day extras: AOV, end-of-day projection, time left ──────────
  const aov = (data?.showOrders ?? 0) > 0 ? data!.showTotal / data!.showOrders : 0;
  const nowT = aestNow();
  const todayRow = data?.byDay?.find(d => d.date === nowT.date);
  const todayTotal = todayRow?.total ?? (data?.showTotal ?? 0);
  const dayFrac = Math.min(1, Math.max(0, (nowT.hour - OPEN) / (CLOSE - OPEN)));
  const projectedToday = live && !finished && dayFrac > 0.06 && dayFrac < 1 ? Math.round(todayTotal / dayFrac) : null;
  const minsLeft = Math.max(0, Math.round((CLOSE - nowT.hour) * 60));
  const timeLeft = !live ? null
    : nowT.hour < OPEN ? `opens in ${Math.round((OPEN - nowT.hour) * 10) / 10}h`
    : nowT.hour >= CLOSE ? "closed for today"
    : `${Math.floor(minsLeft / 60)}h ${String(minsLeft % 60).padStart(2, "0")}m of selling left today`;

  // Contribution split (POS+till vs QR vs online) for the donut.
  const qrRow = (data?.rows ?? []).find(r => r.brand_id === -1);
  const qrRev = qrRow?.boothRevenue ?? 0;
  const posTillRev = Math.max(0, (data?.boothTotal ?? 0) - qrRev);
  const onlineRev = data?.onlineTotal ?? 0;

  // QR scan → sale conversion, and the brand surging in the current hour.
  const scans = data?.scans ?? 0;
  const qrOrders = qrRow?.boothOrders ?? 0;
  const scanConv = scans > 0 ? (qrOrders / scans) * 100 : null;
  const brandName = (id: number) => id === -1 ? "QR stand" : (brands.find(b => b.id === id)?.name ?? (data?.rows ?? []).find(r => r.brand_id === id)?.name ?? `Brand ${id}`);
  const topMover = (() => {
    const h = Math.floor(nowT.hour);
    let best: { id: number; amt: number } | null = null;
    for (const [idStr, arr] of Object.entries(data?.brandHours ?? {})) {
      const amt = (arr as number[])[h] || 0;
      if (amt > 0 && (!best || amt > best.amt)) best = { id: Number(idStr), amt };
    }
    return best;
  })();
  // "N min ago" for the just-sold ticker.
  const relTime = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  // Milestone + target celebrations when the total ticks past a threshold.
  useEffect(() => {
    const t = data?.showTotal ?? 0;
    const prev = lastTotalRef.current;
    if (prev > 0 && t > prev) {
      if (target && prev < target && t >= target) setToast(`🎯 Target smashed — ${aud(t)}!`);
      else { const ms = [25000, 50000, 75000, 100000, 125000, 150000, 200000, 250000, 300000]; const c = ms.find(m => prev < m && t >= m); if (c) setToast(`🎉 ${aud(c)} passed!`); }
    }
    lastTotalRef.current = t;
  }, [data?.showTotal, target]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); }, [toast]);

  // Sales-by-hour range
  const byHour = data?.byHour ?? [];
  const activeHours = byHour.map((v, h) => ({ v, h })).filter(x => x.v > 0);
  const hMin = activeHours.length ? Math.min(...activeHours.map(x => x.h)) : OPEN;
  const hMax = activeHours.length ? Math.max(...activeHours.map(x => x.h)) : CLOSE;
  const hourSpan = activeHours.length ? Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i) : [];
  const hourMax = Math.max(1, ...byHour);
  const peakHour = activeHours.length ? activeHours.reduce((a, b) => (b.v > a.v ? b : a)).h : null;

  // Day-filtered view (Sat/Sun toggle) for the on-screen hour chart + top sellers.
  // The PDF stays on the aggregate (whole-show) figures above.
  const dayView = daySel === "all" ? null : data?.perDay?.find(p => p.date === daySel);
  const vByHour = (dayView ? dayView.byHour : data?.byHour) ?? [];
  const vActive = vByHour.map((v, h) => ({ v, h })).filter(x => x.v > 0);
  const vSpan = vActive.length ? Array.from({ length: Math.max(...vActive.map(x => x.h)) - Math.min(...vActive.map(x => x.h)) + 1 }, (_, i) => Math.min(...vActive.map(x => x.h)) + i) : [];
  const vMax = Math.max(1, ...vByHour);
  const vPeak = vActive.length ? vActive.reduce((a, b) => (b.v > a.v ? b : a)).h : null;
  const vTop = (dayView ? dayView.topProducts : data?.topProducts) ?? [];
  const dayTabs = (data?.byDay?.length ?? 0) > 1 ? data!.byDay! : [];

  function downloadPdf() {
    if (!data) return;
    const s = data.show ?? {};
    const fmtDate = (d?: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
    const esc = (t: string) => (t || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const trunc = (t: string, n: number) => t.length > n ? t.slice(0, n - 1) + "…" : t;

    // ── SVG: sales by hour (vertical bars, peak highlighted) ──
    const hourChart = hourSpan.length ? (() => {
      const W = 540, H = 104, padX = 10, padB = 18, padT = 8, n = hourSpan.length, bw = (W - padX * 2) / n;
      const body = hourSpan.map((h, i) => {
        const v = byHour[h];
        const bh = Math.max(1, (v / hourMax) * (H - padB - padT));
        const x = padX + i * bw + bw * 0.18, y = H - padB - bh;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${h === peakHour ? "#059669" : "#6ee7b7"}"/>` +
          `<text x="${(padX + i * bw + bw / 2).toFixed(1)}" y="${H - 7}" font-size="8" fill="#94a3b8" text-anchor="middle">${hourLabel(h)}</text>`;
      }).join("");
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:540px">${body}</svg>`;
    })() : "";

    // ── SVG: this show vs previous — two metrics side by side, each scaled
    //    to its own max so both groups read clearly on one line ──
    const cmpChart = compare ? (() => {
      const metrics = [
        { name: "Expo Stand", a: booth, b: compare.boothTotal },
        { name: "Online Expo Sales", a: data.onlineTotal, b: compare.onlineTotal },
      ];
      const prevLab = trunc(`${compare.name.replace(/Baby Expo/i, "").trim()} ${fmtDate(compare.date_start)}`, 20);
      const W = 540, colGap = 28, colW = (W - colGap) / 2, barH = 12, valW = 62, barMax = colW - valW;
      let body = "";
      metrics.forEach((m, ci) => {
        const x = ci * (colW + colGap);
        const mx = Math.max(1, m.a, m.b);
        body += `<text x="${x}" y="11" font-size="10.5" fill="#1e293b" font-weight="700">${m.name}</text>`;
        ([["This show", m.a, "#6366f1"], [prevLab, m.b, "#cbd5e1"]] as [string, number, string][]).forEach(([lab, val, col], ri) => {
          const ry = 22 + ri * 24;
          const w = Math.max(2, (val / mx) * barMax);
          body += `<text x="${x}" y="${ry}" font-size="8.5" fill="#94a3b8">${esc(lab)}</text>` +
            `<rect x="${x}" y="${ry + 4}" width="${w.toFixed(1)}" height="${barH}" rx="3" fill="${col}"/>` +
            `<text x="${(x + w + 6).toFixed(1)}" y="${ry + 14}" font-size="9" fill="#475569">${aud(val)}</text>`;
        });
      });
      return `<svg viewBox="0 0 ${W} 76" width="100%" style="max-width:540px">${body}</svg>`;
    })() : "";

    // ── SVG: top 5 sellers (horizontal bars, brand colour) ──
    const top5 = (data.topProducts ?? []).slice(0, 5);
    const topChart = top5.length ? (() => {
      const W = 540, rowH = 25, max = Math.max(1, ...top5.map(p => p.revenue)), barMax = W - 150;
      let y = 0, body = "";
      top5.forEach((p, i) => {
        const w = Math.max(2, (p.revenue / max) * barMax);
        body += `<text x="0" y="${y + 9}" font-size="9" fill="#334155">${i + 1}. ${esc(trunc(p.title, 54))}</text>` +
          `<rect x="0" y="${y + 13}" width="${w.toFixed(1)}" height="9" rx="2.5" fill="${colorOf(p.brand_id)}"/>` +
          `<text x="${(w + 7).toFixed(1)}" y="${y + 21}" font-size="8.5" fill="#475569">${aud(p.revenue)} · ×${p.qty}</text>`;
        y += rowH;
      });
      return `<svg viewBox="0 0 ${W} ${y}" width="100%" style="max-width:540px">${body}</svg>`;
    })() : "";

    const onlineCmpDelta = compare && compare.onlineTotal > 0 ? ((data.onlineTotal - compare.onlineTotal) / compare.onlineTotal) * 100 : null;
    const arrow = (d: number) => d >= 0 ? "▲" : "▼";
    const rowsHtml = [
      { label: "UPPAbaby", rows: data.rows.filter(r => r.brand_id === 5) },
      { label: "Coolkidz Brands", rows: data.rows.filter(r => r.brand_id !== 5) },
    ].filter(g => g.rows.length > 0).map(g => {
      const gBooth = g.rows.reduce((s, r) => s + r.boothRevenue, 0);
      const gOnline = g.rows.reduce((s, r) => s + r.onlineRevenue, 0);
      const header = `<tr><td style="font-weight:700;background:#f1f5f9">${esc(g.label)}</td><td class="r" style="font-weight:700;background:#f1f5f9">${aud(gBooth)}</td><td class="r" style="background:#f1f5f9"></td><td class="r" style="background:#f1f5f9">${gOnline > 0 ? "+" + aud(gOnline) : "—"}</td><td class="r" style="font-weight:700;background:#f1f5f9">${aud(gBooth + gOnline)}</td></tr>`;
      const body = g.rows.map(r => `<tr><td style="padding-left:16px">${esc(r.name)}</td><td class="r">${aud(r.boothRevenue)}</td><td class="r">${r.boothOrders}</td><td class="r">${r.onlineRevenue > 0 ? "+" + aud(r.onlineRevenue) : "—"}</td><td class="r"><b>${aud(r.boothRevenue + r.onlineRevenue)}</b></td></tr>`).join("");
      return header + body;
    }).join("");
    const pacingHtml = target ? `<p><b>Expo Stand target:</b> ${aud(target)} — ${pct.toFixed(0)}% achieved${finished ? (booth >= target ? " ✓ hit" : ` (${aud(target - booth)} short)`) : ""}</p>` : "";
    const peakHtml = peakHour != null ? `<p><b>Peak hour:</b> ${hourLabel(peakHour)}–${hourLabel(peakHour + 1)} (${aud(byHour[peakHour])})</p>` : "";

    const cmpSection = compare ? `
      <div class="sec">
      <h2>vs ${esc(compare.name)} · ${fmtDate(compare.date_start)}${compare.samePoint ? " (same point in the show)" : ""}</h2>
      <table style="margin-bottom:10px"><thead><tr><th>Metric</th><th class="r">This show</th><th class="r">${esc(trunc(compare.name.replace(/Baby Expo/i, "").trim(), 16))}</th><th class="r">Change</th></tr></thead><tbody>
        <tr><td>Expo Stand</td><td class="r">${aud(booth)}</td><td class="r">${aud(compare.boothTotal)}</td><td class="r" style="color:${(cmpDelta ?? 0) >= 0 ? "#059669" : "#e11d48"}">${cmpDelta != null ? arrow(cmpDelta) + " " + Math.abs(cmpDelta).toFixed(0) + "%" : "—"}</td></tr>
        <tr><td>Online Expo Sales</td><td class="r">${aud(data.onlineTotal)}</td><td class="r">${aud(compare.onlineTotal)}</td><td class="r" style="color:${(onlineCmpDelta ?? 0) >= 0 ? "#059669" : "#e11d48"}">${onlineCmpDelta != null ? arrow(onlineCmpDelta) + " " + Math.abs(onlineCmpDelta).toFixed(0) + "%" : "—"}</td></tr>
      </tbody></table>
      ${cmpChart}
      </div>` : "";

    const pdfByDay = data.byDay ?? [];
    const byDaySection = pdfByDay.length > 1 ? `
      <div class="sec">
      <h2>Sales by day</h2>
      <table><thead><tr><th>Day</th><th class="r">Expo Stand</th><th class="r">Online to state</th><th class="r">Total</th><th class="r">Orders</th></tr></thead><tbody>
      ${pdfByDay.map(d => `<tr><td>${new Date(d.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}</td><td class="r">${aud(d.booth)}</td><td class="r">${d.online > 0 ? "+" + aud(d.online) : "—"}</td><td class="r"><b>${aud(d.total)}</b></td><td class="r">${d.orders}</td></tr>`).join("")}
      </tbody></table>
      </div>` : "";

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.name ?? "Show")} — Report</title>
      <style>
        @page{size:A4 portrait;margin:12mm;}
        *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box;}
        body{font:11px -apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;margin:0;}
        .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #eef2f7;padding-bottom:14px;margin-bottom:22px;}
        h1{font-size:23px;margin:0 0 3px;letter-spacing:-.01em;}
        .sub{color:#64748b;margin:0;font-size:11.5px;}
        .head-r{text-align:right;color:#94a3b8;font-size:9.5px;line-height:1.5;}
        .head-r b{color:#475569;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;}
        .cards{display:flex;gap:14px;margin:0 0 8px;}
        .card{flex:1;border:1px solid #e7eaf0;border-radius:11px;padding:14px 16px;background:#fbfcfe;}
        .card.accent{background:#eef2ff;border-color:#c7d2fe;}
        .big{font-size:23px;font-weight:700;margin:0;line-height:1.05;letter-spacing:-.01em;}
        .card.accent .big{color:#4338ca;}
        .lbl{color:#64748b;font-size:10.5px;margin:4px 0 0;}
        .pace{color:#475569;font-size:11px;margin:14px 2px 0;}
        .sec{margin-top:22px;}
        table{width:100%;border-collapse:collapse;margin:2px 0 2px;font-size:10.5px;}
        th{text-align:left;color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #e2e8f0;padding:4px 8px;}
        td{padding:5px 8px;border-bottom:1px solid #f1f5f9;} td.r,th.r{text-align:right;}
        h2{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;background:#f1f5f9;border-left:3px solid #818cf8;border-radius:0 5px 5px 0;padding:6px 11px;margin:0 0 10px;}
        .meta{color:#94a3b8;font-size:9.5px;margin-top:20px;border-top:1px solid #eef2f7;padding-top:9px;}
        svg{display:block;margin:2px 0;}
      </style></head><body>
      <div class="head">
        <div>
          <h1>${esc(s.name ?? "Show")}</h1>
          <p class="sub">${fmtDate(s.date_start)}${s.date_end && s.date_end !== s.date_start ? " – " + fmtDate(s.date_end) : ""}${s.state ? " · " + s.state : ""}</p>
        </div>
        <div class="head-r"><b>Expo Report</b><br>${new Date().toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
      </div>
      <div class="cards">
        <div class="card"><p class="big">${aud(booth)}</p><p class="lbl">Expo Stand · ${data.boothOrders} orders</p></div>
        <div class="card"><p class="big">${aud(data.onlineTotal)}</p><p class="lbl">Online Expo Sales · ${data.onlineOrders} orders</p></div>
        <div class="card accent"><p class="big">${aud(data.showTotal)}</p><p class="lbl">Total Sales · ${data.showOrders} orders</p></div>
      </div>
      ${(pacingHtml || peakHtml) ? `<p class="pace">${[pacingHtml, peakHtml].filter(Boolean).map(x => x.replace(/<\/?p>/g, "")).join(" &nbsp;·&nbsp; ")}</p>` : ""}
      ${cmpSection}
      ${byDaySection}
      ${hourChart ? `<div class="sec"><h2>Sales by hour · expo stand</h2>${hourChart}</div>` : ""}
      ${topChart ? `<div class="sec"><h2>Top 5 sellers · expo stand</h2>${topChart}</div>` : ""}
      <div class="sec">
      <h2>By Brand</h2>
      <table><thead><tr><th>Brand</th><th class="r">Expo Stand</th><th class="r">Orders</th><th class="r">Online to state</th><th class="r">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      </div>
      <p class="meta">Expo Stand = UPPAbaby POS + Coolkidz till + QR scans · Online = website orders shipping to ${esc(s.state ?? "the state")} during the show · all figures ex-GST · Brand Command.</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className={`rounded-xl overflow-hidden border ${live ? "border-emerald-200" : "border-slate-200"}`}>
      {/* Milestone / target celebration toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] px-6 py-3 rounded-2xl bg-white shadow-2xl border border-emerald-200 text-lg font-bold text-slate-800" style={{ animation: "bounce 0.6s" }}>
          {toast}
        </div>
      )}

      {/* Big-screen / kiosk mode — a stand-facing live display */}
      {kiosk && (
        <div className="fixed inset-0 z-[60] text-white flex flex-col p-8 lg:p-12 overflow-auto" style={{ background: "linear-gradient(135deg,#0f172a,#134e4a)" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-emerald-400 font-bold uppercase tracking-[0.25em] flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />Live · {data?.show?.name}</p>
              {timeLeft && <p className="text-white/50 mt-1">{timeLeft} · updated {ago}s ago</p>}
            </div>
            <button onClick={() => setKiosk(false)} className="text-white/60 hover:text-white text-sm border border-white/20 rounded-lg px-4 py-2">Exit ✕</button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <p className="text-white/50 uppercase tracking-[0.3em] text-sm">Total Sales · {data?.showOrders ?? 0} orders</p>
            <p className="font-black leading-none tabular-nums" style={{ fontSize: "clamp(4rem,16vw,11rem)" }}>{aud(data?.showTotal ?? 0)}</p>
            {projectedToday != null && <p className="text-emerald-400 text-2xl mt-3 font-semibold">On pace for {aud(projectedToday)} today</p>}
            {cmpDelta != null && <p className={`text-lg mt-1 ${cmpDelta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{cmpDelta >= 0 ? "▲" : "▼"} {Math.abs(cmpDelta).toFixed(0)}% vs last {compare?.name?.replace(/Baby Expo/i, "").trim()}</p>}
            <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 mt-8 text-center">
              <div><p className="text-4xl font-bold tabular-nums">{aud(booth)}</p><p className="text-white/50 uppercase text-xs tracking-wider mt-1">Expo Stand</p></div>
              <div><p className="text-4xl font-bold tabular-nums">{aud(data?.onlineTotal ?? 0)}</p><p className="text-white/50 uppercase text-xs tracking-wider mt-1">Online</p></div>
              <div><p className="text-4xl font-bold tabular-nums">{aud(aov)}</p><p className="text-white/50 uppercase text-xs tracking-wider mt-1">Avg order</p></div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
            <div>
              <p className="uppercase tracking-[0.2em] text-white/40 text-xs mb-3">Top brands</p>
              {[...(data?.rows ?? [])].filter(r => r.brand_id !== -1).sort((a, b) => (b.boothRevenue + b.onlineRevenue) - (a.boothRevenue + a.onlineRevenue)).slice(0, 5).map(r => (
                <div key={r.brand_id} className="flex items-center gap-3 mb-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colorOf(r.brand_id) }} />
                  <span className="flex-1 text-lg truncate">{r.name}</span>
                  <span className="text-lg font-bold tabular-nums">{aud(r.boothRevenue + r.onlineRevenue)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="uppercase tracking-[0.2em] text-white/40 text-xs mb-3">Top sellers</p>
              {(data?.topProducts ?? []).slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center gap-3 mb-2.5">
                  <span className="text-white/40 w-4">{i + 1}</span>
                  <span className="flex-1 text-lg truncate">{p.title}</span>
                  <span className="text-lg font-bold tabular-nums">{aud(p.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Banner — both figures */}
      <div className={`px-5 py-4 text-white bg-gradient-to-r ${live ? "from-emerald-500 to-teal-500" : "from-slate-600 to-slate-500"}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {live && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">{live ? "Live · Show Day" : "Show Report"}</span>
          </div>
          <div className="flex items-center gap-3">
            {live && <button onClick={() => setKiosk(true)} disabled={!data} className="text-[10px] font-semibold bg-white/15 hover:bg-white/25 disabled:opacity-40 rounded px-2 py-1 transition-colors">⛶ Big screen</button>}
            <button onClick={downloadPdf} disabled={!data} className="text-[10px] font-semibold bg-white/15 hover:bg-white/25 disabled:opacity-40 rounded px-2 py-1 transition-colors">⤓ PDF</button>
            <p className="text-[10px] text-white/70">
              {loading ? "loading…" : live ? `updated ${ago}s ago` : "snapshot from Shopify"}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-8 mt-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-3xl font-bold tabular-nums">{loading ? "…" : aud(booth)}</p>
              {cmpDelta != null && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${cmpDelta >= 0 ? "bg-white/20" : "bg-rose-900/30"}`} title={`vs ${compare!.name}`}>
                  {cmpDelta >= 0 ? "▲" : "▼"} {Math.abs(cmpDelta).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-xs text-white/85">Expo Stand · {data?.boothOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">UPPAbaby POS + Coolkidz till + QR</p>
          </div>
          <div className="opacity-90">
            <p className="text-2xl font-semibold tabular-nums">{loading ? "…" : aud(data?.onlineTotal ?? 0)}</p>
            <p className="text-xs text-white/85">Online Expo Sales · {data?.onlineOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">website orders to {data?.show?.state ?? "state"} during the show</p>
          </div>
          <div className="border-l border-white/25 pl-6">
            <p className="text-2xl font-bold tabular-nums">{loading ? "…" : aud(data?.showTotal ?? 0)}</p>
            <p className="text-xs text-white/85">Total Sales · {data?.showOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">expo stand + online, for the day</p>
          </div>
        </div>
        {cmpDelta != null && (
          <p className="text-[10px] text-white/70 mt-2">
            vs {compare!.name}, {new Date(compare!.date_start + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            {compare!.samePoint ? " at the same point" : ""} — expo stand {aud(compare!.boothTotal)}
          </p>
        )}
        {!loading && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2.5 pt-2.5 border-t border-white/15 text-[11px] text-white/80">
            <span><span className="font-bold text-white">{aud(aov)}</span> avg order</span>
            {projectedToday != null && <span>On pace for <span className="font-bold text-white">{aud(projectedToday)}</span> today</span>}
            {scanConv != null && <span>{scans} scans · <span className="font-bold text-white">{scanConv.toFixed(0)}%</span> → sale</span>}
            {topMover && <span>🔥 <span className="font-bold text-white">{brandName(topMover.id)}</span> hot this hour</span>}
            {timeLeft && <span>⏱ {timeLeft}</span>}
          </div>
        )}
      </div>

      {/* Target & pacing */}
      <div className="bg-white border-b border-gray-100 px-5 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Expo Stand target $</span>
            <input
              autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveTarget(); if (e.key === "Escape") setEditing(false); }}
              placeholder="e.g. 60000"
              className="w-28 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button onClick={saveTarget} className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded px-2.5 py-1">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : target ? (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500">
                Expo Stand target · {aud(booth)} of {aud(target)}
                <button onClick={() => { setDraft(String(target)); setEditing(true); }} className="ml-2 text-[10px] text-emerald-600 hover:underline">edit</button>
              </span>
              <span className={`text-[11px] font-bold ${finished ? (booth >= target ? "text-emerald-600" : "text-gray-400") : onPace ? "text-emerald-600" : "text-amber-600"}`}>
                {finished ? (booth >= target ? "🎯 Target hit" : `${aud(target - booth)} short`) : onPace ? "On pace" : `${aud(expected - booth)} behind pace`}
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
              <div className={`h-full rounded-full transition-all duration-700 ${booth >= target ? "bg-emerald-500" : onPace ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
              {live && !finished && frac > 0 && frac < 1 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400" style={{ left: `${frac * 100}%` }} title="expected pace by now" />
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{pct.toFixed(0)}% of target{live && !finished ? " · marker = expected pace by now" : ""}</p>
          </div>
        ) : (
          <button onClick={() => { setDraft(""); setEditing(true); }} className="text-xs text-gray-400 hover:text-emerald-600">
            + Set an Expo Stand revenue target for this show
          </button>
        )}
      </div>

      {/* Contribution split — where the day's revenue came from */}
      {!loading && (posTillRev + qrRev + onlineRev) > 0 && (() => {
        const parts = [
          { label: "POS + till", v: posTillRev, c: "#0e7490" },
          { label: "QR scans", v: qrRev, c: "#6366f1" },
          { label: "Online → " + stateAbbr(data?.show?.state), v: onlineRev, c: "#f59e0b" },
        ].filter(p => p.v > 0);
        const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
        let acc = 0;
        const stops = parts.map(p => { const a = acc; acc += (p.v / tot) * 360; return `${p.c} ${a}deg ${acc}deg`; }).join(", ");
        return (
          <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-5">
            <div className="relative w-20 h-20 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
              <span className="absolute inset-[9px] rounded-full bg-white" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Contribution</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {parts.map(p => (
                  <div key={p.label} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.c }} />
                    <span className="text-slate-600">{p.label}</span>
                    <span className="font-bold text-slate-800">{aud(p.v)}</span>
                    <span className="text-gray-400">({Math.round((p.v / tot) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Just sold — live order ticker */}
      {live && (data?.recent?.length ?? 0) > 0 && (
        <div className="bg-slate-50 border-b border-gray-100 px-5 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Just sold</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data!.recent!.slice(0, 10).map((r, i) => (
              <div key={i} className="shrink-0 flex items-center gap-2 bg-white border border-gray-100 rounded-full pl-2 pr-3 py-1 shadow-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: r.brand_id === -1 ? "#6366f1" : colorOf(r.brand_id) }} />
                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{aud(r.amount)}</span>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{r.label} · {relTime(r.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-brand running totals (booth, with online shown alongside) */}
      <div className="bg-white px-5 py-4">
        {(!data || data.rows.length === 0) ? (
          <p className="text-sm text-gray-400 text-center py-4">
            {loading ? "Pulling live sales…" : "No sales through yet — they’ll appear here the moment the first order lands."}
          </p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 pb-1">
              <span className="w-28 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Brand</span>
              <span className="flex-1" />
              <span className="w-16 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Expo Stand</span>
              <span className="w-16 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Online {data?.show?.state ? `→ ${stateAbbr(data.show.state)}` : ""}</span>
              <span className="w-16 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">Total</span>
            </div>
            {/* Group into UPPAbaby and the Coolkidz brands so both track side by side */}
            {[
              { label: "UPPAbaby", rows: data.rows.filter(r => r.brand_id === 5) },
              { label: "Coolkidz Brands", rows: data.rows.filter(r => r.brand_id !== 5) },
            ].filter(g => g.rows.length > 0).map(g => {
              const gBooth = g.rows.reduce((s, r) => s + r.boothRevenue, 0);
              const gOnline = g.rows.reduce((s, r) => s + r.onlineRevenue, 0);
              return (
                <div key={g.label} className="space-y-2.5 pt-1">
                  {/* Group subtotal header */}
                  <div className="flex items-center gap-3 border-t border-gray-100 pt-2">
                    <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{g.label}</span>
                    <span className="w-16 text-right text-[11px] font-semibold text-slate-500 tabular-nums">{aud(gBooth)}</span>
                    <span className="w-16 text-right text-[11px] text-gray-400 tabular-nums">{gOnline > 0 ? `+${aud(gOnline)}` : "—"}</span>
                    <span className="w-16 text-right text-[11px] font-bold text-slate-700 tabular-nums">{aud(gBooth + gOnline)}</span>
                  </div>
                  {g.rows.map(r => (
                    <div key={r.brand_id} className="flex items-center gap-3">
                      <span className="text-xs text-slate-600 w-28 truncate flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: colorOf(r.brand_id) }} />
                        {r.name}
                      </span>
                      <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden flex">
                        <div className="h-full transition-all duration-700" style={{ width: `${Math.max(2, (r.boothRevenue / maxRev) * 100)}%`, background: colorOf(r.brand_id) }} title="Booth" />
                        {r.onlineRevenue > 0 && (
                          <div className="h-full transition-all duration-700 opacity-40" style={{ width: `${(r.onlineRevenue / maxRev) * 100}%`, background: colorOf(r.brand_id) }} title="Online (to state)" />
                        )}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 w-16 text-right tabular-nums">{aud(r.boothRevenue)}</span>
                      <span className="text-[11px] text-gray-400 w-16 text-right tabular-nums">{r.onlineRevenue > 0 ? `+${aud(r.onlineRevenue)}` : "—"}</span>
                      <span className="text-xs font-bold text-slate-800 w-16 text-right tabular-nums">{aud(r.boothRevenue + r.onlineRevenue)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-3">Solid = expo stand (POS + till + QR) · faded = online orders shipping to {data?.show?.state ?? "the state"} during the show.</p>
      </div>

      {/* Sales by day (multi-day shows) */}
      {(data?.byDay?.length ?? 0) > 1 && (
        <div className="bg-white border-t border-gray-100 px-5 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Sales by Day · stand + online</h3>
          <div className="flex gap-3">
            {data!.byDay!.map(d => {
              const dt = new Date(d.date + "T00:00:00");
              const isToday = d.date === aestNow().date;
              return (
                <div key={d.date} className={`flex-1 rounded-lg border px-3 py-2.5 ${isToday ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-gray-50/60"}`}>
                  <p className="text-[11px] font-semibold text-slate-600">
                    {dt.toLocaleDateString("en-AU", { weekday: "long" })} <span className="text-gray-400 font-normal">{dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                    {isToday && <span className="ml-1 text-[9px] font-bold text-emerald-600 uppercase">· today</span>}
                  </p>
                  <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">{aud(d.total)}</p>
                  <p className="text-[10px] text-gray-400">{d.orders} orders · total</p>
                  <p className="text-[10px] text-gray-400 mt-1">Stand {aud(d.booth)} · Online {aud(d.online)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day filter (multi-day shows) — controls the hour chart + top sellers */}
      {dayTabs.length > 1 && (
        <div className="bg-white border-t border-gray-100 px-5 pt-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setDaySel("all")} className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${daySel === "all" ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>All days</button>
            {dayTabs.map(d => (
              <button key={d.date} onClick={() => setDaySel(d.date)} className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${daySel === d.date ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>
                {new Date(d.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short" })}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-400">filters the hour &amp; top-seller views below</span>
        </div>
      )}

      {/* Sales by hour */}
      {vSpan.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-5 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Sales by Hour · expo stand{daySel !== "all" ? ` · ${new Date(daySel + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long" })}` : ""}
            </h3>
            {vPeak != null && <span className="text-[10px] text-gray-400">peak {hourLabel(vPeak)}–{hourLabel(vPeak + 1)}</span>}
          </div>
          <div className="flex items-end gap-1.5 h-28">
            {vSpan.map(h => {
              const v = vByHour[h];
              return (
                <div key={h} className="flex-1 h-full flex flex-col items-center justify-end gap-1 group">
                  <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums shrink-0">{v > 0 ? aud(v) : ""}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className={`w-full rounded-t transition-all ${h === vPeak ? "bg-emerald-500" : "bg-emerald-300"}`} style={{ height: `${v > 0 ? Math.max(3, (v / vMax) * 100) : 0}%` }} />
                  </div>
                  <span className="text-[9px] text-gray-400 shrink-0">{hourLabel(h)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top sellers at the booth */}
      {vTop.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-5 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Top Sellers · expo stand{daySel !== "all" ? ` · ${new Date(daySel + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long" })}` : ""}
            </h3>
            <span className="text-[10px] text-gray-400">by revenue · ex-GST</span>
          </div>
          <div className="space-y-1.5">
            {vTop.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(p.brand_id) }} />
                <span className="flex-1 text-xs text-slate-700 truncate" title={p.title}>{p.title}</span>
                <span className="text-[11px] text-gray-400 w-10 text-right shrink-0">×{p.qty}</span>
                <span className="text-xs font-bold text-slate-800 w-16 text-right tabular-nums shrink-0">{aud(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
