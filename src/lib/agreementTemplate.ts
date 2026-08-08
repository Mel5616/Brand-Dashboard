// Influencer Collaboration Agreement — master template v2.0, ported from the
// build brief's influencer-agreement-template.md. One template, all brands;
// Coolkidz Australia Pty Ltd is always the contracting party, never the brand
// (six of the twelve brands are distributed, not owned — the brand cannot be
// bound as a party). Rendered to a stored HTML snapshot at send time so a
// later template edit never alters a contract someone already signed.

export const TEMPLATE_VERSION = "2.0";

export const ENTITY = {
  legalName: "Coolkidz Australia Pty Ltd",
  abn: "98 293 897 047",
  address: "1 Beyer Road, Braeside VIC 3195",
  phone: "1300 722 302",
  email: "partnerships@coolkidz.com.au",
  governingLaw: "Victoria, Australia",
};

// Global defaults (brands.json → defaults). Per-agreement fields default from
// these but are editable per send — the brief flags several as open business
// decisions (exclusivity length, paid media rights), not settled ones, so
// these stay the conservative literal defaults rather than a recommendation.
export const DEFAULTS = {
  contentDueDays: 21,
  minimumLivePeriodMonths: 6,
  exclusivityMonths: 6,
  usageTermMonths: 12,
  usagePaidMedia: false,
  usageRetailPartners: true,
  usagePrint: false,
  discountActiveDays: 7,
};

export const AGREEMENT_TYPES: Record<string, { label: string; description: string; requiresExclusivity: boolean; requiresDisclosure: boolean }> = {
  gifted_social: { label: "Gifted collaboration (social posting)", description: "Product gifted in return for published social content. Standard type.", requiresExclusivity: true, requiresDisclosure: true },
  ugc_only: { label: "UGC content licence (no posting)", description: "Product gifted in return for raw assets delivered to Coolkidz. Creator does not publish, so no disclosure obligation and no exclusivity.", requiresExclusivity: false, requiresDisclosure: false },
  event_attendance: { label: "Event attendance", description: "Creator attends a Coolkidz event. Deliverables are stories or reels on the day.", requiresExclusivity: false, requiresDisclosure: true },
};

// Recommended exclusivity length by tier (README §"Open decisions", item 2) —
// offered as the form's starting point, never forced; a low-value Tier C gift
// carrying a 6-month lockout is the term most exposed under the unfair
// contract terms regime.
export const EXCLUSIVITY_MONTHS_BY_TIER: Record<string, number> = { A: 6, B: 6, C: 3 };

export type AgreementProduct = { product_name: string; variant?: string | null; quantity: number; rrp?: number | null };
export type AgreementDeliverable = { deliverable_type: string; platform: string; quantity: number; due_date?: string | null };

export type AgreementForRender = {
  agreement_type: string;
  agreement_date: string | null;
  influencer_name: string;
  influencer_abn?: string | null;
  influencer_address: string;
  influencer_handle?: string | null;
  brand_display_name: string;
  brand_instagram_handle?: string | null;
  content_due_days: number;
  minimum_live_period_months: number;
  exclusivity_applies: boolean;
  exclusivity_category?: string | null;
  exclusivity_months: number;
  usage_term_months: number;
  usage_paid_media: boolean;
  usage_retail_partners: boolean;
  usage_print: boolean;
  discount_code?: string | null;
  discount_start?: string | null;
  discount_end?: string | null;
  representative_name?: string | null;
  representative_position?: string | null;
  products: AgreementProduct[];
  deliverables: AgreementDeliverable[];
};

const fmtDate = (d?: string | null) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—";
const money = (n?: number | null) => n == null ? "—" : `$${Number(n).toFixed(2)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderAgreementHtml(a: AgreementForRender): string {
  const type = AGREEMENT_TYPES[a.agreement_type] ?? AGREEMENT_TYPES.gifted_social;
  const showDisclosure = type.requiresDisclosure;
  const showExclusivity = type.requiresExclusivity && a.exclusivity_applies;
  const totalRrp = a.products.reduce((s, p) => s + (Number(p.rrp) || 0) * (p.quantity || 1), 0);
  const verb = a.agreement_type === "ugc_only" ? "deliver" : "create and publish";

  const productsList = a.products.map(p =>
    `<li>${p.quantity} x ${esc(p.product_name)}${p.variant ? ` (${esc(p.variant)})` : ""}, RRP ${money(p.rrp)}</li>`
  ).join("\n");

  const deliverablesList = a.deliverables.map(d =>
    `<li>${d.quantity} x ${esc(d.deliverable_type)} on ${esc(d.platform)}, due ${fmtDate(d.due_date)}</li>`
  ).join("\n");

  const usageChannels = [
    "Coolkidz and Brand owned social media channels (organic)",
    "Coolkidz and Brand websites",
    "email marketing",
    ...(a.usage_paid_media ? ["paid social and paid digital advertising, including creator whitelisting where separately agreed"] : []),
    ...(a.usage_retail_partners ? ["supply to Coolkidz retail partners for use in their own channels and in-store, on the same terms"] : []),
    ...(a.usage_print ? ["printed trade and consumer materials, and trade show display"] : []),
  ].map(c => `<li>${c}</li>`).join("\n");

  return `
