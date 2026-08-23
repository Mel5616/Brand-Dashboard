import { ENTITY } from "./agreementTemplate";

// Self-contained HTML for the Activations report — the "spine": a single
// timeline axis carrying phases, trade-date markers (expos + retail moments)
// and campaign bars, plus a live budget burn chart, pillar allocation model,
// campaign cards and open decisions/asks. Modelled directly on Mel's own
// prototype (frida-q4-activation-plan.html) — this leaves the building, so
// it's held to that bar rather than the plainer internal-only reports.

type Competitor = { name: string; notes: string | null; source_links?: string[]; image_url?: string | null };
type ShowRow = { name: string; date_start: string; date_end: string; state: string; location: string; status: "upcoming" | "live" | "past" };
type Phase = { key: string; label: string; sub: string | null; start_date: string; end_date: string; color: string };
type Pillar = { key: string; label: string; color: string; share_pct: number; note: string | null };
type TradeDate = { date: string; end_date: string | null; label: string; kind: "trade" | "peak"; confirmed: boolean };
type SpineCampaign = { id: string; campaign: string; channel: string | null; status: string | null; key_date: string; end_date: string | null; pillar: string | null; confirmed: boolean; note?: string | null; image_url?: string | null };
type BudgetMonth = { month_key: string; planned: number; actual: number };
type Decision = { due_label: string | null; question: string; recommendation: string | null };
type Ask = { audience: string; ask: string; why: string | null };
type Creative = { ad_group: string | null; campaign_name: string | null; headlines: string[]; descriptions: string[]; clicks: number; final_url?: string | null };
type AdImage = { campaign_name: string | null; asset_group: string | null; image_url: string };
type MetaCreative = { campaign_name: string | null; ad_name: string | null; title: string | null; body: string | null; clicks: number };
type MetaAdImage = { campaign_name: string | null; ad_name: string | null; image_url: string };

export type ActivationReportInput = {
  brand_name: string;
  brand_color?: string | null;
  brand_init?: string | null;
  generated_at: string;
  window: { start: string; end: string };
  competitors: Competitor[];
  tradeshows: ShowRow[];
  phases: Phase[];
  pillars: Pillar[];
  tradeDates: TradeDate[];
  campaigns: SpineCampaign[];
  budget: { months: BudgetMonth[]; total: number } | null;
  decisions: Decision[];
  asks: Ask[];
  adCreatives: Creative[];
  adImages: AdImage[];
  metaCreatives: MetaCreative[];
  metaImages: MetaAdImage[];
  sectionNotes?: Record<string, string>;
};

// Brand logo by normalized name (files live in /public/logos — same map used
// by the Brief print route). Add brands here as their logo file is confirmed.
const BRAND_LOGO: Record<string, string> = {
  nanit: "/logos/Nanit_Logo Lockup_Midnight Mist.svg",
  frida: "/logos/Frida_logo_main.png",
  gaiababy: "/logos/GaiaBaby-Logo-Portrait-Colour.jpg",
  magic: "/logos/MCC_logo_MAGIC_black_c.png",
  matchstickmonkey: "/logos/Matchstick Monkey Logo.jpg",
  miamily: "/logos/MiaMily_logo+flag_1.png",
  zazu: "/logos/ZAZU logo_HR.jpg",
  uppababy: "/logos/UPPAbaby Logo.jpg",
  smartrike: "/logos/Smartrike Logo.png",
  hannie: "/logos/hannie.jpg",
  coolkidz: "/logos/Coolkidz Logo.png",
};

// Per-brand accent palette — Frida's own sub-brand colours (NoseFrida,
// Windi, DermaFrida, Bath, FeverFrida, SmileFrida, MediFrida), so the report
// reads as genuinely Frida-branded rather than a generic muted system. Falls
// back to the muted editorial set for brands without one supplied yet.
const BRAND_PALETTE: Record<string, { accent: string; swatches: string[] }> = {
  frida: { accent: "#EA4C7C", swatches: ["#3FB8DD", "#EA4C7C", "#F5A868", "#BFDCCF", "#E9846E", "#F7D400", "#E39FB2"] },
};
const DEFAULT_PALETTE = { accent: "#4C6278", swatches: ["#4C6278", "#93767A", "#9C4F4C", "#3E453E", "#B7A99C"] };

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (s: string | null | undefined) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateShort = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const money = (n: number | null) => n == null ? "TBC" : "$" + Math.round(n).toLocaleString("en-AU");
const notesToList = (notes: string | null) => (notes ?? "").split("\n").map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean);
const monthLabel = (mk: string) => new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short" });
const DAY = 86400000;

