import { ENTITY } from "./agreementTemplate";

// Self-contained HTML for the Activations report — a per-brand snapshot of
// competitor activity, upcoming tradeshows and a 6-month forward marketing
// plan, built to hand to Global. Print/PDF via the browser, same pattern as
// the Brand Snapshot / Gift order sheet reports. Visual (cards, timeline,
// ticket-style show dates) rather than plain tables — this one leaves the
// building, so it's held to a higher bar than the internal-only reports.

type Competitor = { name: string; notes: string | null };
type ShowRow = { name: string; date_start: string; date_end: string; state: string; location: string; status: "upcoming" | "live" | "past" };
type CampaignRow = { campaign: string; channel: string; status: string; key_date: string; end_date?: string | null; note?: string | null };
type Creative = { ad_group: string | null; campaign_name: string | null; headlines: string[]; descriptions: string[]; clicks: number };

export type ActivationReportInput = {
  brand_name: string;
  brand_color?: string | null;
  brand_init?: string | null;
  generated_at: string;
  competitors: Competitor[];
  tradeshows: ShowRow[];
  campaigns: CampaignRow[];
  adCreatives: Creative[];
};

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (s: string | null | undefined) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDay = (s: string) => new Date(s + "T00:00:00").getDate();
const fmtMon = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { month: "short" }).toUpperCase();
const notesToList = (notes: string | null) => (notes ?? "").split("\n").map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean);

const PIN = `<svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" style="vertical-align:-1.5px"><path d="M10 1.5c-3 0-5.5 2.4-5.5 5.5 0 3.9 5.5 11.5 5.5 11.5S15.5 10.9 15.5 7c0-3.1-2.5-5.5-5.5-5.5Zm0 7.6a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2Z"/></svg>`;

