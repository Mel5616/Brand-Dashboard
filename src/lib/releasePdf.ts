import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { TERMS, TERMS_INTRO } from "./releaseTerms";

// Renders a signed media release as a PDF (pdf-lib — no headless browser needed).
// Same terms constants as the signing page; includes the drawn signature and the
// audit line (signed time in AEST + UTC, IP, user agent).

export type ReleaseForPdf = {
  child_first_name: string; guardian_name: string; guardian_email: string;
  guardian_phone: string | null; guardian_relationship: string | null;
  brand: string; campaign: string | null; shoot_date: string | null; shoot_location: string | null;
  retail_partner_optin: boolean; terms_version: string; signed_name: string;
  signed_at: string; signed_ip: string; signed_user_agent: string;
};

// signaturePng omitted → unsigned copy with a blank signature line (for preview/print).
export async function buildReleasePdf(r: ReleaseForPdf, signaturePng?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.075, 0.153, 0.255);
  const slate = rgb(0.28, 0.33, 0.41);

  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const left = 56, width = 483;

  const ensure = (need: number) => {
    if (y - need < 56) { page = doc.addPage([595, 842]); y = 800; }
  };
  const wrap = (text: string, f = font, size = 10): string[] => {
    const words = text.split(/\s+/); const lines: string[] = []; let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width) { if (cur) lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const para = (text: string, f = font, size = 10, color = slate, gap = 6) => {
    for (const line of wrap(text, f, size)) {
      ensure(size + 4);
      page.drawText(line, { x: left, y, size, font: f, color });
      y -= size + 4;
    }
    y -= gap;
  };

  page.drawText("COOLKIDZ AUSTRALIA", { x: left, y, size: 11, font: bold, color: navy }); y -= 22;
  page.drawText("Photography & Media Release", { x: left, y, size: 18, font: bold, color: navy }); y -= 26;

  const dateFmt = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "TBC";
  const rows: [string, string][] = [
    ["Child", r.child_first_name],
    ["Parent / guardian", `${r.guardian_name}${r.guardian_relationship ? ` (${r.guardian_relationship})` : ""}`],
    ["Contact", [r.guardian_email, r.guardian_phone].filter(Boolean).join(" · ")],
    ["Brand / campaign", [r.brand, r.campaign].filter(Boolean).join(" · ")],
    ["Shoot", [dateFmt(r.shoot_date), r.shoot_location].filter(Boolean).join(" · ")],
    ["Retail partner use", r.retail_partner_optin ? "Yes — extended to authorised retail partners" : "No — Coolkidz-owned channels only"],
  ];
  for (const [k, v] of rows) {
    ensure(16);
    page.drawText(k, { x: left, y, size: 9.5, font: bold, color: navy });
    for (const line of wrap(v, font, 10)) {
      page.drawText(line, { x: left + 130, y, size: 10, font, color: slate });
      y -= 14;
    }
    if (!v) y -= 14;
  }
  y -= 10;

  para(TERMS_INTRO, font, 10, slate, 8);
  for (const t of TERMS) {
    ensure(30);
    para(t.heading, bold, 10.5, navy, 2);
    para(t.body, font, 10, slate, 8);
  }

  ensure(120);
  y -= 6;
  if (signaturePng) {
    page.drawText("Signed", { x: left, y, size: 10.5, font: bold, color: navy }); y -= 16;
    const png = await doc.embedPng(signaturePng);
    const dims = png.scaleToFit(200, 70);
    ensure(dims.height + 60);
    page.drawImage(png, { x: left, y: y - dims.height, width: dims.width, height: dims.height });
    y -= dims.height + 14;
    page.drawText(r.signed_name, { x: left, y, size: 11, font: bold, color: navy }); y -= 16;

    const utc = new Date(r.signed_at);
    const aest = utc.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" });
    para(`Signed ${aest} AEST (${utc.toISOString()} UTC) · Terms version ${r.terms_version}`, font, 8.5, slate, 2);
    para(`Audit: IP ${r.signed_ip} · ${r.signed_user_agent.slice(0, 140)}`, font, 8.5, slate, 0);
  } else {
    page.drawText("Signature of parent / legal guardian", { x: left, y, size: 10.5, font: bold, color: navy }); y -= 46;
    page.drawLine({ start: { x: left, y }, end: { x: left + 240, y }, thickness: 0.8, color: slate }); y -= 14;
    page.drawText("Name:", { x: left, y, size: 10, font: bold, color: navy });
    page.drawLine({ start: { x: left + 42, y: y - 2 }, end: { x: left + 240, y: y - 2 }, thickness: 0.8, color: slate }); y -= 20;
    page.drawText("Date:", { x: left, y, size: 10, font: bold, color: navy });
    page.drawLine({ start: { x: left + 42, y: y - 2 }, end: { x: left + 240, y: y - 2 }, thickness: 0.8, color: slate }); y -= 22;
    para(`Unsigned copy · Terms version ${r.terms_version}`, font, 8.5, slate, 0);
  }

  return doc.save();
}
