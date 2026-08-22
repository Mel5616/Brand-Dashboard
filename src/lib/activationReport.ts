import { ENTITY } from "./agreementTemplate";

// Self-contained HTML for the Activations report — a per-brand snapshot of
// competitor activity, upcoming tradeshows and a 6-month forward marketing
// plan, built to hand to Global. Print/PDF via the browser, same pattern as
// the Brand Snapshot / Gift order sheet reports.

type Competitor = { name: string; notes: string | null };
type ShowRow = { name: string; date_start: string; date_end: string; state: string; location: string; status: "upcoming" | "live" | "past" };
type CampaignRow = { campaign: string; channel: string; status: string; key_date: string; end_date?: string | null; note?: string | null };
type Creative = { ad_group: string | null; campaign_name: string | null; headlines: string[]; descriptions: string[]; clicks: number };

export type ActivationReportInput = {
  brand_name: string;
  generated_at: string;
  competitors: Competitor[];
  tradeshows: ShowRow[];
  campaigns: CampaignRow[];
  adCreatives: Creative[];
};

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (s: string | null | undefined) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const notesToList = (notes: string | null) => (notes ?? "").split("\n").map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean);

export function buildActivationReport(a: ActivationReportInput): string {
  const competitorCards = a.competitors.length ? a.competitors.map(c => `
    <div class="card">
      <h3>${esc(c.name)}</h3>
      <ul>${notesToList(c.notes).map(l => `<li>${esc(l)}</li>`).join("") || `<li class="muted">No notes yet.</li>`}</ul>
    </div>`).join("") : `<p class="muted">No competitors tracked yet.</p>`;

  const showRows = a.tradeshows.length ? a.tradeshows.map(s => `
    <tr>
      <td>${esc(s.name)}</td>
      <td>${fmtDate(s.date_start)} – ${fmtDate(s.date_end)}</td>
      <td>${esc(s.location)}${s.state ? `, ${esc(s.state)}` : ""}</td>
      <td><span class="status ${s.status}">${s.status}</span></td>
    </tr>`).join("") : `<tr><td colspan="4" class="muted">No tradeshows on record for this brand.</td></tr>`;

  const campaignRows = a.campaigns.length ? a.campaigns.map(c => `
    <tr>
      <td>${fmtDate(c.key_date)}${c.end_date ? ` – ${fmtDate(c.end_date)}` : ""}</td>
      <td>${esc(c.campaign)}</td>
      <td>${esc(c.channel || "—")}</td>
      <td><span class="status">${esc(c.status || "—")}</span></td>
    </tr>`).join("") : `<tr><td colspan="4" class="muted">Nothing planned in the next 6 months yet.</td></tr>`;

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
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1e293b; max-width: 860px; margin: 0 auto; padding: 40px 32px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #132741; padding-bottom: 16px; margin-bottom: 28px; }
  .head h1 { font-size: 24px; margin: 0 0 4px; color: #132741; }
  .head .sub { font-size: 12.5px; color: #64748b; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #132741; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 32px 0 14px; }
  h2:first-of-type { margin-top: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
  .card h3 { font-size: 14px; margin: 0 0 8px; color: #1e293b; }
  .card ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: #334155; }
  .card .label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 10px 0 4px; }
  .muted { color: #94a3b8; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 6px 4px; }
  td { padding: 8px 4px; border-bottom: 1px solid #f1f5f9; }
  .status { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; text-transform: capitalize; }
  .status.live { background: #ecfdf5; color: #047857; }
  .status.past { background: #f1f5f9; color: #64748b; }
  .foot { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  .dl { display: block; margin: 0 auto 24px; font-size: 13px; font-weight: 700; color: #fff; background: #132741; border: 0; border-radius: 8px; padding: 10px 20px; cursor: pointer; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <button class="dl no-print" onclick="window.print()">⬇ Download PDF</button>
  <div class="head">
    <div>
      <h1>Activations · ${esc(a.brand_name)}</h1>
      <div class="sub">Competitor landscape, tradeshows and the 6-month forward marketing plan</div>
    </div>
    <div class="sub">Generated ${fmtDate(a.generated_at.slice(0, 10))}</div>
  </div>

  <h2>Competitor landscape</h2>
  <div class="grid">${competitorCards}</div>

  <h2>Tradeshows</h2>
  <table>
    <thead><tr><th>Show</th><th>Dates</th><th>Location</th><th>Status</th></tr></thead>
    <tbody>${showRows}</tbody>
  </table>

  <h2>Activation plan — next 6 months</h2>
  <table>
    <thead><tr><th>Date</th><th>Campaign</th><th>Channel</th><th>Status</th></tr></thead>
    <tbody>${campaignRows}</tbody>
  </table>

  <h2>Google Ads — top copy live now</h2>
  <div class="grid">${adBlocks}</div>

  <p class="foot">${esc(ENTITY.legalName)} · ${esc(ENTITY.address)} · prepared for internal/partner sharing.</p>
</body></html>`;
}