<div class="agreement">
<h1>INFLUENCER COLLABORATION AGREEMENT</h1>
<h2>${esc(a.brand_display_name)}</h2>

<p>This Collaboration Agreement ("Agreement") is made effective as of <strong>${fmtDate(a.agreement_date)}</strong> by and between <strong>${ENTITY.legalName}</strong> (ABN ${ENTITY.abn}) of ${ENTITY.address}, the authorised Australian distributor of <strong>${esc(a.brand_display_name)}</strong> ("Coolkidz"), and <strong>${esc(a.influencer_name)}</strong>${a.influencer_abn ? ` (ABN ${esc(a.influencer_abn)})` : ""} of ${esc(a.influencer_address)} ("the Influencer").</p>
<p>In this Agreement, "the Brand" means ${esc(a.brand_display_name)}, and "the Products" means the items listed at clause 1.</p>

<h3>1. The Products</h3>
<p>Coolkidz will supply the Influencer with the following Products at no cost:</p>
<ul>${productsList || "<li>—</li>"}</ul>
<p>Total RRP value: ${money(totalRrp)}</p>
<p>Title in the Products passes to the Influencer on completion of the deliverables at clause 2. The Products are supplied as a non-cash benefit. The Influencer is responsible for their own tax treatment of the Products and should seek their own advice.</p>

<h3>2. Deliverables</h3>
<p>The Influencer will ${verb} the following, on the channels named:</p>
<ul>${deliverablesList || "<li>—</li>"}</ul>
<p>Unless a due date is stated above, all deliverables are due within ${a.content_due_days} days of the Influencer receiving the Products.</p>
<p>Each ${a.agreement_type === "ugc_only" ? "delivered" : "published"} item must:</p>
<ul>
  ${a.agreement_type !== "ugc_only" && a.brand_instagram_handle ? `<li>tag ${esc(a.brand_instagram_handle)}</li>` : ""}
  ${a.agreement_type !== "ugc_only" ? `<li>remain publicly visible for at least ${a.minimum_live_period_months} months from posting</li>` : ""}
  <li>be of a standard consistent with the Influencer's usual work, and clearly show the Products in use</li>
</ul>
<p>The Influencer will notify Coolkidz at ${ENTITY.email} when each item ${a.agreement_type === "ugc_only" ? "is ready" : "goes live"}${a.agreement_type !== "ugc_only" ? ", and provide the link" : ""}.</p>

${showDisclosure ? `
<h3>3. Disclosure</h3>
<p>The Influencer must clearly and prominently disclose that the Products were gifted by Coolkidz, on every piece of content produced under this Agreement.</p>
<p>Disclosure must:</p>
<ul>
  <li>appear at the start of the caption or within the first three seconds of video, not buried in hashtags or behind a "more" link</li>
  <li>use the platform's own paid partnership or branded content tool where one is available</li>
  <li>use plain wording such as "Gifted by ${esc(a.brand_display_name)}", "#gifted" or "#ad"</li>
</ul>
<p>This reflects the AANA Code of Ethics and ACCC guidance on influencer advertising. Coolkidz may require any non-compliant content to be corrected or removed.</p>
` : ""}

<h3>4. Content Standards and Product Safety</h3>
<p>The Influencer must:</p>
<ul>
  <li>use and depict the Products in accordance with the product instruction manual</li>
  <li>follow current Red Nose safe sleep guidance in any content involving infant sleep</li>
  <li>not make any safety, medical, therapeutic or performance claim about the Products beyond the claims published by Coolkidz</li>
  <li>not depict the Products in a way that is unsafe, in breach of an applicable Australian mandatory standard, or likely to bring the Brand into disrepute</li>
</ul>
<p>If Coolkidz notifies the Influencer that content raises a safety or compliance concern, the Influencer will remove or amend it within 24 hours.</p>
<p>If a Product is subject to a recall or safety notice, the Influencer will remove or update the relevant content on request and cooperate reasonably with Coolkidz.</p>

<h3>5. Children Appearing in Content</h3>
<p>Where a child appears in content produced under this Agreement, the Influencer warrants that they are the parent or legal guardian of that child, or have the express permission of the parent or legal guardian, and that this permission extends to the licence granted at clause 6.</p>

