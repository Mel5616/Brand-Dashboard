// Visual one-pager campaign brief. Reusable, presentational (server-compatible):
// the public share page (/c/[token]) renders this, and it prints cleanly to A4.
// Restyles the existing brief object — no copy is invented here.
import React from "react";

const NAVY = "#1f2a44";
const STATUS_COLOR: Record<string, string> = { Live: "#2E7D5B", Build: "#C77D3C", Planned: "#3C6E9E", Pipeline: "#8A7BB0", Paused: "#9A9A9A", Complete: "#64748b" };
const TIER_COLOR: Record<string, string> = { A: "#3C6E9E", B: "#C77D3C", C: "#64748b" };

const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);
const oneLine = (s?: string | null) => lines(s)[0] || "";
const splitChannels = (s?: string | null) => (s || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const fmtDate = (s?: string | null) => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
function dayCount(a?: string | null, b?: string | null) {
  if (!a || !b || !/^\d{4}-\d{2}-\d{2}/.test(a) || !/^\d{4}-\d{2}-\d{2}/.test(b)) return 0;
  const d1 = new Date(a.slice(0, 10) + "T00:00:00"), d2 = new Date(b.slice(0, 10) + "T00:00:00");
  return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">{children}</p>;
}

// Small leading icon for a channel chip, matched loosely on the channel name.
function ChannelIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const c = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (n.includes("edm") || n.includes("email") || n.includes("mail")) return <svg {...c}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;
  if (n.includes("google")) return <svg {...c}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
  if (n.includes("meta") || n.includes("social")) return <svg {...c}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (n.includes("influencer")) return <svg {...c}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
  if (n.includes("website") || n.includes("d2c") || n.includes("pdp")) return <svg {...c}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></svg>;
  // retail / baby bunting / marketplace / other → storefront
  return <svg {...c}><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16" /><path d="M9 20v-6h6v6" /></svg>;
}

