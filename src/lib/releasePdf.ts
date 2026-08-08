import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { TERMS, TERMS_INTRO } from "./releaseTerms";

// Renders a signed media release as a PDF (pdf-lib — no headless browser needed).
// Same terms constants as the signing page; includes the drawn signature and the
// audit line (signed time in AEST + UTC, IP, user agent). Visual language matches
// the Influencer Agreement contracts (navy #132741 / teal accent #1E9DC2) so every
// Coolkidz-generated legal document reads as one family.

export type ReleaseForPdf = {
  child_first_name: string; guardian_name: string; guardian_email: string;
  guardian_phone: string | null; guardian_relationship: string | null;
  brand: string; campaign: string | null; shoot_date: string | null; shoot_location: string | null;
  retail_partner_optin: boolean; terms_version: string; signed_name: string;
  signed_at: string; signed_ip: string; signed_user_agent: string;
};

export const COOLKIDZ_ADDRESS = "Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside, Victoria 3195";

const NAVY = rgb(0.075, 0.153, 0.255);
const SLATE = rgb(0.28, 0.33, 0.41);
const MUTED = rgb(0.58, 0.64, 0.71);
const TEAL = rgb(0.118, 0.616, 0.761);
const TEAL_BG = rgb(0.918, 0.957, 0.973);
const HAIRLINE = rgb(0.89, 0.91, 0.94);

const PAGE_W = 595, PAGE_H = 842;
const LEFT = 56, WIDTH = 483;
const TOP_MARGIN = 792, BOTTOM_MARGIN = 66; // room for the footer

