"use client";

import React from "react";
import type { Brand, SalesBudgetRow, ChannelSaleRow } from "@/lib/db";
import { buildChannels, channelColor } from "@/lib/channels";

// Budget sheet channel name -> the channel name buildChannels produces for actuals.
const TO_ACTUAL: Record<string, string> = {
  "Direct / Website": "Website Sales", "Wholesale": "Wholesale", "Baby Bunting": "Baby Bunting",
  "Amazon": "Amazon", "MarketPlace": "Marketplace", "Affiliate": "Affiliates",
  "Partnerships": "Partnerships", "Specialty": "Specialty", "The Memo": "The Memo",
  "Hatch Baby": "New Zealand", "Online Wholesale": "Online Wholesale",
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const aud = (n: number) => (Math.abs(n) >= 1_000_000 ? "$" + (n / 1_000_000).toFixed(2) + "M" : Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(0) + "K" : "$" + Math.round(n).toLocaleString());
const audFull = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");

type Props = {
  brands: Brand[];
  salesBudget: SalesBudgetRow[];
  channelSales: ChannelSaleRow[];
  monthly: { brand_id: number; month_key: string; revenue: number }[];
  tradeshows: any[]; tradeshowSales: any[]; shopifySources: any[];
  monthKeys: string[]; monthLabels: string[]; latest: string; fyLabel: string;
  canEdit: boolean;
};

export function SalesBudget({ brands, salesBudget, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, monthLabels, latest, fyLabel, canEdit }: Props) {
  const [scope, setScope] = React.useState<number | "all">("all");
  const [view, setView] = React.useState<"pacing" | "grid">("pacing");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  // Local copy so inline edits reflect immediately; reseed if the server data changes.
  const [budgetRows, setBudgetRows] = React.useState<SalesBudgetRow[]>(salesBudget);
  React.useEffect(() => setBudgetRows(salesBudget), [salesBudget]);
  const editable = canEdit && scope !== "all";

  const budgetBrands = React.useMemo(() => {
    const ids = new Set(budgetRows.map(r => r.brand_id));
    return brands.filter(b => ids.has(b.id));
  }, [brands, budgetRows]);

  const rowsInScope = React.useMemo(() => budgetRows.filter(r => scope === "all" || r.brand_id === scope), [budgetRows, scope]);
  const channels = React.useMemo(() => {
    const t = new Map<string, number>(), f = new Map<string, number>();
    const seenF = new Set<string>();
    for (const r of rowsInScope) {
      t.set(r.channel, (t.get(r.channel) ?? 0) + (r.target || 0));
      const k = `${r.brand_id}|${r.channel}`;
      if (!seenF.has(k)) { seenF.add(k); f.set(r.channel, (f.get(r.channel) ?? 0) + (r.fy26_actual || 0)); }
    }
    return [...new Set([...t.keys(), ...f.keys()])]
      .filter(c => (t.get(c) ?? 0) > 0.5 || (f.get(c) ?? 0) > 0.5)
      .sort((a, b) => (t.get(b) ?? 0) - (t.get(a) ?? 0));
  }, [rowsInScope]);

  // Set a channel's full-year target for the selected brand (even monthly split) and persist.
  async function saveTarget(brandId: number, channel: string, annual: number) {
    const monthly = Math.round((annual / 12) * 100) / 100;
    const fy26 = budgetRows.find(r => r.brand_id === brandId && r.channel === channel)?.fy26_actual ?? 0;
    const newRows = monthKeys.map(mk => ({ brand_id: brandId, channel, month_key: mk, target: monthly, fy26_actual: fy26 }));
    setBudgetRows(prev => [...prev.filter(r => !(r.brand_id === brandId && r.channel === channel)), ...newRows]);
    setMsg("");
    const res = await fetch("/api/sales-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: newRows }) }).then(r => r.json()).catch(() => ({ ok: false }));
    if (!res.ok) setMsg("Couldn't save that target — try again.");
  }

  // target[channel][monthIdx]
  const targetByCh = React.useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const c of channels) m[c] = monthKeys.map(() => 0);
    for (const r of rowsInScope) {
      const i = monthKeys.indexOf(r.month_key);
      if (i >= 0 && m[r.channel]) m[r.channel][i] += r.target || 0;
    }
    return m;
  }, [rowsInScope, channels, monthKeys]);
  const fy26ByCh = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rowsInScope) { if (!(r.channel in m)) m[r.channel] = 0; }
    // fy26_actual is repeated per row (annual); take one per brand+channel
    const seen = new Set<string>();
    for (const r of rowsInScope) {
      const k = `${r.brand_id}|${r.channel}`;
      if (seen.has(k)) continue; seen.add(k);
      m[r.channel] = (m[r.channel] ?? 0) + (r.fy26_actual || 0);
    }
    return m;
  }, [rowsInScope]);

  // Actual revenue per channel per month from the live dashboard rollup. Some budget
  // channels have no distinct live channel (they fold into Wholesale) — flag those.
  const { actualByCh, mappedCh } = React.useMemo(() => {
    const chans = buildChannels(scope, { brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, latest } as any);
    const byName: Record<string, any> = {};
    for (const c of chans) byName[norm(c.name)] = c;
    const out: Record<string, number[]> = {}; const mapped = new Set<string>();
    for (const c of channels) {
      const ch = byName[norm(TO_ACTUAL[c] ?? c)];
      if (ch) mapped.add(c);
      out[c] = monthKeys.map((_, i) => (ch ? ch.series[i] ?? 0 : 0));
    }
    return { actualByCh: out, mappedCh: mapped };
  }, [scope, brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, latest, channels]);

  const elapsedIdx = Math.max(0, monthKeys.indexOf(latest));
  const monthsElapsed = elapsedIdx + 1;
  const sumTo = (arr: number[]) => arr.slice(0, elapsedIdx + 1).reduce((s, v) => s + (v || 0), 0);
  const sumAll = (arr: number[]) => arr.reduce((s, v) => s + (v || 0), 0);

  const rows = channels.map(c => {
    const fyTarget = sumAll(targetByCh[c]);
    const tgtYtd = sumTo(targetByCh[c]);
    const mapped = mappedCh.has(c);
    const actYtd = mapped ? sumTo(actualByCh[c]) : null;
    const pace = mapped && tgtYtd > 0 && actYtd != null ? (actYtd / tgtYtd) * 100 : null;
    const projFy = mapped && monthsElapsed > 0 && actYtd != null ? (actYtd / monthsElapsed) * 12 : null;
    return { c, mapped, fyTarget, fy26: fy26ByCh[c] ?? 0, tgtYtd, actYtd, pace, projFy };
  });
  const tot = rows.reduce((a, r) => ({ fyTarget: a.fyTarget + r.fyTarget, fy26: a.fy26 + r.fy26, tgtYtd: a.tgtYtd + r.tgtYtd, actYtd: a.actYtd + (r.actYtd ?? 0), projFy: a.projFy + (r.projFy ?? 0) }), { fyTarget: 0, fy26: 0, tgtYtd: 0, actYtd: 0, projFy: 0 });
  const totPace = tot.tgtYtd > 0 ? (tot.actYtd / tot.tgtYtd) * 100 : null;

  const paceColor = (p: number | null) => p == null ? "text-gray-300" : p >= 98 ? "text-emerald-600" : p >= 85 ? "text-amber-600" : "text-rose-500";
  const paceBg = (p: number | null) => p == null ? "#e5e7eb" : p >= 98 ? "#10b981" : p >= 85 ? "#f59e0b" : "#f43f5e";

  async function upload(file: File) {
    setBusy(true); setMsg("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const hdrIdx = grid.findIndex(r => r[0] === "Account");
      if (hdrIdx < 0) { setMsg("Couldn't find the 'Account' header row — is this the sales budget export?"); setBusy(false); return; }
      const MON: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
      const monthCols: Record<number, string> = {};
      grid[hdrIdx].forEach((h: any, i: number) => { if (typeof h === "string" && h.includes("-") && MON[h.slice(0, 3)]) { const [mon, yy] = h.split("-"); monthCols[i] = `20${yy}-${MON[mon]}`; } });
      const bmap = new Map(brands.map(b => [norm(b.name), b.id]));
      const out: any[] = []; let cur: number | null = null;
      for (const r of grid.slice(hdrIdx + 1)) {
        const acct = String(r[0] ?? "").trim(); if (!acct) continue;
        if (acct.startsWith("Total ")) { cur = null; continue; }
        const nonempty = r.slice(1).some((x: any) => x !== "" && x != null);
        if (!nonempty && bmap.has(norm(acct))) { cur = bmap.get(norm(acct))!; continue; }
        if (cur == null) continue;
        const fy26 = typeof r[1] === "number" ? r[1] : 0;
        const fy27 = typeof r[6] === "number" ? r[6] : 0;
        if (!fy27 && !fy26) continue;
        for (const [i, mk] of Object.entries(monthCols)) {
          const v = typeof r[+i] === "number" ? r[+i] : 0;
          out.push({ brand_id: cur, channel: acct, month_key: mk, target: Math.round((v || 0) * 100) / 100, fy26_actual: Math.round((fy26 || 0) * 100) / 100 });
        }
      }
      if (!out.length) { setMsg("No budget rows found in the file."); setBusy(false); return; }
      const res = await fetch("/api/sales-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: out, replace: true }) }).then(r => r.json());
      if (res.ok) { setMsg(`✓ Loaded ${out.length} rows. Reloading…`); setTimeout(() => window.location.reload(), 900); }
      else setMsg(res.error === "forbidden" ? "Admins only." : (res.error || "Upload failed."));
    } catch (e: any) { setMsg("Couldn't read the file."); }
    setBusy(false);
  }

  if (!budgetRows.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-xl">
        <h2 className="font-semibold text-gray-800">Sales budget not loaded yet</h2>
        <p className="text-sm text-gray-500 mt-1">Run <code className="bg-gray-100 px-1 rounded">supabase/add_sales_budget.sql</code> in Supabase, then upload the FY27 budget export{canEdit ? " below" : ""} (or ask an admin to).</p>
        {canEdit && (
          <label className={`inline-block mt-4 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 cursor-pointer ${busy ? "opacity-50" : ""}`}>
            {busy ? "Uploading…" : "Upload budget .xlsx"}
            <input type="file" accept=".xlsx" disabled={busy} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
          </label>
        )}
        {msg && <p className="text-xs text-rose-500 mt-2">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select value={scope === "all" ? "all" : String(scope)} onChange={e => setScope(e.target.value === "all" ? "all" : Number(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
            <option value="all">All Brands (Portfolio)</option>
            {budgetBrands.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold">
            {(["pacing", "grid"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md transition ${view === v ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>{v === "pacing" ? "Pacing" : "Budget grid"}</button>
            ))}
          </div>
        </div>
        {canEdit && (
          <label className={`text-xs font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 cursor-pointer ${busy ? "opacity-50" : ""}`}>
            {busy ? "Uploading…" : "↑ Update from .xlsx"}
            <input type="file" accept=".xlsx" disabled={busy} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
          </label>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-600" : "text-rose-500"}`}>{msg}</p>}

      {view === "pacing" ? (
        <>
          {/* Headline pacing cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: `FY27 target`, value: aud(tot.fyTarget), sub: fyLabel },
              { label: `Target to ${monthLabels[elapsedIdx] ?? ""}`, value: aud(tot.tgtYtd), sub: `${monthsElapsed} month${monthsElapsed === 1 ? "" : "s"}` },
              { label: "Actual to date", value: aud(tot.actYtd), sub: "live channel sales" },
              { label: "Pace", value: totPace != null ? Math.round(totPace) + "%" : "—", sub: totPace == null ? "" : totPace >= 98 ? "on / ahead" : totPace >= 85 ? "slightly behind" : "behind target", pace: totPace },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{k.label}</p>
                <p className={`text-2xl font-extrabold mt-1 leading-none tabular-nums ${"pace" in k ? paceColor((k as any).pace) : "text-slate-900"}`}>{k.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Channel pacing table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="text-gray-400 border-b border-gray-200">
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] py-2 pl-1">Channel</th>
                  <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2">FY27 Target</th>
                  <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2">FY26 Actual</th>
                  <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2">Growth</th>
                  <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2">Target YTD</th>
                  <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2">Actual YTD</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] py-2 pl-4 w-40">Pace</th>
                  <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2 pr-1">Proj. FY</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const growth = r.fy26 > 0 ? ((r.fyTarget - r.fy26) / r.fy26) * 100 : null;
                  const projPct = r.projFy != null && r.fyTarget > 0 ? (r.projFy / r.fyTarget) * 100 : null;
                  return (
                    <tr key={r.c} className="border-b border-gray-50">
                      <td className="py-2 pl-1"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: channelColor(TO_ACTUAL[r.c] ?? r.c) }} /><span className="font-semibold text-slate-700">{r.c}</span></span></td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-800">
                        {editable ? (
                          <input key={`t-${r.c}-${Math.round(r.fyTarget)}`} defaultValue={Math.round(r.fyTarget)}
                            onBlur={e => { const v = Number(String(e.target.value).replace(/[^0-9.]/g, "")); if (isFinite(v) && Math.round(v) !== Math.round(r.fyTarget)) saveTarget(scope as number, r.c, v); }}
                            className="w-24 text-right bg-emerald-50/50 border border-emerald-100 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                        ) : audFull(r.fyTarget)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{r.fy26 > 0 ? audFull(r.fy26) : "—"}</td>
                      <td className={`py-2 text-right tabular-nums ${growth == null ? "text-gray-300" : growth >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {editable && r.fy26 > 0 ? (
                          <span className="inline-flex items-center gap-0.5">
                            <input key={`g-${r.c}-${growth == null ? "" : Math.round(growth)}`} defaultValue={growth == null ? "" : Math.round(growth)}
                              onBlur={e => { const g = Number(String(e.target.value).replace(/[^0-9.-]/g, "")); if (isFinite(g)) saveTarget(scope as number, r.c, r.fy26 * (1 + g / 100)); }}
                              className="w-12 text-right bg-emerald-50/50 border border-emerald-100 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                            <span className="text-gray-400">%</span>
                          </span>
                        ) : (growth == null ? "—" : (growth >= 0 ? "+" : "") + Math.round(growth) + "%")}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{audFull(r.tgtYtd)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-700">{r.actYtd == null ? <span className="text-gray-300" title="No separate live channel — folds into Wholesale">—</span> : audFull(r.actYtd)}</td>
                      <td className="py-2 pl-4">
                        {r.actYtd == null ? <span className="text-[11px] text-gray-300">n/a</span> : (
                          <span className="flex items-center gap-2">
                            <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[90px]"><span className="block h-full rounded-full" style={{ width: `${Math.min(r.pace ?? 0, 100)}%`, background: paceBg(r.pace) }} /></span>
                            <span className={`text-[11px] font-bold tabular-nums ${paceColor(r.pace)}`}>{r.pace == null ? "—" : Math.round(r.pace) + "%"}</span>
                          </span>
                        )}
                      </td>
                      <td className={`py-2 pr-1 text-right tabular-nums font-semibold ${r.projFy == null ? "text-gray-300" : projPct == null ? "text-gray-300" : projPct >= 98 ? "text-emerald-600" : projPct >= 85 ? "text-amber-600" : "text-rose-500"}`}>{r.projFy == null ? "—" : audFull(r.projFy)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-bold text-slate-800">
                  <td className="py-2 pl-1">Total</td>
                  <td className="py-2 text-right tabular-nums">{audFull(tot.fyTarget)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{tot.fy26 > 0 ? audFull(tot.fy26) : "—"}</td>
                  <td className={`py-2 text-right tabular-nums ${tot.fy26 > 0 ? (tot.fyTarget >= tot.fy26 ? "text-emerald-600" : "text-rose-500") : "text-gray-300"}`}>{tot.fy26 > 0 ? (tot.fyTarget >= tot.fy26 ? "+" : "") + Math.round(((tot.fyTarget - tot.fy26) / tot.fy26) * 100) + "%" : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{audFull(tot.tgtYtd)}</td>
                  <td className="py-2 text-right tabular-nums">{audFull(tot.actYtd)}</td>
                  <td className="py-2 pl-4"><span className={`text-[11px] font-bold ${paceColor(totPace)}`}>{totPace == null ? "—" : Math.round(totPace) + "%"}</span></td>
                  <td className="py-2 pr-1 text-right tabular-nums">{audFull(tot.projFy)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-[10px] text-gray-400 mt-2">Pace = actual vs target for the {monthsElapsed} month{monthsElapsed === 1 ? "" : "s"} to {monthLabels[elapsedIdx] ?? "date"}. Proj. FY = run-rate (actual to date annualised). Actuals map budget channels to live sales channels; unmatched channels show as behind.
              {editable ? " Edit the FY27 Target or Growth % to adjust a target (splits evenly across the year and saves automatically)." : canEdit ? " Select a single brand to edit targets and expected growth." : ""}</p>
            {(() => {
              const un = rows.filter(r => !r.mapped).map(r => r.c);
              return un.length ? <p className="text-[10px] text-amber-600 mt-1">{un.join(", ")} {un.length === 1 ? "has" : "have"} no separate live sales channel yet, so pace shows n/a until those sales report under their own channel.</p> : null;
            })()}
          </div>
        </>
      ) : (
        /* Budget grid: channel × month targets */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-semibold uppercase tracking-wide text-[10px] py-2 px-2 sticky left-0 bg-white">Channel</th>
                {monthKeys.map((mk, i) => <th key={mk} className="text-right font-semibold uppercase tracking-wide text-[10px] py-2 px-2">{monthLabels[i]}</th>)}
                <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2 px-2 border-l border-gray-100">FY27</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(c => (
                <tr key={c} className="border-t border-gray-50">
                  <td className="py-1.5 px-2 text-slate-700 font-medium sticky left-0 bg-white">{c}</td>
                  {monthKeys.map((mk, i) => <td key={mk} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{targetByCh[c][i] > 0 ? audFull(targetByCh[c][i]) : "—"}</td>)}
                  <td className="py-1.5 px-2 text-right tabular-nums font-bold text-slate-800 border-l border-gray-100">{audFull(sumAll(targetByCh[c]))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-bold text-slate-800">
                <td className="py-2 px-2 sticky left-0 bg-white">Total</td>
                {monthKeys.map((_, i) => <td key={i} className="py-2 px-2 text-right tabular-nums">{audFull(channels.reduce((s, c) => s + targetByCh[c][i], 0))}</td>)}
                <td className="py-2 px-2 text-right tabular-nums border-l border-gray-100">{audFull(channels.reduce((s, c) => s + sumAll(targetByCh[c]), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
