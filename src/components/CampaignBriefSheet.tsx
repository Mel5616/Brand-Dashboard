// Visual one-pager campaign brief (Gaia v3 styling). Reusable, presentational:
// the public share page (/c/[token]) renders this, and it prints cleanly to A4.
// Restyles the existing brief object only — no copy is invented here.
import React from "react";

const NAVY = "#1f2a44";
// Pastel tint families: 50-stop fill + 800/900 text stops (never black/grey on a tint).
const TINT = {
  blue: { bg: "#E6F1FB", text: "#0C447C", strong: "#042C53" },
  teal: { bg: "#E1F5EE", text: "#085041", strong: "#04342C" },
  green: { bg: "#EAF3DE", text: "#27500A", strong: "#173404" },
  coral: { bg: "#FAECE7", text: "#712B13", strong: "#4A1B0C" },
  amber: { bg: "#FAEEDA", text: "#633806", strong: "#412402" },
} as const;
const STATUS_TINT: Record<string, keyof typeof TINT> = { Live: "green", Build: "amber", Planned: "blue", Pipeline: "teal", Paused: "blue", Complete: "blue" };
const STATUS_DOT: Record<string, string> = { Live: "#2E7D5B", Build: "#C77D3C", Planned: "#3C6E9E", Pipeline: "#8A7BB0", Paused: "#9A9A9A", Complete: "#64748b" };

const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);
// Any http(s) URL in free text renders as a clickable link (opens in a new tab).
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all hover:opacity-70" style={{ color: "inherit" }}>{part}</a>
      : part
  );
}
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
// 15px / medium section heading (never heavier than 500), sentence case, optional accent icon.
function Heading({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return <h2 className="text-[15px] font-medium text-slate-800 mb-2 flex items-center gap-1.5">{icon}{children}</h2>;
}
const TealDot = <span className="inline-block w-2 h-2 rounded-full" style={{ background: TINT.teal.text }} />;

function ChannelIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const c = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (n.includes("edm") || n.includes("email") || n.includes("mail")) return <svg {...c}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;
  if (n.includes("google")) return <svg {...c}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
  if (n.includes("meta") || n.includes("social")) return <svg {...c}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (n.includes("influencer")) return <svg {...c}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
  if (n.includes("website") || n.includes("d2c") || n.includes("pdp")) return <svg {...c}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></svg>;
  return <svg {...c}><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16" /><path d="M9 20v-6h6v6" /></svg>;
}
const AlertIcon = ({ color }: { color: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;

function Pills({ status, tier, statusDot, statusTint }: { status: string; tier?: string; statusDot: string; statusTint: typeof TINT[keyof typeof TINT] }) {
  return (
    <div className="inline-flex items-center gap-2 bg-white rounded-full shadow-sm ring-1 ring-black/5 px-2.5 py-1 text-[11px]">
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: statusTint.strong }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDot }} />{status}</span>
      {tier && <><span className="w-px h-3 bg-slate-200" /><span className="font-semibold text-slate-500">Tier {tier}</span></>}
    </div>
  );
}
function OwnerPill({ owner, missing }: { owner?: string; missing: boolean }) {
  if (missing) return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: TINT.amber.bg, color: TINT.amber.text }}><AlertIcon color={TINT.amber.text} />Owner: TBC</span>;
  return <span className="inline-flex items-center gap-1.5 text-[11px] bg-white rounded-full shadow-sm ring-1 ring-black/5 px-2.5 py-1 text-slate-500">Owner: <span className="font-semibold text-slate-700">{owner}</span></span>;
}

type Flag = { label?: string; note?: string };