// signaturePng omitted → unsigned copy with a blank signature line (for preview/print).
export async function buildReleasePdf(r: ReleaseForPdf, signaturePng?: Uint8Array | null, logoPng?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = TOP_MARGIN;

  const ensure = (need: number) => {
    if (y - need < BOTTOM_MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); pages.push(page); y = TOP_MARGIN; }
  };
  const wrap = (text: string, f: PDFFont, size: number, maxWidth = WIDTH): string[] => {
    const words = text.split(/\s+/); const lines: string[] = []; let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxWidth) { if (cur) lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const para = (text: string, f = font, size = 10, color = SLATE, gap = 6, lineHeight = size + 4.5) => {
    for (const line of wrap(text, f, size)) {
      ensure(lineHeight);
      page.drawText(line, { x: LEFT, y, size, font: f, color });
      y -= lineHeight;
    }
    y -= gap;
  };

  // ---- Letterhead --------------------------------------------------------
  if (logoPng) {
    try {
      const logo = await doc.embedPng(logoPng);
      const ld = logo.scaleToFit(150, 36);
      page.drawImage(logo, { x: LEFT, y: y - ld.height + 6, width: ld.width, height: ld.height });
    } catch { page.drawText("COOLKIDZ AUSTRALIA", { x: LEFT, y: y - 12, size: 12, font: bold, color: NAVY }); }
  } else {
    page.drawText("COOLKIDZ AUSTRALIA", { x: LEFT, y: y - 12, size: 12, font: bold, color: NAVY });
  }
  page.drawText(COOLKIDZ_ADDRESS, { x: LEFT + 200, y: y - 22, size: 8.5, font, color: MUTED });
  y -= 44;
  page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + WIDTH, y }, thickness: 1.6, color: TEAL });
  y -= 26;

  page.drawText("PHOTOGRAPHY & MEDIA RELEASE", { x: LEFT, y, size: 10, font: bold, color: TEAL }); y -= 20;
  page.drawText(`${r.child_first_name} · ${r.brand}`, { x: LEFT, y, size: 19, font: bold, color: NAVY }); y -= 28;

  // ---- Field card ----------------------------------------------------------
  const dateFmt = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "TBC";
  const rows: [string, string][] = [
    ["Child", r.child_first_name],
    ["Parent / guardian", `${r.guardian_name}${r.guardian_relationship ? ` (${r.guardian_relationship})` : ""}`],
    ["Contact", [r.guardian_email, r.guardian_phone].filter(Boolean).join(" · ")],
    ["Brand / campaign", [r.brand, r.campaign].filter(Boolean).join(" · ")],
    ["Shoot", [dateFmt(r.shoot_date), r.shoot_location].filter(Boolean).join(" · ")],
    ["Retail partner use", r.retail_partner_optin ? "Yes — extended to authorised retail partners" : "No — Coolkidz-owned channels only"],
  ];
  if (signaturePng && r.signed_at) {
    rows.push(["Date executed", new Date(r.signed_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" })]);
  }

  const keyW = 132, padX = 14, padY = 10, rowGap = 3;
  const rowLines = rows.map(([, v]) => wrap(v, font, 9.5, WIDTH - keyW - padX * 2));
  const rowHeights = rowLines.map(lines => Math.max(1, lines.length) * 13);
  const cardH = padY * 2 + rowHeights.reduce((a, b) => a + b + rowGap, 0) - rowGap;
  ensure(cardH + 16);
  const cardTop = y;
  page.drawRectangle({ x: LEFT, y: cardTop - cardH, width: WIDTH, height: cardH, color: TEAL_BG });
  page.drawRectangle({ x: LEFT, y: cardTop - cardH, width: 3, height: cardH, color: TEAL });
  let ry = cardTop - padY - 9;
  rows.forEach(([k], i) => {
    page.drawText(k.toUpperCase(), { x: LEFT + padX, y: ry, size: 8, font: bold, color: NAVY });
    let ly = ry;
    for (const line of rowLines[i]) {
      page.drawText(line, { x: LEFT + padX + keyW, y: ly, size: 9.5, font, color: SLATE });
      ly -= 13;
    }
    ry -= rowHeights[i] + rowGap;
  });
  y = cardTop - cardH - 24;

  // ---- Terms ---------------------------------------------------------------
  para(TERMS_INTRO, font, 10, SLATE, 14);
  for (const t of TERMS) {
    ensure(34);
    page.drawLine({ start: { x: LEFT, y: y + 4 }, end: { x: LEFT + 22, y: y + 4 }, thickness: 1.4, color: TEAL });
    para(t.heading, bold, 10.5, NAVY, 3);
    para(t.body, font, 10, SLATE, 12);
  }

  // ---- Signature -------------------------------------------------------
  if (signaturePng) {
    const png = await doc.embedPng(signaturePng);
    const dims = png.scaleToFit(190, 62);
    const cardH2 = 22 + dims.height + 20 + 16 + 12 + 26;
    ensure(cardH2 + 10);
    const top2 = y;
    page.drawRectangle({ x: LEFT, y: top2 - cardH2, width: WIDTH, height: cardH2, color: TEAL_BG });
    page.drawRectangle({ x: LEFT, y: top2 - cardH2, width: 3, height: cardH2, color: TEAL });
    let sy = top2 - 20;
    page.drawText("SIGNED", { x: LEFT + 16, y: sy, size: 9, font: bold, color: TEAL }); sy -= dims.height + 10;
    page.drawImage(png, { x: LEFT + 16, y: sy, width: dims.width, height: dims.height });
    sy -= 18;
    page.drawText(r.signed_name, { x: LEFT + 16, y: sy, size: 12, font: bold, color: NAVY }); sy -= 15;
    const utc = new Date(r.signed_at);
    const aest = utc.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" });
    page.drawText(`Signed ${aest} AEST · Terms version ${r.terms_version}`, { x: LEFT + 16, y: sy, size: 8.5, font, color: SLATE }); sy -= 13;
    for (const line of wrap(`Audit: IP ${r.signed_ip} · ${r.signed_user_agent.slice(0, 140)}`, font, 8, WIDTH - 32)) {
      page.drawText(line, { x: LEFT + 16, y: sy, size: 8, font, color: MUTED }); sy -= 11;
    }
    y = top2 - cardH2 - 10;
  } else {
    ensure(120);
    page.drawText("Signature of parent / legal guardian", { x: LEFT, y, size: 10.5, font: bold, color: NAVY }); y -= 46;
    page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + 240, y }, thickness: 0.8, color: SLATE }); y -= 14;
    page.drawText("Name:", { x: LEFT, y, size: 10, font: bold, color: NAVY });
    page.drawLine({ start: { x: LEFT + 42, y: y - 2 }, end: { x: LEFT + 240, y: y - 2 }, thickness: 0.8, color: SLATE }); y -= 20;
    page.drawText("Date:", { x: LEFT, y, size: 10, font: bold, color: NAVY });
    page.drawLine({ start: { x: LEFT + 42, y: y - 2 }, end: { x: LEFT + 240, y: y - 2 }, thickness: 0.8, color: SLATE }); y -= 22;
    para(`Unsigned copy · Terms version ${r.terms_version}`, font, 8.5, MUTED, 0);
  }

  // ---- Footer (every page, drawn last so the final page count is known) ----
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: LEFT, y: 46 }, end: { x: LEFT + WIDTH, y: 46 }, thickness: 0.7, color: HAIRLINE });
    p.drawText("Coolkidz Australia Pty Ltd · Photography & Media Release", { x: LEFT, y: 32, size: 7.5, font, color: MUTED });
    const pageLabel = `Page ${i + 1} of ${total}`;
    p.drawText(pageLabel, { x: LEFT + WIDTH - bold.widthOfTextAtSize(pageLabel, 7.5), y: 32, size: 7.5, font: bold, color: MUTED });
  });

  return doc.save();
}