<h3>6. Content Licence</h3>
<p>The Influencer grants Coolkidz a non-exclusive, royalty-free, worldwide licence to use, reproduce, edit, crop and re-publish content created under this Agreement for a period of ${a.usage_term_months} months from the date each item is ${a.agreement_type === "ugc_only" ? "delivered" : "published"}, across:</p>
<ul>${usageChannels}</ul>
<p>Coolkidz will credit the Influencer where the format reasonably allows.</p>
<p>The Influencer:</p>
<ul>
  <li>warrants that they own or control all rights in the content, and that it does not infringe any third party's rights, including in music, artwork or footage</li>
  <li>consents to Coolkidz using the content without further attribution or alteration approval, to the extent permitted by Part IX of the Copyright Act 1968 (Cth)</li>
  <li>will not use content produced under this Agreement to promote a competitor of the Brand</li>
</ul>

${showExclusivity ? `
<h3>7. Exclusivity</h3>
<p>For ${a.exclusivity_months} months from the date of this Agreement, the Influencer will not create paid or gifted promotional content for any competing brand in the category: <strong>${esc(a.exclusivity_category || "TBC")}</strong>.</p>
<p>This restriction applies only to that category. It does not restrict the Influencer's content in any other category, or their ordinary personal or editorial content.</p>
` : ""}

<h3>8. Discount Codes</h3>
${a.discount_code ? `
<p>Coolkidz will issue the Influencer the unique discount code <strong>${esc(a.discount_code)}</strong>, active from ${fmtDate(a.discount_start)} to ${fmtDate(a.discount_end)}.</p>
<p>The code carries no commission or payment on sales generated. Coolkidz may deactivate the code at any time if it is misused, published on a coupon aggregator site, or shared outside the Influencer's own audience.</p>
` : `<p>No discount code is issued under this Agreement.</p>`}

<h3>9. Compensation</h3>
<p>No fee is payable under this Agreement. The consideration to the Influencer is the supply of the Products at clause 1 and the licence-free use of their own content.</p>
<p>This clause applies to this Agreement only and does not prevent Coolkidz and the Influencer entering a separate paid arrangement in future.</p>

<h3>10. Additional Products and Accessories</h3>
<p>Coolkidz may decline any request for additional products or accessories not listed at clause 1.</p>

<h3>11. Shipping and Delivery</h3>
<p>Coolkidz cannot ship to a PO Box or leave parcels unattended. Delivery will be attempted up to three times before the parcel is returned to the Coolkidz office. If a parcel is returned uncollected, Coolkidz may charge the Influencer the cost of re-sending it.</p>

<h3>12. If Deliverables Are Not Completed</h3>
<p>If the Influencer does not complete the deliverables at clause 2 by the due date, Coolkidz will give written notice and allow 14 days to remedy.</p>
<p>If the deliverables remain incomplete after that period, Coolkidz may, at its election, either arrange collection of the Products at its own cost, or invoice the Influencer for the cost price of the Products. Coolkidz will not do both.</p>

<h3>13. Privacy</h3>
<p>Coolkidz collects the Influencer's name, contact details and delivery address to administer this Agreement and to send the Products. This information is handled in accordance with the Coolkidz privacy policy and the Privacy Act 1988 (Cth), and is not sold or supplied to third parties for their own marketing.</p>

<h3>14. Term and Termination</h3>
<p>This Agreement starts on the date at the top and continues until the later of the completion of the deliverables${showExclusivity ? " and the end of the exclusivity period at clause 7" : ""}.</p>
<p>Either party may terminate on written notice if the other materially breaches the Agreement and does not remedy the breach within 14 days.</p>
<p>Clauses 4, 5, 6 and 13 survive termination.</p>

<h3>15. General</h3>
<ul>
  <li>This Agreement is governed by the laws of ${ENTITY.governingLaw}.</li>
  <li>This Agreement is the entire agreement between the parties on this subject and replaces any earlier discussion or document.</li>
  <li>Any variation must be in writing and agreed by both parties.</li>
  <li>Nothing in this Agreement creates an employment, partnership, agency or joint venture relationship. The Influencer is an independent contractor.</li>
  <li>The Influencer may not assign this Agreement or subcontract the deliverables without written consent.</li>
</ul>

<h3>16. Acceptance</h3>
<p>By signing below, the Influencer confirms they have read, understood and agree to the terms of this Agreement.</p>
<table class="sign-table">
  <tr><th>Influencer</th><th>${esc(ENTITY.legalName)}</th></tr>
  <tr><td>Name: ${esc(a.influencer_name)}</td><td>Name: ${esc(a.representative_name || "—")}</td></tr>
  <tr><td>Handle: ${esc(a.influencer_handle || "—")}</td><td>Position: ${esc(a.representative_position || "—")}</td></tr>
</table>
</div>`.trim();
}