export function CampaignBriefSheet({ c }: { c: any }) {
  const brief = c.brief || {};
  const statusTint = TINT[STATUS_TINT[c.status] || "blue"];
  const statusDot = STATUS_DOT[c.status] || "#3C6E9E";
  const ownerMissing = !c.owner || /tbc/i.test(String(c.owner).trim());
  const start = fmtDate(c.key_date), end = fmtDate(c.end_date);
  const dateRange = start && end ? `${start} – ${end}` : start || end || "";
  const days = dayCount(c.key_date, c.end_date);
  const channels = splitChannels(brief.channels);
  const img: string | undefined = c.image_url || undefined;
  const flags: Flag[] = Array.isArray(brief.complianceFlags) ? brief.complianceFlags.filter((f: Flag) => f && (f.label || f.note)) : [];
  const emails: any[] = Array.isArray(brief.emails) ? brief.emails.filter((e: any) => e && (e.name || e.subject || e.body)) : [];
  const deps = lines(brief.dependencies);

  const readiness: { text: string; done?: boolean }[] = [];
  if (ownerMissing) readiness.push({ text: "Assign an owner (currently TBC)", done: false });
  deps.forEach(d => readiness.push({ text: d, done: false }));
  if (!ownerMissing) readiness.push({ text: `Owner: ${c.owner}`, done: true });
  const readinessWarn = ownerMissing || deps.length > 0;

  const glance = [
    { key: "blue" as const, label: "Window", value: days > 1 ? `${days}-day burst` : (start || "Dates TBC"), sub: days > 1 ? dateRange : "" },
    { key: "teal" as const, label: "Objective", value: oneLine(brief.objective) || "—", sub: "" },
    { key: "green" as const, label: "Measured by", value: oneLine(brief.successMeasure) || "—", sub: "" },
  ];
  const details = [
    { label: "Why now / the story", value: brief.whyNow, tint: "blue" as const },
    { label: "Audience", value: brief.audience, tint: "teal" as const },
    { label: "Key message", value: brief.keyMessage, tint: "coral" as const },
    { label: "Offer mechanic", value: brief.offerMechanic, tint: "green" as const },
    { label: "Creative direction", value: brief.creativeDirection, tint: "amber" as const },
  ].filter(d => lines(d.value).length);
  const complianceLines = lines(brief.compliance);

  return (
    <article id="product-sheet" className="sheet max-w-[860px] mx-auto bg-white rounded-2xl shadow-lg ring-1 ring-slate-200/70 overflow-hidden print:shadow-none print:ring-0 print:rounded-none print:max-w-none print:overflow-visible">
      {/* 1 · Banner hero — full image (scaled to width, never cropped) */}
      <div className="brief-banner relative w-full bg-slate-50 overflow-hidden">
        {img ? <img src={img} alt={c.campaign || ""} className="block w-full h-auto print:max-h-[130px] print:object-contain print:mx-auto" /> : <div className="w-full h-[180px] grid place-items-center text-[11px] uppercase tracking-wide text-slate-300">No image</div>}
        {/* Floating pills (screen only — dropped into the block below for print) */}
        <div className="absolute top-3 left-4 print:hidden"><Pills status={c.status || "Planned"} tier={c.tier} statusDot={statusDot} statusTint={statusTint} /></div>
        <div className="absolute top-3 right-4 print:hidden"><OwnerPill owner={c.owner} missing={ownerMissing} /></div>
      </div>

      {/* Title block */}
      <div className="px-8 pt-5 pb-2">
        {/* Print-only static pills row */}
        <div className="hidden print:flex flex-wrap items-center gap-2 mb-3">
          <Pills status={c.status || "Planned"} tier={c.tier} statusDot={statusDot} statusTint={statusTint} />
          <OwnerPill owner={c.owner} missing={ownerMissing} />
        </div>
        <Eyebrow>{c.brand || "Campaign brief"}{dateRange ? ` · ${dateRange}` : ""}</Eyebrow>
        <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: NAVY }}>{c.campaign || "Untitled campaign"}</h1>
        {brief.oneLiner && <p className="mt-2 text-[15px] text-slate-500 leading-snug">{brief.oneLiner}</p>}
      </div>

      <div className="px-8 py-5 space-y-6">
        {/* 2 · At a glance */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {glance.map(g => {
            const t = TINT[g.key];
            return (
              <div key={g.label} className="rounded-xl px-4 py-3 break-inside-avoid" style={{ background: t.bg }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1" style={{ color: t.text }}>{g.label}</p>
                <p className="text-[15px] font-semibold leading-snug" style={{ color: t.strong }}>{g.value}</p>
                {g.sub && <p className="text-[11px] mt-0.5" style={{ color: t.text }}>{g.sub}</p>}
              </div>
            );
          })}
        </div>

        {/* 3 · Do / Don't */}
        {(lines(brief.do).length > 0 || lines(brief.dont).length > 0) && (
          <div className="grid sm:grid-cols-2 gap-3 break-inside-avoid print:grid-cols-2">
            <div className="rounded-xl px-4 py-3" style={{ background: TINT.green.bg }}>
              <Heading icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TINT.green.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>}><span style={{ color: TINT.green.text }}>Do</span></Heading>
              <ul className="space-y-1.5">{lines(brief.do).map((x, i) => <li key={i} className="flex gap-2 text-[14px] leading-relaxed" style={{ color: TINT.green.strong }}><span style={{ color: TINT.green.text }}>✓</span><span>{linkify(x)}</span></li>)}</ul>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: TINT.coral.bg }}>
              <Heading icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TINT.coral.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>}><span style={{ color: TINT.coral.text }}>Don't</span></Heading>
              <ul className="space-y-1.5">{lines(brief.dont).map((x, i) => <li key={i} className="flex gap-2 text-[14px] leading-relaxed" style={{ color: TINT.coral.strong }}><span style={{ color: TINT.coral.text }}>✕</span><span>{linkify(x)}</span></li>)}</ul>
            </div>
          </div>
        )}

        {/* 4 · Compliance flags */}
        {flags.length > 0 && (
          <div className="rounded-xl px-4 py-3 break-inside-avoid" style={{ background: TINT.amber.bg }}>
            <Heading icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TINT.amber.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}><span style={{ color: TINT.amber.text }}>Compliance flags</span></Heading>
            <ul className="space-y-2">
              {flags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed"><AlertIcon color={TINT.amber.text} /><span style={{ color: TINT.amber.strong }}>{f.label && <span className="font-semibold">{f.label}: </span>}{f.note}</span></li>
              ))}
            </ul>
          </div>
        )}

        {/* 5 · Channels */}
        {channels.length > 0 && (
          <div className="break-inside-avoid">
            <Heading>Channels</Heading>
            <div className="flex flex-wrap gap-2">
              {channels.map(ch => (
                <span key={ch} className="inline-flex items-center gap-1.5 text-[13px] rounded-full px-2.5 py-1" style={{ background: TINT.blue.bg, color: TINT.blue.text }}><ChannelIcon name={ch} />{ch}</span>
              ))}
            </div>
          </div>
        )}

        {/* 5b · Email drafts — the actual copy, so the team and designer see it with the brief.
            brief.showEmails === false hides them (toggle in the campaign editor). */}
        {emails.length > 0 && brief.showEmails !== false && (
          <div className="break-inside-avoid">
            <Heading>Email drafts</Heading>
            <div className="space-y-3">
              {emails.map((e: any, i: number) => (
                <div key={i} className="rounded-xl px-4 py-3 break-inside-avoid" style={{ background: TINT.blue.bg }}>
                  <p className="text-[13px] font-semibold" style={{ color: TINT.blue.strong }}>
                    {e.name || `Email ${i + 1}`}{e.sendDate ? ` · ${e.sendDate}` : ""}
                  </p>
                  {e.segment && <p className="text-[12px] mt-0.5" style={{ color: TINT.blue.text }}>To: {e.segment}</p>}
                  {e.subject && <p className="text-[14px] mt-2" style={{ color: TINT.blue.strong }}><span className="font-semibold">Subject: </span>{String(e.subject).split("\n")[0].trim()}</p>}
                  {e.preview && <p className="text-[13px]" style={{ color: TINT.blue.text }}><span className="font-semibold">Preview: </span>{e.preview}</p>}
                  {e.body && <p className="text-[14px] mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: TINT.blue.strong }}>{e.body}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6 · Deliverables + readiness */}
        {(lines(brief.deliverables).length > 0 || readiness.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-4 break-inside-avoid print:grid-cols-2">
            {lines(brief.deliverables).length > 0 && (
              <div className="rounded-xl px-4 py-3" style={{ background: TINT.blue.bg }}>
                <Heading><span style={{ color: TINT.blue.text }}>Deliverables</span></Heading>
                <ul className="space-y-1.5">
                  {lines(brief.deliverables).map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed" style={{ color: TINT.blue.strong }}>
                      <span className="mt-0.5 inline-block w-4 h-4 rounded border shrink-0 bg-white" style={{ borderColor: TINT.blue.text }} />{linkify(t)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {readiness.length > 0 && (
              <div className="rounded-xl px-4 py-3" style={{ background: readinessWarn ? TINT.amber.bg : TINT.teal.bg }}>
                <Heading icon={readinessWarn ? <AlertIcon color={TINT.amber.text} /> : undefined}><span style={{ color: readinessWarn ? TINT.amber.text : TINT.teal.text }}>Ready to launch</span></Heading>
                <ul className="space-y-1.5">
                  {readiness.map((it, i) => {
                    const t = readinessWarn ? TINT.amber : TINT.teal;
                    return (
                      <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed" style={{ color: t.strong }}>
                        <span className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${it.done ? "text-white" : "bg-white"}`} style={{ borderColor: t.text, background: it.done ? t.text : "#fff" }}>
                          {it.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                        </span>{linkify(it.text)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 6b · Promo pricing table (grouped promotion campaigns). When
            brief.mirrorBrands is set, those brands' offers are the ones we run on
            D2C (highlighted); the rest stay visible as reference only. */}
        {Array.isArray(brief.promoProducts) && brief.promoProducts.length > 0 && (() => {
          const mirror: string[] = Array.isArray(brief.mirrorBrands) ? brief.mirrorBrands : [];
          const isMirror = (p: any) => mirror.length === 0 || mirror.includes(p.brand);
          const active = brief.promoProducts.filter(isMirror);
          const reference = mirror.length ? brief.promoProducts.filter((p: any) => !isMirror(p)) : [];
          const Table = ({ rows, dim }: { rows: any[]; dim?: boolean }) => (
            <div className={`overflow-x-auto rounded-xl border border-slate-100 ${dim ? "opacity-70" : ""}`}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                    <th className="text-left font-semibold px-3 py-2">Product</th>
                    <th className="text-left font-semibold px-3 py-2">Brand</th>
                    <th className="text-right font-semibold px-3 py-2">RRP</th>
                    <th className="text-right font-semibold px-3 py-2">Promo</th>
                    <th className="text-right font-semibold px-3 py-2">Disc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((p: any, i: number) => (
                    <tr key={i} className={dim ? "" : mirror.length ? "bg-emerald-50/40" : ""}>
                      <td className="px-3 py-1.5 text-slate-700 font-medium">{p.product}{p.colours ? <span className="text-slate-400 font-normal"> · {p.colours} colour{p.colours > 1 ? "s" : ""}</span> : null}</td>
                      <td className="px-3 py-1.5 text-slate-500">{p.brand || "—"}</td>
                      <td className="px-3 py-1.5 text-right text-slate-400 line-through tabular-nums">{p.rrp != null ? `$${Number(p.rrp).toLocaleString()}` : "—"}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${dim ? "font-semibold text-slate-500" : "font-bold text-slate-800"}`}>{p.promo != null ? `$${Number(p.promo).toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: dim ? "#9f7f8a" : "#be123c" }}>{p.disc != null ? `${Math.round(Number(p.disc))}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          return (
            <section className="break-inside-avoid space-y-4">
              <div>
                <Heading icon={TealDot}>{mirror.length ? `Mirroring on D2C · ${mirror.join(" + ")}` : "Promo pricing"}</Heading>
                <Table rows={active} />
              </div>
              {reference.length > 0 && (
                <div>
                  <Heading icon={TealDot}>Other offers in this promo · reference only, not mirrored</Heading>
                  <Table rows={reference} dim />
                </div>
              )}
            </section>
          );
        })()}

        {/* 7 · Detail sections */}
        {details.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 pt-1 print:grid-cols-2">
            {details.map(d => (
              <section key={d.label} className="break-inside-avoid rounded-xl px-5 py-4" style={{ background: TINT[d.tint].bg }}>
                <Heading icon={<span className="inline-block w-2 h-2 rounded-full" style={{ background: TINT[d.tint].text }} />}>
                  <span style={{ color: TINT[d.tint].strong }}>{d.label}</span>
                </Heading>
                <div className="space-y-2 text-[14px] leading-relaxed" style={{ color: TINT[d.tint].text }}>{lines(d.value).map((p, i) => <p key={i}>{linkify(p)}</p>)}</div>
              </section>
            ))}
          </div>
        )}

        {/* 8 · Compliance & T&Cs — full-width box, text flows over two columns */}
        {complianceLines.length > 0 && (
          <section className="break-inside-avoid">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-5 py-4 print:bg-white">
              <Heading icon={TealDot}>Compliance &amp; T&amp;Cs</Heading>
              <div className="sm:columns-2 gap-8 text-[13px] text-slate-600 leading-relaxed print:columns-2">
                {complianceLines.map((p, i) => <p key={i} className="mb-2 break-inside-avoid">{linkify(p)}</p>)}
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="px-8 py-3 text-[9px] tracking-[0.04em] text-slate-300" style={{ background: NAVY }}>
        Coolkidz Australia | Campaign Brief{c.brand ? ` | ${c.brand}` : ""}{start ? ` | ${start}` : ""}
      </footer>
    </article>
  );
}