export function buildActivationReport(a: ActivationReportInput): string {
  // A fixed report palette per brand (not the brand's generic dashboard
  // accent) — this report has its own designed look. Frida gets its real
  // sub-brand colours; everything else falls back to a muted editorial set.
  const brandKey = a.brand_name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const palette = BRAND_PALETTE[brandKey] ?? DEFAULT_PALETTE;
  const accent = palette.accent;
  const swatch = (i: number) => palette.swatches[i % palette.swatches.length];
  const monogram = (a.brand_init || a.brand_name.slice(0, 2)).toUpperCase();
  const logoPath = BRAND_LOGO[brandKey];
  const W0 = new Date(a.window.start + "T00:00:00").getTime();
  const W1 = new Date(a.window.end + "T00:00:00").getTime();
  const span = Math.max(1, (W1 - W0) / DAY);
  const pos = (d: string) => Math.min(100, Math.max(0, ((new Date(d + "T00:00:00").getTime() - W0) / DAY / span) * 100));

  // ---- Competitors ----
  const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const competitorCards = a.competitors.length ? a.competitors.map((c, i) => `
    <div class="card comp-card">
      <div class="comp-bar" style="background:${swatch(i)}"></div>
      ${c.image_url ? `<img class="comp-img" src="${esc(c.image_url)}" alt="${esc(c.name)}">` : ""}
      <div class="comp-body">
        <h3>${esc(c.name)}</h3>
        <ul>${notesToList(c.notes).map(l => `<li>${esc(l)}</li>`).join("") || `<li class="muted">No notes yet.</li>`}</ul>
        ${c.source_links?.length ? `<p class="sources">${c.source_links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">↗ ${esc(domainOf(u))}</a>`).join(" &nbsp;·&nbsp; ")}</p>` : ""}
      </div>
    </div>`).join("") : `<p class="muted">No competitors tracked yet.</p>`;

  // ---- Phase axis ----
  const axisHtml = a.phases.length ? `<div class="axis">${a.phases.map(p => {
    const w = pos(p.end_date) - pos(p.start_date);
    return `<div class="phase" style="width:${w}%;background:${p.color}">${esc(p.label)}${p.sub ? `<small>${esc(p.sub)}</small>` : ""}</div>`;
  }).join("")}</div>` : "";

  // ---- Month ruler ----
  const rulerMonths: string[] = [];
  { const d = new Date(a.window.start + "T00:00:00"); d.setDate(1); const end = new Date(a.window.end + "T00:00:00");
    while (d <= end) { rulerMonths.push(d.toISOString().slice(0, 10)); d.setMonth(d.getMonth() + 1); } }
  const rulerHtml = `<div class="ruler">${rulerMonths.map((d, i) => {
    const next = rulerMonths[i + 1] ? pos(rulerMonths[i + 1]) : 100;
    return `<div class="m" style="width:${next - pos(d)}%">${new Date(d + "T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "numeric" })}</div>`;
  }).join("")}</div>`;

  // ---- Marker lanes (shows + trade dates), auto-staggered ----
  const GAP = 16;
  const ROW_H = 62;
  function renderLane(items: { x: number; label: string; date: string; end?: string | null; confirmed: boolean; kind: string }[], tag: string) {
    const rows: number[][] = [];
    const placed = items.slice().sort((x, y) => x.x - y.x).map(t => {
      let r = rows.findIndex(row => row.every(px => Math.abs(px - t.x) > GAP));
      if (r === -1) { rows.push([t.x]); r = rows.length - 1; } else rows[r].push(t.x);
      return { ...t, r };
    });
    const depth = Math.max(rows.length, 1);
    const markers = placed.map(t => `
      <div class="marker" style="left:${t.x}%" data-kind="${t.kind}">
        <span class="lbl">${esc(t.label)}${t.confirmed ? "" : ` <span class="tbc">TBC</span>`}<span class="dte">${fmtDateShort(t.date)}${t.end ? ` – ${fmtDateShort(t.end)}` : ""}</span></span>
        <span class="stem" style="height:${16 + t.r * ROW_H}px"></span>
        <span class="pip"></span>
      </div>`).join("");
    return `<div class="lane" style="height:${78 + (depth - 1) * ROW_H}px"><span class="lane-tag">${tag}</span>${markers}</div>`;
  }
  const showItems = a.tradeshows.map(s => ({ x: pos(s.date_start), label: s.name, date: s.date_start, end: s.date_end, confirmed: true, kind: "show" }));
  const tradeItems = a.tradeDates.map(t => ({ x: pos(t.date), label: t.label, date: t.date, end: t.end_date, confirmed: t.confirmed, kind: t.kind }));
  const babyExposNote = a.sectionNotes?.baby_expos
    ? `<div class="lane-note">${a.sectionNotes.baby_expos.split("\n\n").map(p => `<p>${esc(p)}</p>`).join("")}</div>` : "";
  const markersHtml = (showItems.length ? renderLane(showItems, "Baby expos") + babyExposNote : "") + (tradeItems.length ? renderLane(tradeItems, "Retail moments") : "");

  // ---- Campaign bars, packed into non-overlapping tracks ----
  // Compute the RENDERED width (with its min-width floor) up front, and pack
  // using that — packing on the raw date span let same-day-ish campaigns
  // land in the same track and then visually collide once the min-width
  // floor was applied on render.
  const MIN_BAR = 13;
  const barItems = a.campaigns.map(c => {
    const s = pos(c.key_date);
    const e = Math.min(100, Math.max(pos(c.end_date || c.key_date), s + MIN_BAR));
    return { ...c, s, e };
  });
  const tracks: (typeof barItems)[] = [];
  for (const b of barItems) {
    let row = tracks.find(r => r.every(x => b.e < x.s - 1 || b.s > x.e + 1));
    if (!row) { row = []; tracks.push(row); }
    row.push(b);
  }
  const pillarColor = (key: string | null) => a.pillars.find(p => p.key === key)?.color ?? "#64748b";
  const tracksHtml = tracks.map(row => `<div class="track">${row.map(b => `
    <div class="bar${b.confirmed ? "" : " unconfirmed"}" style="left:${b.s}%;width:${b.e - b.s}%;background:${pillarColor(b.pillar)}" title="${esc(b.campaign)}">
      ${esc(b.campaign)}<span class="wk">${fmtDateShort(b.key_date)}</span>
    </div>`).join("")}</div>`).join("");

  const legendHtml = a.pillars.filter(p => p.key !== "reserve").map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)}</span>`).join("")
    + (showItems.length ? `<span><i style="background:${accent};border-radius:2px"></i>Baby expo</span>` : "")
    + `<span><i style="background:repeating-linear-gradient(45deg,#94a3b8 0 4px,#fff 4px 8px)"></i>Not yet confirmed</span>`;

  // No horizontal scroll — the spine always fits the panel's width. Crowding
  // is resolved with height instead: the marker lanes stagger into as many
  // rows as they need (see renderLane), so dense weeks get taller, not wider.
  const spineHtml = (a.phases.length || a.campaigns.length) ? `
    <div class="spine">
      <div class="spine-inner">
        ${markersHtml ? `<div class="markers">${markersHtml}</div>` : ""}
        ${axisHtml}
        ${rulerHtml}
        <div class="tracks">${tracksHtml}</div>
        <div class="legend">${legendHtml}</div>
      </div>
    </div>` : `<p class="muted">Add phases and campaigns to build the spine.</p>`;

  // ---- Budget burn ----
  const budgetHtml = a.budget && a.budget.months.length ? (() => {
    const max = Math.max(...a.budget!.months.map(m => m.planned), 1);
    const cols = a.budget!.months.map(m => {
      const h = Math.max(4, (m.planned / max) * 100);
      const segs = a.pillars.filter(p => p.key !== "reserve" || a.pillars.length <= 1).map(p => `<div class="burn-seg" style="height:${p.share_pct}%;background:${p.color}"></div>`).join("");
      return `<div class="burn-col"><div class="burn-val">${money(m.planned)}</div><div class="burn-stack" style="height:${h}%">${segs}</div></div>`;
    }).join("");
    const labels = a.budget!.months.map(m => `<div><div class="m">${monthLabel(m.month_key)}</div><div class="p">${money(m.actual)} spent</div></div>`).join("");
    return `<div class="burn-grid">${cols}</div><div class="burn-labels">${labels}</div>`;
  })() : `<p class="muted">${a.budget ? "No budget set for this window yet." : "Budget figures are admin-only."}</p>`;

  const allocHtml = a.pillars.length ? a.pillars.map(p => `
    <div class="alloc-row">
      <span class="sw" style="background:${p.color}"></span>
      <span class="nm"><b>${esc(p.label)}</b><span>${esc(p.note || "")}</span></span>
      <span class="pc">${p.share_pct}%</span>
      <span class="amt">${a.budget ? money(a.budget.total * p.share_pct / 100) : "TBC"}</span>
    </div>`).join("") : `<p class="muted">No pillar allocation set yet.</p>`;

  // ---- Campaign cards ----
  const cardsHtml = a.campaigns.length ? `<div class="grid cards3">${a.campaigns.map(c => {
    const p = a.pillars.find(x => x.key === c.pillar);
    return `<div class="card">
      ${c.image_url ? `<img class="card-img" src="${esc(c.image_url)}" alt="${esc(c.campaign)}" onerror="this.remove()">` : `<div class="card-strip" style="background:${p?.color ?? "#94a3b8"}"></div>`}
      <div class="card-body">
        <div class="meta">
          ${p ? `<span class="pill" style="color:${p.color};border-color:${p.color}">${esc(p.label)}</span>` : ""}
          ${c.confirmed ? "" : `<span class="tbc">TBC</span>`}
        </div>
        <h3>${esc(c.campaign)}</h3>
        <p class="show-meta">${fmtDate(c.key_date)}${c.end_date ? ` – ${fmtDate(c.end_date)}` : ""}</p>
        ${c.note ? `<p class="obj">${esc(c.note)}</p>` : ""}
        <div class="card-foot"><span class="status">${esc(c.status || "—")}</span><span class="muted">${esc(c.channel || "—")}</span></div>
      </div>
    </div>`;
  }).join("")}</div>` : `<p class="muted">Nothing planned in this window yet.</p>`;

  // ---- Decisions / asks ----
  const decisionsHtml = a.decisions.length ? a.decisions.map(d => `
    <div class="list-row">
      <span class="when">${esc(d.due_label || "TBC")}</span>
      <span class="what"><b>${esc(d.question)}</b>${d.recommendation ? `<span class="rec"><b>Recommendation</b>${esc(d.recommendation)}</span>` : ""}</span>
    </div>`).join("") : `<p class="muted">No open decisions.</p>`;
  const asksHtml = a.asks.length ? a.asks.map(x => `
    <div class="list-row">
      <span class="when">${esc(x.audience)}</span>
      <span class="what"><b>${esc(x.ask)}</b>${x.why ? `<span>${esc(x.why)}</span>` : ""}</span>
    </div>`).join("") : `<p class="muted">Nothing outstanding.</p>`;

  const domainOfUrl = (u?: string | null) => { if (!u) return "example.com"; try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const cleanGoogleCreatives = a.adCreatives.filter(c => !/\[test\]/i.test(c.campaign_name || "")).slice(0, 5);
  const adBlocks = cleanGoogleCreatives.length ? cleanGoogleCreatives.map(c => {
    const domain = domainOfUrl(c.final_url);
    const previewHeadline = c.headlines.slice(0, 3).join(" | ");
    const previewDesc = c.descriptions.slice(0, 2).join(" ");
    return `
    <div class="card">
      <div class="card-body">
        <h3>${esc(c.campaign_name || "—")}${c.ad_group ? ` <span class="muted">· ${esc(c.ad_group)}</span>` : ""}</h3>
        <div class="serp-preview">
          <p class="serp-url"><span class="serp-ad-badge">Ad</span> ${esc(domain)}</p>
          <p class="serp-headline">${esc(previewHeadline)}</p>
          <p class="serp-desc">${esc(previewDesc)}</p>
        </div>
        <p class="label">All headlines</p>
        <ul>${c.headlines.slice(0, 5).map(h => `<li>${esc(h)}</li>`).join("")}</ul>
        <p class="label">All descriptions</p>
        <ul>${c.descriptions.slice(0, 4).map(d => `<li>${esc(d)}</li>`).join("")}</ul>
      </div>
    </div>`;
  }).join("") : `<p class="muted">No live ad copy synced yet.</p>`;

  const imageGallery = a.adImages.length ? `<div class="img-grid">${a.adImages.map(img => `
    <figure class="ad-img">
      <img src="${esc(img.image_url)}" alt="${esc(img.campaign_name || "Ad creative")}" loading="lazy" onerror="this.closest('figure').style.display='none'">
      <figcaption>${esc(img.campaign_name || "—")}${img.asset_group ? ` <span class="muted">· ${esc(img.asset_group)}</span>` : ""}</figcaption>
    </figure>`).join("")}</div>` : `<p class="muted">No live creative images synced yet (Performance Max campaigns only).</p>`;

  const cleanMetaCreatives = a.metaCreatives.filter(c => !/\[test\]/i.test(c.campaign_name || "")).slice(0, 5);
  const metaBlocks = cleanMetaCreatives.length ? cleanMetaCreatives.map(c => `
    <div class="card">
      <div class="card-body">
        <h3>${esc(c.campaign_name || "—")}${c.ad_name ? ` <span class="muted">· ${esc(c.ad_name)}</span>` : ""}</h3>
        ${c.title ? `<p class="label">Headline</p><p class="show-meta">${esc(c.title)}</p>` : ""}
        ${c.body ? `<p class="label">Primary text</p><p class="show-meta">${esc(c.body)}</p>` : ""}
      </div>
    </div>`).join("") : `<p class="muted">No live ad copy synced yet.</p>`;

  const metaGallery = a.metaImages.length ? `<div class="img-grid">${a.metaImages.map(img => `
    <figure class="ad-img">
      <img src="${esc(img.image_url)}" alt="${esc(img.campaign_name || "Ad creative")}" loading="lazy" onerror="this.closest('figure').style.display='none'">
      <figcaption>${esc(img.campaign_name || "—")}${img.ad_name ? ` <span class="muted">· ${esc(img.ad_name)}</span>` : ""}</figcaption>
    </figure>`).join("")}</div>` : `<p class="muted">No live creative images synced yet.</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activations · ${esc(a.brand_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #12161d; max-width: 980px; margin: 0 auto; padding: 0 32px 48px; background: #FBF7F2; }
  .head { display: flex; align-items: center; gap: 16px; padding: 36px 0 20px; }
  .mono { width: 52px; height: 52px; border-radius: 14px; background: ${accent}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; flex-shrink: 0; }
  .brand-logo { max-height: 52px; max-width: 180px; width: auto; height: auto; object-fit: contain; flex-shrink: 0; }
  .head h1 { font-size: 25px; margin: 0 0 3px; color: #0f172a; }
  .head .sub { font-size: 12.5px; color: #64748b; }
  .head .gen { margin-left: auto; text-align: right; font-size: 11.5px; color: #94a3b8; }
  .accent-bar { display: flex; gap: 3px; height: 5px; margin-bottom: 24px; }
  .accent-bar span { flex: 1; border-radius: 3px; }
  h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #0f172a; font-weight: 800; margin: 34px 0 14px; display: flex; align-items: center; gap: 8px; }
  h2::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: ${accent}; display: inline-block; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid.cards3 { grid-template-columns: repeat(3, 1fr); }
  .img-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .ad-img { margin: 0; background: #fff; border: 1px solid #e2e6ea; border-radius: 10px; overflow: hidden; }
  .ad-img img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #f1f5f9; }
  .ad-img figcaption { font-size: 10.5px; color: #64748b; padding: 6px 8px; }
  .card { position: relative; background: #fff; border: 1px solid #e2e6ea; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,0.03); }
  .comp-card { padding: 0; }
  .comp-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${accent}; z-index: 1; }
  .comp-img { width: 100%; height: 200px; object-fit: cover; display: block; background: #f1f5f9; }
  .comp-body { padding: 16px 18px 16px 20px; }
  .sources { font-size: 10.5px; margin: 10px 0 0; padding-top: 8px; border-top: 1px solid #f1f5f9; }
  .sources a { color: #4C6278; text-decoration: none; }
  .sources a:hover { text-decoration: underline; }
  .card h3 { font-size: 14px; margin: 0 0 8px; color: #0f172a; }
  .card ul { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.65; color: #475569; }
  .card .label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 10px 0 4px; }
  .serp-preview { font-family: Arial, sans-serif; background: #fff; border: 1px solid #e2e6ea; border-radius: 8px; padding: 10px 12px; margin-top: 4px; }
  .serp-url { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #202124; margin: 0 0 2px; }
  .serp-ad-badge { font-size: 10px; font-weight: 700; color: #fff; background: #4C6278; border-radius: 3px; padding: 0 4px; line-height: 15px; }
  .serp-headline { font-size: 16px; color: #1a0dab; margin: 2px 0 3px; line-height: 1.3; }
  .serp-desc { font-size: 12.5px; color: #4d5156; line-height: 1.4; margin: 0; }
  .card-body { padding: 14px 16px; }
  .card-strip { height: 4px; }
  .card-img { width: 100%; height: 130px; object-fit: cover; display: block; background: #f1f5f9; }
  .card .meta { display: flex; gap: 6px; margin-bottom: 6px; }
  .card .obj { font-size: 12px; color: #64748b; margin: 4px 0 0; white-space: pre-line; }
  .card-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 11px; }
  .pill { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; border: 1px solid #e2e6ea; }
  .muted { color: #94a3b8; font-size: 12.5px; }

  .panel { background: #fff; border: 1px solid #e2e6ea; border-radius: 12px; padding: 26px 26px 22px; }
  .spine { padding-bottom: 2px; }
  .spine-inner { width: 100%; }
  .markers { display: flex; flex-direction: column; gap: 28px; padding-bottom: 16px; }
  .lane { position: relative; border-bottom: 1px dashed #e2e6ea; padding-bottom: 16px; }
  .lane-note { background: ${accent}0d; border-left: 3px solid ${accent}; border-radius: 0 8px 8px 0; padding: 12px 16px; margin: -4px 0 18px; }
  .lane-note p { font-size: 12.5px; line-height: 1.6; color: #334155; margin: 0 0 8px; }
  .lane-note p:last-child { margin-bottom: 0; }
  .lane-tag { position: absolute; left: 0; top: 0; font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; }
  .marker { position: absolute; bottom: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; width: 132px; }
  .marker .lbl { font-size: 10.5px; font-weight: 600; line-height: 1.3; text-align: center; color: #0f172a; padding-bottom: 5px; }
  .marker .dte { font-size: 9.5px; color: #94a3b8; display: block; font-weight: 500; margin-top: 1px; }
  .marker .stem { width: 1px; background: #94a3b8; opacity: .4; }
  .marker .pip { width: 8px; height: 8px; border-radius: 50%; background: ${accent}; }
  .marker[data-kind="show"] .pip { border-radius: 2px; background: ${accent}; }
  .marker[data-kind="peak"] .pip { background: ${swatch(1)}; }
  .marker[data-kind="peak"] .lbl { color: ${swatch(1)}; }
  .tbc { display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; padding: 1px 5px; border-radius: 3px; background: #F3E3D8; color: #8A5040; border: 1px solid #E8CDBB; }
  .axis { position: relative; display: flex; height: 34px; border-radius: 6px; overflow: hidden; border: 1px solid #e2e6ea; margin-top: 10px; }
  .phase { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 800; color: #fff; }
  .phase small { font-weight: 500; font-size: 9.5px; opacity: .85; }
  .ruler { display: flex; border-bottom: 1px solid #e2e6ea; margin-top: 10px; }
  .ruler .m { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; padding: 4px 0 8px 6px; border-left: 1px solid #e2e6ea; }
  .ruler .m:first-child { border-left: 0; padding-left: 0; }
  .tracks { position: relative; padding-top: 16px; }
  .track { position: relative; height: 28px; margin-bottom: 5px; background: #f8fafc; border-radius: 5px; }
  .bar { position: absolute; top: 2px; height: 24px; border-radius: 5px; display: flex; align-items: center; padding: 0 9px; gap: 6px; font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar .wk { font-size: 9.5px; opacity: .8; font-weight: 500; }
  .bar.unconfirmed { background-image: repeating-linear-gradient(45deg,rgba(255,255,255,.25) 0 6px,transparent 6px 12px); }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e6ea; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #64748b; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

  .show-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .show-card { display: flex; gap: 12px; background: #fff; border: 1px solid #e2e6ea; border-radius: 12px; padding: 12px 14px; }
  .show-date { flex-shrink: 0; width: 44px; height: 44px; border-radius: 10px; background: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .show-date .d { font-size: 16px; font-weight: 800; color: #0f172a; }
  .show-date .m { font-size: 9px; font-weight: 700; color: #64748b; }
  .show-name { font-size: 13px; font-weight: 700; color: #0f172a; }
  .show-meta { font-size: 11px; color: #64748b; margin: 2px 0 0; }
  .status { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; }

  .two-col { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; }
  .burn-grid { display: flex; align-items: flex-end; gap: 12px; height: 150px; border-bottom: 1px solid #e2e6ea; }
  .burn-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; gap: 2px; }
  .burn-stack { display: flex; flex-direction: column-reverse; border-radius: 5px 5px 0 0; overflow: hidden; }
  .burn-seg { min-height: 2px; }
  .burn-val { font-size: 11px; font-weight: 600; text-align: center; padding-bottom: 4px; }
  .burn-labels { display: flex; gap: 12px; padding-top: 8px; }
  .burn-labels div { flex: 1; text-align: center; }
  .burn-labels .m { font-size: 12.5px; font-weight: 800; }
  .burn-labels .p { font-size: 9.5px; color: #94a3b8; }
  .alloc-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #f1f5f9; }
  .alloc-row:last-child { border-bottom: 0; }
  .alloc-row .sw { width: 10px; height: 22px; border-radius: 3px; flex: none; }
  .alloc-row .nm { flex: 1; min-width: 0; }
  .alloc-row .nm b { display: block; font-size: 12.5px; font-weight: 600; }
  .alloc-row .nm span { font-size: 10.5px; color: #94a3b8; }
  .alloc-row .pc { font-size: 11px; color: #64748b; width: 34px; text-align: right; }
  .alloc-row .amt { font-size: 13px; font-weight: 600; width: 84px; text-align: right; }

  .list-row { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; align-items: flex-start; }
  .list-row:last-child { border-bottom: 0; }
  .list-row .when { font-size: 11px; font-weight: 600; width: 100px; flex: none; }
  .list-row .what b { font-size: 13px; font-weight: 600; display: block; }
  .list-row .what span { font-size: 11.5px; color: #64748b; display: block; margin-top: 2px; }
  .rec { font-size: 11.5px; color: #12161d; background: #FBF7F2; border-left: 2px solid ${accent}; padding: 6px 10px; border-radius: 0 5px 5px 0; margin-top: 6px; display: block; }
  .rec b { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${accent}; display: block; margin-bottom: 2px; }

  .foot { margin-top: 44px; font-size: 11px; color: #94a3b8; text-align: center; }
  .dl { display: block; margin: 20px auto 0; font-size: 13px; font-weight: 700; color: #fff; background: ${accent}; border: 0; border-radius: 8px; padding: 10px 20px; cursor: pointer; }
  @media print { body { padding: 0 24px; background: #fff; } .no-print { display: none; } @page { size: A4 landscape; margin: 10mm; } }
  @media (max-width: 720px) { .grid, .grid.cards3, .show-grid, .two-col, .img-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
  <div class="head">
    ${logoPath ? `<img class="brand-logo" src="${esc(logoPath)}" alt="${esc(a.brand_name)}">` : `<div class="mono">${esc(monogram)}</div>`}
    <div>
      <h1>Marketing Snapshot · ${esc(a.brand_name)}</h1>
      <div class="sub">${fmtDate(a.window.start)} to ${fmtDate(a.window.end)} — competitor landscape, tradeshows and the activation plan</div>
    </div>
    <div class="gen">Generated<br>${fmtDate(a.generated_at.slice(0, 10))}</div>
  </div>
  <div class="accent-bar">${palette.swatches.map(c => `<span style="background:${c}"></span>`).join("")}</div>

  <h2>Competitor landscape</h2>
  <div class="grid">${competitorCards}</div>

  <h2>A look ahead</h2>
  <div class="panel">${spineHtml}</div>

  <h2>Where the money goes</h2>
  <div class="two-col">
    <div class="panel">${budgetHtml}</div>
    <div class="panel">${allocHtml}</div>
  </div>

  <h2>Campaign Planning</h2>
  ${cardsHtml}

  <h2>Open decisions</h2>
  <div class="panel">${decisionsHtml}</div>

  <h2>Asks of Global</h2>
  <div class="panel">${asksHtml}</div>

  <h2>Google Ads — live creative</h2>
  ${imageGallery}
  <div class="grid" style="margin-top:14px">${adBlocks}</div>

  <h2>Meta Ads — live creative</h2>
  ${metaGallery}
  <div class="grid" style="margin-top:14px">${metaBlocks}</div>

  <button class="dl no-print" onclick="window.print()">⬇ Download PDF</button>
  <p class="foot">${esc(ENTITY.legalName)} · ${esc(ENTITY.address)} · prepared for internal/partner sharing.</p>
</body></html>`;
}
