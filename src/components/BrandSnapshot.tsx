"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSnapshot, snapshotHtml, type SnapshotInput } from "@/lib/snapshot";
import { FY_LIST, FY_LABEL, type FY } from "@/lib/fy";

type Props = Omit<SnapshotInput, "brand" | "note"> & {
  brands: { id: number; name: string; live?: boolean }[];
  selected: number | "all";
  onSelect: (id: number) => void;
  canEdit: boolean;
  // Reporting-basis picker — drives the SAME global FY/Month state as the
  // sidebar selectors, so both stay in sync and there's only one source of truth.
  fy: FY;
  setFy: (fy: FY) => void;
  wholeYear: boolean;
  monthSel: string;
  setMonthSel: (m: string) => void;
  monthOptions: string[];
  // Unfiltered-by-FY copies — needed for calendar-year mode, which straddles
  // two financial years, so the pre-filtered props above can't be reused.
  rawMonthly: SnapshotInput["monthly"];
  rawTargets: SnapshotInput["targets"];
  rawGoogleAds: SnapshotInput["googleAds"];
  rawMetaAds: SnapshotInput["metaAds"];
  rawKlaviyo: SnapshotInput["klaviyo"];
  rawGoogleAdsCampaigns: SnapshotInput["googleAdsCampaigns"];
  rawMarketingActuals: SnapshotInput["marketingActuals"];
  rawMarketingBudgets: SnapshotInput["marketingBudgets"];
};