function Checklist({ items, tone = "plain" }: { items: { text: string; done?: boolean }[]; tone?: "plain" | "warn" }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
          <span className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${it.done ? "bg-emerald-500 border-emerald-500 text-white" : tone === "warn" ? "border-amber-300 bg-white" : "border-slate-300 bg-white"}`}>
            {it.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
          </span>
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

type Flag = { label?: string; note?: string };

export function CampaignBriefSheet({ c }: { c: any }) {
  const brief = c.brief || {};
  const statusColor = STATUS_COLOR[c.status] || "#3C6E9E";
  const tierColor = TIER_COLOR[c.tier] || "#64748b";
  const ownerMissing = !c.owner || /tbc/i.test(String(c.owner).trim());
  const start = fmtDate(c.key_date), end = fmtDate(c.end_date);
  const dateRange = start && end ? `${start} – ${end}` : start || end || "";
  const days = dayCount(c.key_date, c.end_date);
  const channels = splitChannels(brief.channels);
  const img: string | undefined = c.image_url || undefined;
  const flags: Flag[] = Array.isArray(brief.complianceFlags) ? brief.complianceFlags.filter((f: Flag) => f && (f.label || f.note)) : [];
  const deps = lines(brief.dependencies);

  // Ready-to-launch checklist: unmet items first (owner-if-TBC, then dependencies), then met owner.
  const readiness: { text: string; done?: boolean }[] = [];
  if (ownerMissing) readiness.push({ text: "Assign an owner (currently TBC)", done: false });
  deps.forEach(d => readiness.push({ text: d, done: false }));
  if (!ownerMissing) readiness.push({ text: `Owner: ${c.owner}`, done: true });
  const readinessWarn = ownerMissing || deps.length > 0;

  const details = [
    { label: "Audience", value: brief.audience },
    { label: "Key message", value: brief.keyMessage },
    { label: "Offer / mechanic", value: brief.offerMechanic },
    { label: "Creative direction", value: brief.creativeDirection },
  ].filter(d => lines(d.value).length);

  return (
    <article id="product-sheet" className="sheet max-w-[860px] mx-auto bg-white rounded-xl shadow-lg ring-1 ring-slate-200/70 overflow-hidden print:shadow-none print:ring-0 print:rounded-none print:max-w-none print:overflow-visible">
      {/* Brand header band */}
      <header className="px-8 pt-6 pb-3 flex items-center justify-between gap-4 border-b border-slate-100">
        <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-6 w-auto object-contain" />
        <span className="text-[10px] tracking-[0.16em] uppercase text-slate-400">Campaign Brief</span>
      </header>

      <div className="px-8 py-6 space-y-6">
        {/* 1 · Status strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
          <span className="inline-block text-white text-[10px] font-bold uppercase tracking-[0.07em] px-2.5 py-1 rounded-full" style={{ background: statusColor }}>{c.status || "Planned"}</span>
          {c.tier && <span className="inline-block text-white text-[10px] font-bold uppercase tracking-[0.07em] px-2.5 py-1 rounded-full" style={{ background: tierColor }}>Tier {c.tier}</span>}
          {c.brand && <span className="text-slate-500">{c.brand}</span>}
          {dateRange && <span className="text-slate-400">· {dateRange}</span>}
          <span className="ml-auto">
            {ownerMissing
              ? <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>Owner: TBC</span>
              : <span className="text-[12px] text-slate-500">Owner: <span className="font-semibold text-slate-700">{c.owner}</span></span>}
          </span>
        </div>

        {/* 2 · Hero */}
        <div className="flex items-start justify-between gap-6 break-inside-avoid">
          <div className="min-w-0">
            <Eyebrow>Campaign brief</Eyebrow>
            <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: NAVY }}>{c.campaign || "Untitled campaign"}</h1>
            {brief.oneLiner && <p className="mt-2 text-[15px] text-slate-500 leading-snug">{brief.oneLiner}</p>}
          </div>
          <div className="w-[150px] shrink-0">
            <div className="w-[150px] h-[150px] rounded-xl bg-slate-50 border border-slate-100 overflow-hidden grid place-items-center">
              {img ? <img src={img} alt={c.campaign || ""} className="w-full h-full object-cover" /> : <span className="text-[10px] uppercase tracking-wide text-slate-300">No image</span>}
            </div>
          </div>
        </div>

        {/* 3 · At a glance */}
        <div className="grid gap-3 break-inside-avoid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <Eyebrow>Window</Eyebrow>
            <p className="text-[18px] font-bold text-slate-800 leading-tight">{days > 1 ? `${days}-day burst` : (start || "Dates TBC")}</p>
            {dateRange && days > 1 && <p className="text-[11px] text-slate-400 mt-0.5">{dateRange}</p>}
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <Eyebrow>Objective</Eyebrow>
            <p className="text-[13px] text-slate-700 leading-snug">{oneLine(brief.objective) || "—"}</p>
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <Eyebrow>Measured by</Eyebrow>
            <p className="text-[13px] text-slate-700 leading-snug">{oneLine(brief.successMeasure) || "—"}</p>
          </div>
        </div>

        {/* 4 · Do / Don't */}
        {(lines(brief.do).length > 0 || lines(brief.dont).length > 0) && (
          <div className="grid sm:grid-cols-2 gap-3 break-inside-avoid print:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>Do</p>
              <ul className="space-y-1.5">{lines(brief.do).map((x, i) => <li key={i} className="flex gap-2 text-[13px] text-emerald-900"><span className="text-emerald-500 font-bold">✓</span><span>{x}</span></li>)}</ul>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-600 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>Don't</p>
              <ul className="space-y-1.5">{lines(brief.dont).map((x, i) => <li key={i} className="flex gap-2 text-[13px] text-red-900"><span className="text-red-400 font-bold">✕</span><span>{x}</span></li>)}</ul>
            </div>
          </div>
        )}

        {/* 5 · Compliance flags (only if any) */}
        {flags.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 break-inside-avoid">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>Compliance — check before send</p>
            <ul className="space-y-2">
              {flags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span className="text-amber-900">{f.label && <span className="font-semibold">{f.label}: </span>}{f.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 6 · Channels */}
        {channels.length > 0 && (
          <div className="break-inside-avoid">
            <Eyebrow>Channels</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {channels.map(ch => (
                <span key={ch} className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1"><span className="text-slate-400"><ChannelIcon name={ch} /></span>{ch}</span>
              ))}
            </div>
          </div>
        )}

        {/* 7 · Deliverables + readiness */}
        {(lines(brief.deliverables).length > 0 || readiness.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-4 break-inside-avoid print:grid-cols-2">
            {lines(brief.deliverables).length > 0 && (
              <div>
                <Eyebrow>Deliverables</Eyebrow>
                <Checklist items={lines(brief.deliverables).map(t => ({ text: t, done: false }))} />
              </div>
            )}
            {readiness.length > 0 && (
              <div className={`rounded-xl px-4 py-3 ${readinessWarn ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}>
                <p className={`text-[11px] font-bold uppercase tracking-[0.12em] mb-2 ${readinessWarn ? "text-amber-700" : "text-slate-400"}`}>Ready to launch</p>
                <Checklist items={readiness} tone={readinessWarn ? "warn" : "plain"} />
              </div>
            )}
          </div>
        )}

        {/* 8 · Detail sections */}
        {details.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 pt-1 print:grid-cols-2">
            {details.map(d => (
              <section key={d.label} className="break-inside-avoid">
                <Eyebrow>{d.label}</Eyebrow>
                <div className="space-y-2 text-[13px] text-slate-700 leading-relaxed">{lines(d.value).map((p, i) => <p key={i}>{p}</p>)}</div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Footer band */}
      <footer className="px-8 py-3 text-[9px] tracking-[0.04em] text-slate-300" style={{ background: NAVY }}>
        Coolkidz Australia | Campaign Brief{c.brand ? ` | ${c.brand}` : ""}{start ? ` | ${start}` : ""}
      </footer>
    </article>
  );
}
