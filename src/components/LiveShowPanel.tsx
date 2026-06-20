"use client";

import { useEffect, useState, useRef } from "react";
import type { Brand } from "@/lib/db";

type Row = { brand_id: number; name: string; boothRevenue: number; boothOrders: number; onlineRevenue: number; onlineOrders: number };
type Prod = { title: string; brand_id: number; revenue: number; qty: number };
type Compare = { name: string; date_start: string; boothTotal: number; showTotal: number; samePoint?: boolean; atFraction?: number };
type LiveData = {
  live: boolean; boothTotal: number; boothOrders: number; showTotal: number; showOrders: number;
  rows: Row[]; updatedAt: string; topProducts?: Prod[]; byHour?: number[]; compare?: Compare | null; target?: number | null;
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

// Show open hours (AEST) used for pacing
const OPEN = 9, CLOSE = 17;
const hourLabel = (h: number) => { const ap = h < 12 ? "am" : "pm"; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}${ap}`; };

// "Now" in Brisbane time (AEST, no DST) — good enough for show pacing nationwide
function aestNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
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
  const compareFetched = useRef(false);
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

  // Sales-by-hour range
  const byHour = data?.byHour ?? [];
  const activeHours = byHour.map((v, h) => ({ v, h })).filter(x => x.v > 0);
  const hMin = activeHours.length ? Math.min(...activeHours.map(x => x.h)) : OPEN;
  const hMax = activeHours.length ? Math.max(...activeHours.map(x => x.h)) : CLOSE;
  const hourSpan = activeHours.length ? Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i) : [];
  const hourMax = Math.max(1, ...byHour);
  const peakHour = activeHours.length ? activeHours.reduce((a, b) => (b.v > a.v ? b : a)).h : null;

  function downloadPdf() {
    if (!data) return;
    const s = data.show ?? {};
    const fmtDate = (d?: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
    const rowsHtml = data.rows.map(r => `<tr><td>${r.name}</td><td class="r">${aud(r.boothRevenue)}</td><td class="r">${r.boothOrders}</td><td class="r">${r.onlineRevenue > 0 ? "+" + aud(r.onlineRevenue) : "—"}</td></tr>`).join("");
    const prodHtml = (data.topProducts ?? []).map((p, i) => `<tr><td>${i + 1}</td><td>${p.title}</td><td class="r">×${p.qty}</td><td class="r">${aud(p.revenue)}</td></tr>`).join("");
    const pacingHtml = target ? `<p><b>Booth target:</b> ${aud(target)} — ${pct.toFixed(0)}% achieved${finished ? (booth >= target ? " ✓ hit" : ` (${aud(target - booth)} short)`) : ""}</p>` : "";
    const cmpHtml = cmpDelta != null ? `<p><b>vs ${compare!.name} (${fmtDate(compare!.date_start)})${compare!.samePoint ? ", same point" : ""}:</b> ${cmpDelta >= 0 ? "▲" : "▼"} ${Math.abs(cmpDelta).toFixed(0)}% &nbsp; (${aud(compare!.boothTotal)} → ${aud(booth)})</p>` : "";
    const peakHtml = peakHour != null ? `<p><b>Peak hour:</b> ${hourLabel(peakHour)}–${hourLabel(peakHour + 1)} (${aud(byHour[peakHour])})</p>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${s.name ?? "Show"} — Report</title>
      <style>
        body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;margin:32px;}
        h1{font-size:20px;margin:0 0 2px;} .sub{color:#64748b;margin:0 0 16px;}
        .big{font-size:28px;font-weight:700;margin:0;} .lbl{color:#64748b;font-size:12px;}
        .cards{display:flex;gap:32px;margin:12px 0 8px;}
        table{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:12px;}
        th{text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;padding:6px 8px;}
        td{padding:6px 8px;border-bottom:1px solid #f1f5f9;} td.r,th.r{text-align:right;}
        h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:18px 0 4px;}
        .meta{color:#94a3b8;font-size:11px;margin-top:24px;}
      </style></head><body>
      <h1>${s.name ?? "Show"}</h1>
      <p class="sub">${fmtDate(s.date_start)}${s.date_end && s.date_end !== s.date_start ? " – " + fmtDate(s.date_end) : ""}${s.state ? " · " + s.state : ""}</p>
      <div class="cards">
        <div><p class="big">${aud(booth)}</p><p class="lbl">Booth sales · ${data.boothOrders} orders</p></div>
        <div><p class="big">${aud(data.showTotal)}</p><p class="lbl">Show-window total · ${data.showOrders} orders</p></div>
      </div>
      ${pacingHtml}${cmpHtml}${peakHtml}
      <h2>By Brand</h2>
      <table><thead><tr><th>Brand</th><th class="r">Booth</th><th class="r">Orders</th><th class="r">Online to state</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <h2>Top Sellers · booth</h2>
      <table><thead><tr><th>#</th><th>Product</th><th class="r">Qty</th><th class="r">Revenue</th></tr></thead><tbody>${prodHtml}</tbody></table>
      <p class="meta">Booth = POS + Coolkidz till + QR scans · ex-GST. Generated ${new Date().toLocaleString("en-AU")} from Brand Command.</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className={`rounded-xl overflow-hidden border ${live ? "border-emerald-200" : "border-slate-200"}`}>
      {/* Banner — both figures */}
      <div className={`px-5 py-4 text-white bg-gradient-to-r ${live ? "from-emerald-500 to-teal-500" : "from-slate-600 to-slate-500"}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {live && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">{live ? "Live · Show Day" : "Show Report"}</span>
          </div>
          <div className="flex items-center gap-3">
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
            <p className="text-xs text-white/85">Booth sales · {data?.boothOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">POS + Coolkidz till + QR</p>
          </div>
          <div className="opacity-90">
            <p className="text-2xl font-semibold tabular-nums">{loading ? "…" : aud(data?.showTotal ?? 0)}</p>
            <p className="text-xs text-white/85">Show-window total · {data?.showOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">booth + online orders to {data?.show?.state ?? "state"}</p>
          </div>
        </div>
        {cmpDelta != null && (
          <p className="text-[10px] text-white/70 mt-2">
            vs {compare!.name}, {new Date(compare!.date_start + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            {compare!.samePoint ? " at the same point" : ""} — booth {aud(compare!.boothTotal)}
          </p>
        )}
      </div>

      {/* Target & pacing */}
      <div className="bg-white border-b border-gray-100 px-5 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Booth target $</span>
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
                Booth target · {aud(booth)} of {aud(target)}
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
            + Set a booth revenue target for this show
          </button>
        )}
      </div>

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
              <span className="w-16 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Booth</span>
              <span className="w-20 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Online {data?.show?.state ? `→ ${stateAbbr(data.show.state)}` : ""}</span>
            </div>
            {data.rows.map(r => (
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
                <span className="text-xs font-bold text-slate-700 w-16 text-right tabular-nums">{aud(r.boothRevenue)}</span>
                <span className="text-[11px] text-gray-400 w-20 text-right">{r.onlineRevenue > 0 ? `+${aud(r.onlineRevenue)}` : ""}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-3">Solid = booth (POS + till + QR) · faded = online orders shipping to {data?.show?.state ?? "the state"} during the show.</p>
      </div>

      {/* Sales by hour */}
      {hourSpan.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-5 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sales by Hour · booth</h3>
            {peakHour != null && <span className="text-[10px] text-gray-400">peak {hourLabel(peakHour)}–{hourLabel(peakHour + 1)}</span>}
          </div>
          <div className="flex items-end gap-1.5 h-24">
            {hourSpan.map(h => {
              const v = byHour[h];
              return (
                <div key={h} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                  <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">{v > 0 ? aud(v) : ""}</span>
                  <div className={`w-full rounded-t transition-all ${h === peakHour ? "bg-emerald-500" : "bg-emerald-300"}`} style={{ height: `${Math.max(2, (v / hourMax) * 100)}%` }} />
                  <span className="text-[9px] text-gray-400">{hourLabel(h)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top sellers at the booth */}
      {data?.topProducts && data.topProducts.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-5 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Top Sellers · booth</h3>
            <span className="text-[10px] text-gray-400">by revenue · ex-GST</span>
          </div>
          <div className="space-y-1.5">
            {data.topProducts.map((p, i) => (
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