export function buildActivationReport(a: ActivationReportInput): string {
  const accent = a.brand_color || "#132741";
  const monogram = (a.brand_init || a.brand_name.slice(0, 2)).toUpperCase();

  const competitorCards = a.competitors.length ? a.competitors.map(c => `
    <div class="card comp-card">
      <div class="comp-bar"></div>
      <h3>${esc(c.name)}</h3>
      <ul>${notesToList(c.notes).map(l => `<li>${esc(l)}</li>`).join("") || `<li class="muted">No notes yet.</li>`}</ul>
    </div>`).join("") : `<p class="muted">No competitors tracked yet.</p>`;

  // Upcoming/live first (ascending — what's next matters most to a reader
  // outside the building), past shows collapsed below.
  const upcoming = a.tradeshows.filter(s => s.status !== "past").sort((x, y) => x.date_start.localeCompare(y.date_start));
  const past = a.tradeshows.filter(s => s.status === "past").sort((x, y) => y.date_start.localeCompare(x.date_start));

  const showCard = (s: ShowRow) => `
    <div class="show-card ${s.status}">
      <div class="show-date">
        <span class="d">${fmtDay(s.date_start)}</span>
        <span class="m">${fmtMon(s.date_start)}</span>
      </div>
      <div class="show-body">
        <div class="show-top">
          <span class="show-name">${esc(s.name)}</span>
          <span class="status ${s.status}">${s.status}</span>
        </div>
        <p class="show-meta">${fmtDate(s.date_start)} – ${fmtDate(s.date_end)}</p>
        <p class="show-meta">${PIN} ${esc(s.location)}${s.state ? `, ${esc(s.state)}` : ""}</p>
      </div>
    </div>`;

  const showsHtml = a.tradeshows.length ? `
    ${upcoming.length ? `<div class="show-grid">${upcoming.map(showCard).join("")}</div>` : `<p class="muted">Nothing scheduled yet.</p>`}
    ${past.length ? `<p class="sub-label">Recently attended</p><div class="show-grid">${past.map(showCard).join("")}</div>` : ""}
  ` : `<p class="muted">No tradeshows on record for this brand.</p>`;

  const timelineHtml = a.campaigns.length ? `<div class="timeline">${a.campaigns.map(c => `
    <div class="tl-row">
      <div class="tl-date">${fmtDay(c.key_date)} <span class="m">${fmtMon(c.key_date)}</span></div>
      <div class="tl-line"><span class="tl-dot"></span></div>
      <div class="tl-card">
        <div class="show-top">
          <span class="show-name">${esc(c.campaign)}</span>
          <span class="status">${esc(c.status || "—")}</span>
        </div>
        <p class="show-meta">${esc(c.channel || "—")}${c.end_date ? ` · through ${fmtDate(c.end_date)}` : ""}</p>
      </div>
    </div>`).join("")}</div>` : `<p class="muted">Nothing planned in the next 6 months yet.</p>`;

  const adBlocks = a.adCreatives.length ? a.adCreatives.map(c => `
    <div class="card">
      <h3>${esc(c.campaign_name || "—")}${c.ad_group ? ` <span class="muted">· ${esc(c.ad_group)}</span>` : ""}</h3>
      <p class="label">Headlines</p>
      <ul>${c.headlines.map(h => `<li>${esc(h)}</li>`).join("")}</ul>
      <p class="label">Descriptions</p>
      <ul>${c.descriptions.map(d => `<li>${esc(d)}</li>`).join("")}</ul>
    </div>`).join("") : `<p class="muted">No live ad copy synced yet.</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activations · ${esc(a.brand_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1e293b; max-width: 900px; margin: 0 auto; padding: 0 32px 48px; background: #f8fafc; }
  .head { display: flex; align-items: center; gap: 16px; padding: 36px 0 24px; }
  .mono { width: 52px; height: 52px; border-radius: 14px; background: ${accent}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; letter-spacing: 0.02em; flex-shrink: 0; }
  .head h1 { font-size: 25px; margin: 0 0 3px; color: #0f172a; }
  .head .sub { font-size: 12.5px; color: #64748b; }
  .head .gen { margin-left: auto; text-align: right; font-size: 11.5px; color: #94a3b8; }
  .accent-bar { height: 4px; border-radius: 3px; background: linear-gradient(90deg, ${accent}, ${accent}55); margin-bottom: 28px; }
  h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #0f172a; font-weight: 800; margin: 34px 0 14px; display: flex; align-items: center; gap: 8px; }
  h2::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: ${accent}; display: inline-block; }
  .sub-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 18px 0 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .card { position: relative; background: #fff; border: 1px solid #e8edf3; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.03); }
  .comp-card { padding-left: 20px; overflow: hidden; }
  .comp-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${accent}; }
  .card h3 { font-size: 14px; margin: 0 0 8px; color: #0f172a; }
  .card ul { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.65; color: #475569; }
  .card .label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 10px 0 4px; }
  .muted { color: #94a3b8; font-size: 12.5px; }

  .show-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
  .show-card { display: flex; gap: 12px; background: #fff; border: 1px solid #e8edf3; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.03); }
  .show-card.live { border-color: #6ee7b7; background: #f0fdf9; }
  .show-date { flex-shrink: 0; width: 46px; height: 46px; border-radius: 10px; background: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; }
  .show-card.upcoming .show-date { background: ${accent}14; }
  .show-date .d { font-size: 17px; font-weight: 800; color: #0f172a; }
  .show-date .m { font-size: 9px; font-weight: 700; letter-spacing: 0.05em; color: #64748b; }
  .show-body { min-width: 0; flex: 1; }
  .show-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .show-name { font-size: 13.5px; font-weight: 700; color: #0f172a; }
  .show-meta { font-size: 11.5px; color: #64748b; margin: 2px 0 0; }

  .timeline { position: relative; padding-left: 2px; }
  .tl-row { display: grid; grid-template-columns: 46px 20px 1fr; gap: 0; align-items: stretch; }
  .tl-date { font-size: 13px; font-weight: 800; color: #0f172a; padding-top: 12px; text-align: right; padding-right: 10px; white-space: nowrap; }
  .tl-date .m { display: block; font-size: 9px; font-weight: 700; color: #94a3b8; letter-spacing: 0.05em; }
  .tl-line { display: flex; flex-direction: column; align-items: center; }
  .tl-line::before { content: ""; width: 2px; flex: 1; background: #e2e8f0; }
  .tl-row:last-child .tl-line::before { background: transparent; }
  .tl-dot { width: 10px; height: 10px; border-radius: 50%; background: ${accent}; margin-top: 16px; flex-shrink: 0; box-shadow: 0 0 0 3px ${accent}22; }
  .tl-card { padding: 10px 0 18px 14px; }

  .status { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; text-transform: capitalize; flex-shrink: 0; }
  .status.live { background: #ecfdf5; color: #047857; }
  .status.past { background: #f1f5f9; color: #94a3b8; }
  .foot { margin-top: 44px; font-size: 11px; color: #94a3b8; text-align: center; }
  .dl { display: block; margin: 20px auto 0; font-size: 13px; font-weight: 700; color: #fff; background: ${accent}; border: 0; border-radius: 8px; padding: 10px 20px; cursor: pointer; }
  @media print { body { padding: 0 24px; background: #fff; } .no-print { display: none; } }
  @media (max-width: 640px) { .grid, .show-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <div class="head">
    <div class="mono">${esc(monogram)}</div>
    <div>
      <h1>Activations · ${esc(a.brand_name)}</h1>
      <div class="sub">Competitor landscape, tradeshows and the 6-month forward marketing plan</div>
    </div>
    <div class="gen">Generated<br>${fmtDate(a.generated_at.slice(0, 10))}</div>
  </div>
  <div class="accent-bar"></div>

  <h2>Competitor landscape</h2>
  <div class="grid">${competitorCards}</div>

  <h2>Tradeshows</h2>
  ${showsHtml}

  <h2>Activation plan — next 6 months</h2>
  ${timelineHtml}

  <h2>Google Ads — top copy live now</h2>
  <div class="grid">${adBlocks}</div>

  <button class="dl no-print" onclick="window.print()">⬇ Download PDF</button>
  <p class="foot">${esc(ENTITY.legalName)} · ${esc(ENTITY.address)} · prepared for internal/partner sharing.</p>
</body></html>`;
}
