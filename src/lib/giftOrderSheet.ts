import { ENTITY } from "./agreementTemplate";

// A one-page "Gift order sheet" per influencer agreement — everything
// invoicing or whoever keys the order into Shopify needs: who it's for,
// where it ships, and what's in it. Deliberately NOT a live Shopify order
// (see Option A vs B discussion) — this stays a print/PDF handoff document,
// someone still keys it in. Print-to-PDF via the browser, same pattern as
// the Brand Snapshot report.

type Product = { product_name: string; variant: string | null; quantity: number; rrp: number | null };
type Influencer = {
  full_name: string; email: string; phone: string | null;
  address_line1: string | null; address_line2: string | null; suburb: string | null; state: string | null; postcode: string | null; is_po_box: boolean;
  abn: string | null;
};
type OrderSheetInput = {
  reference: string; agreement_date: string | null; campaign_name: string | null; status: string;
  brand_name: string; influencer: Influencer; products: Product[]; representative_name: string | null;
  approved_at: string | null; approved_by: string | null;
  forEmail?: boolean; // omits the interactive Download button (email clients strip onclick anyway) and the "not approved" banner (this variant is only ever sent once approved)
};

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n: number | null) => n == null ? "—" : `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—";

export function buildGiftOrderSheet(a: OrderSheetInput): string {
  const i = a.influencer;
  const addressLines = [i.address_line1, i.address_line2, [i.suburb, i.state, i.postcode].filter(Boolean).join(" ")].filter(Boolean);
  const totalRrp = a.products.reduce((s, p) => s + (Number(p.rrp) || 0) * (p.quantity || 1), 0);

  // Every agreement type in this system is a gift, never a paid fee (see the
  // "Consideration" clause — no fee is ever payable). The order sheet is
  // going to Accounts / whoever keys the order in, so the total needs to
  // read as "nothing owed" at a glance rather than as an invoice amount —
  // RRP still shown per line as reference value (useful for shipping /
  // declared value), just not as a headline dollar figure to pay.
  const productRows = a.products.length ? a.products.map(p => `
    <tr>
      <td>${esc(p.product_name)}${p.variant ? ` <span class="muted">(${esc(p.variant)})</span>` : ""}</td>
      <td class="r">${p.quantity}</td>
      <td class="r muted">${money(p.rrp)}</td>
    </tr>`).join("") : `<tr><td colspan="3" class="muted">No products on this agreement.</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gift order sheet · ${esc(a.reference)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1e293b; max-width: 720px; margin: 0 auto; padding: 40px 32px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #132741; padding-bottom: 16px; margin-bottom: 24px; }
  .head h1 { font-size: 20px; margin: 0 0 4px; color: #132741; }
  .head .sub { font-size: 12.5px; color: #64748b; }
  .ref { text-align: right; font-size: 12.5px; color: #64748b; }
  .ref b { display: block; font-size: 15px; color: #1e293b; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
  .card h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 8px; }
  .card p { margin: 0 0 3px; font-size: 13.5px; line-height: 1.5; }
  .muted { color: #94a3b8; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 8px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 6px 4px; }
  td { padding: 8px 4px; border-bottom: 1px solid #f1f5f9; }
  .r { text-align: right; }
  tfoot td { border-bottom: none; border-top: 2px solid #1e293b; font-weight: 700; padding-top: 10px; }
  .status { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: #ecfdf5; color: #047857; text-transform: capitalize; }
  .nocost { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; }
  .foot { margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
  .dl { display: block; margin: 0 auto 24px; font-size: 13px; font-weight: 700; color: #fff; background: #132741; border: 0; border-radius: 8px; padding: 10px 20px; cursor: pointer; }
  .pending-banner { background: #fef3c7; border: 2px solid #f59e0b; color: #92400e; font-weight: 700; font-size: 13px; text-align: center; padding: 12px; border-radius: 8px; margin-bottom: 20px; }
  .approved-banner { background: #ecfdf5; border: 1px solid #6ee7b7; color: #047857; font-size: 12px; text-align: center; padding: 8px; border-radius: 8px; margin-bottom: 20px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  ${!a.forEmail ? `<button class="dl no-print" onclick="window.print()">⬇ Download PDF</button>` : ""}
  ${!a.approved_at
    ? `<div class="pending-banner">⚠ NOT YET APPROVED — awaiting Mel's sign-off. Do not send to Accounts.</div>`
    : `<div class="approved-banner">✓ Approved by ${esc(a.approved_by || "—")} on ${fmtDate(a.approved_at.slice(0, 10))}</div>`}
  <div class="head">
    <div>
      <h1>Gift order sheet <span class="nocost">Gifted — no cost</span></h1>
      <div class="sub">${esc(a.brand_name)} · Coolkidz Australia Pty Ltd</div>
    </div>
    <div class="ref">
      <b>${esc(a.reference)}</b>
      ${fmtDate(a.agreement_date)}<br>
      <span class="status">${esc(a.status)}</span>
      ${a.representative_name ? `<div class="muted" style="margin-top:4px">Created by ${esc(a.representative_name)}</div>` : ""}
    </div>
  </div>

  ${a.campaign_name ? `<p class="muted" style="margin:-16px 0 20px">Campaign: ${esc(a.campaign_name)}</p>` : ""}

  <div class="grid">
    <div class="card">
      <h2>Recipient</h2>
      <p><b>${esc(i.full_name)}</b></p>
      <p>${esc(i.email)}</p>
      ${i.phone ? `<p>${esc(i.phone)}</p>` : ""}
      ${i.abn ? `<p class="muted">ABN ${esc(i.abn)}</p>` : ""}
    </div>
    <div class="card">
      <h2>Delivery address${i.is_po_box ? " · PO Box" : ""}</h2>
      ${addressLines.length ? addressLines.map(l => `<p>${esc(l!)}</p>`).join("") : `<p class="muted">No address on file.</p>`}
    </div>
  </div>

  <table>
    <thead><tr><th>Product</th><th class="r">Qty</th><th class="r">RRP (ref. only)</th></tr></thead>
    <tbody>${productRows}</tbody>
    <tfoot><tr><td colspan="2">Amount payable</td><td class="r" style="color:#1d4ed8">No cost — gifted</td></tr></tfoot>
  </table>
  <p class="muted" style="text-align:right;margin-top:-4px">Total RRP value (reference only, not payable): ${money(totalRrp)}</p>

  <p class="foot">${esc(ENTITY.legalName)} · ${esc(ENTITY.address)} · ${esc(ENTITY.email)} — generated from the signed Influencer Agreement, for order entry only, not a tax invoice.</p>
</body></html>`;
}