export function BrandSnapshot({ brands, selected, onSelect, canEdit, month, monthKeys, monthLabels, fyLabel, fy, setFy, wholeYear, monthSel, setMonthSel, monthOptions, rawMonthly, rawTargets, rawGoogleAds, rawMetaAds, rawKlaviyo, rawGoogleAdsCampaigns, rawMarketingActuals, rawMarketingBudgets, ...data }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameH, setFrameH] = useState(1680);
  // Auto-size the iframe to its content so there's no fixed-height gap or clipping.
  function fitFrame() {
    const d = frameRef.current?.contentDocument;
    if (!d) return;
    const h = Math.max(d.body?.scrollHeight || 0, d.documentElement?.scrollHeight || 0);
    if (h > 0) setFrameH(h + 4);
  }
  const live = brands.filter(b => b.live !== false);
  // A snapshot is per brand — fall back to the first live brand when "all" is selected.
  const brandId = selected === "all" ? (live[0]?.id ?? brands[0]?.id) : selected;
  const brand = brands.find(b => b.id === brandId);

  // Reporting basis: financial year (the global sidebar state) or calendar
  // year (Jan–Dec, independent — a calendar year straddles two FYs).
  const [basis, setBasis] = useState<"fy" | "calendar">("fy");
  const yearOptions = useMemo(() => {
    const years = new Set<number>(rawMonthly.filter((m: any) => (m.revenue ?? 0) > 0).map((m: any) => Number(m.month_key.slice(0, 4))).filter((y: number) => Number.isFinite(y)));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [rawMonthly]);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const calMonthKeys = useMemo(() => Array.from({ length: 12 }, (_, i) => `${calYear}-${String(i + 1).padStart(2, "0")}`), [calYear]);
  const calMonthLabels = useMemo(() => calMonthKeys.map(k => {
    const [yy, mm] = k.split("-"); const d = new Date(Number(yy), Number(mm) - 1, 1);
    return `${d.toLocaleDateString("en-AU", { month: "short" })} ${yy.slice(2)}`;
  }), [calMonthKeys]);
  const calLatest = useMemo(() => {
    // brand_monthly pre-creates a full year of rows (future months sit at
    // revenue 0) — presence alone isn't "has data", so filter to real revenue.
    const present = rawMonthly.filter((m: any) => (m.revenue ?? 0) > 0).map((m: any) => m.month_key);
    const inData = calMonthKeys.filter(k => present.includes(k));
    if (inData.length) return inData[inData.length - 1];
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const past = calMonthKeys.filter(k => k <= cur);
    return past.length ? past[past.length - 1] : calMonthKeys[0];
  }, [calMonthKeys, rawMonthly]);

  const activeMonthKeys = basis === "calendar" ? calMonthKeys : monthKeys;
  const activeMonthLabels = basis === "calendar" ? calMonthLabels : monthLabels;
  const activeMonth = basis === "calendar" ? calLatest : month;
  const activeFyLabel = basis === "calendar" ? `Calendar Year ${calYear}` : fyLabel;
  // Always slice from the RAW (unfiltered-by-FY) datasets by whichever month
  // keys are active — correct for both a normal FY and a cross-FY calendar year.
  const filterMk = <T extends { month_key: string }>(rows: T[]) => rows.filter(r => activeMonthKeys.includes(r.month_key));

  // Notes are stored per brand+month and fetched on change. needsSetup => table not created yet.
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "loading" | "saving" | "saved" | "needsSetup" | "error">("idle");

  // Editable AI insights. Pre-fills with the generated text; a saved edit replaces it in the report.
  const aiDefault = useMemo(() => [...(data.brandInsights ?? [])].filter((i: any) => i.brand_id === brandId).sort((a: any, b: any) => (b.generated_at || "").localeCompare(a.generated_at || ""))[0]?.content ?? "", [data.brandInsights, brandId]);
  const [insights, setInsights] = useState("");
  const [savedInsights, setSavedInsights] = useState("");
  const [insState, setInsState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Open-tracked share links for this brand + month.
  const [topups, setTopups] = useState<any[]>([]);
  useEffect(() => { fetch("/api/budget-topups").then(r => r.json()).then(j => setTopups(j.topups ?? [])).catch(() => {}); }, []);
  const [shares, setShares] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareNeedsSetup, setShareNeedsSetup] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!brand) return;
    let cancelled = false;
    setNoteState("loading");
    fetch(`/api/snapshot-notes?brand=${brand.id}&month=${activeMonth}`)
      .then(r => r.json())
      .then(j => { if (cancelled) return; if (j.needsSetup) setNoteState("needsSetup"); else setNoteState("idle"); setNote(j.content ?? ""); setSavedNote(j.content ?? ""); setSavedInsights(j.insights ?? ""); setInsights((j.insights && j.insights.trim()) ? j.insights : aiDefault); })
      .catch(() => { if (!cancelled) setNoteState("error"); });
    return () => { cancelled = true; };
  }, [brand?.id, activeMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNote() {
    if (!brand) return;
    setNoteState("saving");
    try {
      const res = await fetch("/api/snapshot-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brand.id, month_key: activeMonth, content: note, insights: savedInsights }) });
      const j = await res.json();
      if (j.ok) { setSavedNote(note); setNoteState("saved"); setTimeout(() => setNoteState("idle"), 1800); }
      else setNoteState(j.needsSetup ? "needsSetup" : "error");
    } catch { setNoteState("error"); }
  }

  async function saveInsights() {
    if (!brand) return;
    setInsState("saving");
    try {
      const res = await fetch("/api/snapshot-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brand.id, month_key: activeMonth, content: savedNote, insights }) });
      const j = await res.json();
      if (j.ok && !j.insightsUnsupported) { setSavedInsights(insights); setInsState("saved"); setTimeout(() => setInsState("idle"), 1800); }
      else setInsState("error");
    } catch { setInsState("error"); }
  }
  function resetInsights() { setInsights(aiDefault); }

  // The saved note (not the in-progress edit) is what renders into the report.
  const html = useMemo(() => {
    if (!brand) return "";
    return snapshotHtml(buildSnapshot({
      ...data, brand,
      month: activeMonth, monthKeys: activeMonthKeys, monthLabels: activeMonthLabels, fyLabel: activeFyLabel,
      calendarYear: basis === "calendar",
      note: savedNote, insightsOverride: savedInsights, budgetTopups: topups,
      monthly: filterMk(rawMonthly), targets: filterMk(rawTargets),
      googleAds: filterMk(rawGoogleAds), metaAds: filterMk(rawMetaAds), klaviyo: filterMk(rawKlaviyo),
      googleAdsCampaigns: filterMk(rawGoogleAdsCampaigns), marketingActuals: filterMk(rawMarketingActuals),
      marketingBudgets: rawMarketingBudgets,
    }));
  }, [brand, activeMonth, activeMonthKeys, activeMonthLabels, activeFyLabel, basis, savedNote, savedInsights, topups, data,
      rawMonthly, rawTargets, rawGoogleAds, rawMetaAds, rawKlaviyo, rawGoogleAdsCampaigns, rawMarketingActuals, rawMarketingBudgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthName = activeMonthLabels[activeMonthKeys.indexOf(activeMonth)] ?? activeMonth;

  async function loadShares() {
    if (!brand) return;
    try {
      const j = await fetch(`/api/snapshot-share?brand_id=${brand.id}&month_key=${activeMonth}`).then(r => r.json());
      if (j.ok) { setShares(j.items); setShareNeedsSetup(false); }
      else if (j.needsSetup) setShareNeedsSetup(true);
    } catch { /* ignore */ }
  }
  useEffect(() => { loadShares(); }, [brand?.id, activeMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createShare(neverExpire = false) {
    if (!brand) return;
    setSharing(true);
    try {
      const res = await fetch("/api/snapshot-share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brand.id, brand: brand.name, month_key: activeMonth, label: `${monthName} ${activeFyLabel}`, html, expiryDays: neverExpire ? "never" : 5 }),
      });
      const j = await res.json();
      if (j.ok) await loadShares();
      else if (j.needsSetup) setShareNeedsSetup(true);
    } finally { setSharing(false); }
  }
  function copyLink(token: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/s/${token}`);
    setCopied(token); setTimeout(() => setCopied(""), 1500);
  }
  async function deleteShare(id: number) {
    if (!window.confirm("Delete this share link? Anyone who has it will no longer be able to open it.")) return;
    await fetch(`/api/snapshot-share?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadShares();
  }
  async function extendShare(id: number, neverExpire = false) {
    await fetch("/api/snapshot-share", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, expiryDays: neverExpire ? "never" : 5 }) }).catch(() => {});
    loadShares();
  }

  function printIt() { const win = frameRef.current?.contentWindow; if (win) { win.focus(); win.print(); } }

  // Re-measure after the report renders (charts/SVG/fonts reflow) and on resize.
  useEffect(() => {
    const timers = [60, 400, 1200].map(ms => setTimeout(fitFrame, ms));
    window.addEventListener("resize", fitFrame);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", fitFrame); };
  }, [html]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!brand) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No brand to report on.</div>;

  const dirty = note !== savedNote;
  const insDirty = insights !== (savedInsights || aiDefault);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={String(brandId)}
            onChange={e => onSelect(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            {live.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
          {/* Reporting basis — Financial Year (drives the same global sidebar state)
              or Calendar Year (independent — Jan–Dec straddles two FYs). Whichever
              is picked here is what the report, print and share link all use. */}
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5">
            <button type="button" onClick={() => setBasis("fy")}
              className={`text-[11.5px] font-semibold rounded-md px-2.5 py-1 transition ${basis === "fy" ? "bg-white text-slate-700 shadow-sm" : "text-gray-400"}`}>
              Financial Year
            </button>
            <button type="button" onClick={() => setBasis("calendar")}
              className={`text-[11.5px] font-semibold rounded-md px-2.5 py-1 transition ${basis === "calendar" ? "bg-white text-slate-700 shadow-sm" : "text-gray-400"}`}>
              Calendar Year
            </button>
          </div>
          {basis === "fy" ? (
            <>
              <select
                value={fy}
                onChange={e => setFy(e.target.value as FY)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {FY_LIST.map(f => <option key={f} value={f}>{FY_LABEL[f]}</option>)}
              </select>
              <select
                value={wholeYear ? "all" : monthSel}
                onChange={e => setMonthSel(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Full Year</option>
                {[...monthOptions].reverse().map(mk => (
                  <option key={mk} value={mk}>{monthLabels[monthKeys.indexOf(mk)] ?? mk}</option>
                ))}
              </select>
            </>
          ) : (
            <select
              value={calYear}
              onChange={e => setCalYear(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={printIt} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print / PDF
          </button>
        </div>
      </div>

      {/* Insights editor — pre-filled with the AI text; a saved edit replaces it in the report. */}
      {canEdit && noteState !== "needsSetup" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print order-last">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Insights & opportunities {savedInsights ? "· edited" : "· AI"}</label>
            <div className="flex items-center gap-3">
              {insState === "saved" && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
              {insState === "error" && <span className="text-xs text-red-500 font-medium">Save failed</span>}
              <button onClick={resetInsights} disabled={insights === aiDefault} className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40">Reset to AI</button>
              <button onClick={saveInsights} disabled={!insDirty || insState === "saving"} className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg px-3.5 py-1.5 transition">
                {insState === "saving" ? "Saving..." : "Save insights"}
              </button>
            </div>
          </div>
          <textarea
            value={insights}
            onChange={e => setInsights(e.target.value)}
            placeholder="The AI-written insights appear here. Edit them and save to replace what shows in the report."
            rows={7}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
        </div>
      )}

      {/* Notes editor — saved text is rendered into the report's "Notes & commentary" block. */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print order-last">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Notes for {brand.name} · {monthName}</label>
            <div className="flex items-center gap-3">
              {noteState === "saved" && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
              {noteState === "error" && <span className="text-xs text-red-500 font-medium">Save failed</span>}
              <button onClick={saveNote} disabled={!dirty || noteState === "saving"} className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg px-3.5 py-1.5 transition">
                {noteState === "saving" ? "Saving..." : "Save notes"}
              </button>
            </div>
          </div>
          {noteState === "needsSetup" ? (
            <p className="text-xs text-amber-600">Notes table not set up yet. Run <code className="bg-amber-50 px-1 rounded">supabase/add_snapshot_notes.sql</code> in Supabase, then reload.</p>
          ) : (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Commentary for the brand — wins, context, what's next. This prints into the report and the emailed HTML."
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          )}
        </div>
      )}

      {/* Shareable, open-tracked link — send to a customer and see when they open it. */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Shareable link · {monthName}</span>
            <div className="flex items-center rounded-lg overflow-hidden shadow-sm">
              <button onClick={() => createShare(false)} disabled={sharing} title="Expires in 5 days" className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 pl-3.5 pr-3 py-1.5 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
                {sharing ? "Creating..." : "Create share link"}
              </button>
              <button onClick={() => createShare(true)} disabled={sharing} title="Never expires" className="text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 pl-2.5 pr-3 py-1.5 border-l border-emerald-500/40 transition">
                ∞
              </button>
            </div>
          </div>
          {shareNeedsSetup ? (
            <p className="text-xs text-amber-600">Run <code className="bg-amber-50 px-1 rounded">supabase/add_snapshot_shares.sql</code> in Supabase, then reload.</p>
          ) : shares.length === 0 ? (
            <p className="text-xs text-gray-400">No links yet. Create one to share this snapshot with a customer — you&apos;ll see when they open it.</p>
          ) : (
            <div className="space-y-2">
              {shares.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
                  <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/s/${s.token}`} onFocus={e => e.currentTarget.select()}
                    className="flex-1 min-w-[220px] text-xs text-slate-600 bg-slate-50 border border-gray-200 rounded px-2 py-1.5" />
                  <button onClick={() => copyLink(s.token)} className="text-xs font-medium text-emerald-600 hover:underline">{copied === s.token ? "Copied!" : "Copy"}</button>
                  {s.open_count > 0
                    ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">Opened {s.open_count}× · last {new Date(s.last_opened_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                    : <span className="text-xs text-slate-400 bg-slate-50 rounded-full px-2.5 py-1">Not opened yet</span>}
                  {(() => {
                    const exp = s.expires_at ? Date.parse(s.expires_at) : null;
                    const expired = exp != null && Date.now() > exp;
                    return <span className={`text-xs rounded-full px-2.5 py-1 ${expired ? "text-rose-600 bg-rose-50 font-medium" : "text-slate-400 bg-slate-50"}`}>{exp == null ? "No expiry" : expired ? "Expired" : `Expires ${new Date(exp).toLocaleDateString("en-AU", { dateStyle: "medium" })}`}</span>;
                  })()}
                  <button onClick={() => extendShare(s.id, false)} className="text-xs text-emerald-600 hover:underline">Extend 5 days</button>
                  {s.expires_at && <button onClick={() => extendShare(s.id, true)} className="text-xs text-emerald-600 hover:underline">Make permanent</button>}
                  <button onClick={() => deleteShare(s.id)} className="text-xs text-rose-400 hover:text-rose-600">Delete</button>
                </div>
              ))}
              <button onClick={loadShares} className="text-[11px] text-slate-400 hover:text-slate-600">Refresh open status</button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-2">Anyone with the link can view this report (no login). Each open is tracked. The main button expires in 5 days (use Extend to renew) — the <strong>∞</strong> button creates a link that never expires.</p>
        </div>
      )}

      {/* Rendered in an isolated iframe so the report's own styles match the sample exactly. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <iframe ref={frameRef} title="Performance snapshot" srcDoc={html} onLoad={fitFrame} className="w-full" style={{ height: `${frameH}px`, border: 0 }} />
      </div>
    </div>
  );
}
