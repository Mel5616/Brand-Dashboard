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
  reference?: string | null;
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

// Send-time guard: a signed agreement with a gap where a restraint clause
// should be is worse than no clause at all — it reads as something was
// removed. Call this before rendering+sending; block if it returns an error.
export function validateForSend(a: Pick<AgreementForRender, "agreement_type" | "exclusivity_applies" | "exclusivity_category">): string | null {
  const type = AGREEMENT_TYPES[a.agreement_type] ?? AGREEMENT_TYPES.gifted_social;
  if (type.requiresExclusivity && a.exclusivity_applies && !String(a.exclusivity_category || "").trim()) {
    return "Exclusivity category is required before sending (or turn exclusivity off for this agreement).";
  }
  return null;
}

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
    "Coolkidz and Brand owned social media channels, both organic and paid, including paid amplification of the Influencer's own posts and use as advertising creative",
    "Coolkidz and Brand websites and product listings",
    "email marketing",
    "trade and retailer facing material, including sell-in presentations, catalogues and in-store display",
  ].map(c => `<li>${c}</li>`).join("\n");

  // Clauses are keyed, not hard-numbered — some are conditional (Disclosure,
  // Exclusivity), so the visible clause number is whatever position survives
  // filtering. Cross-references (e.g. "the licence granted at clause N")
  // resolve against that same final numbering via `n(key)`, so a clause
  // being dropped can never leave a numbering gap or a dangling reference.
  type ClauseDef = { key: string; title: string; show: boolean; body: (n: (key: string) => number) => string };
  const defs: ClauseDef[] = [
    {
      key: "products", title: "The Products", show: true, body: n => `
<p>Coolkidz will supply the Influencer with the following Products at no cost:</p>
<ul>${productsList || "<li>—</li>"}</ul>
<div class="callout">Total RRP value: <strong>${money(totalRrp)}</strong></div>
<p>Title in the Products passes to the Influencer on completion of the deliverables at clause ${n("deliverables")}. The Products are supplied as a non-cash benefit. The Influencer is responsible for their own tax treatment of the Products and should seek their own advice.</p>`,
    },
    {
      key: "deliverables", title: "Deliverables", show: true, body: () => `
<p>The Influencer will ${verb} the following, on the channels named:</p>
<ul>${deliverablesList || "<li>—</li>"}</ul>
<p>Unless a due date is stated above, all deliverables are due within ${a.content_due_days} days of the Influencer receiving the Products.</p>
<p>Each ${a.agreement_type === "ugc_only" ? "delivered" : "published"} item must:</p>
<ul>
  ${a.agreement_type !== "ugc_only" && a.brand_instagram_handle ? `<li>tag ${esc(a.brand_instagram_handle)}</li>` : ""}
  ${a.agreement_type !== "ugc_only" ? `<li>remain publicly visible for at least ${a.minimum_live_period_months} months from posting</li>` : ""}
  <li>be of a standard consistent with the Influencer's usual work, and clearly show the Products in use</li>
</ul>
<p>The Influencer will notify Coolkidz at ${ENTITY.email} when each item ${a.agreement_type === "ugc_only" ? "is ready" : "goes live"}${a.agreement_type !== "ugc_only" ? ", and provide the link" : ""}.</p>`,
    },
    {
      key: "disclosure", title: "Disclosure", show: showDisclosure, body: () => `
<p>The Influencer must clearly and prominently disclose that the Products were gifted by the Brand, on every piece of content produced under this Agreement.</p>
<p>Disclosure must:</p>
<ul>
  <li>appear at the start of the caption or within the first three seconds of video, not buried in hashtags or behind a "more" link</li>
  <li>use the platform's own paid partnership or branded content tool where one is available</li>
  <li>use plain wording such as "Gifted by ${esc(a.brand_display_name)}", "#gifted" or "#ad"</li>
</ul>
<p>This reflects the AANA Code of Ethics and ACCC guidance on influencer advertising. Coolkidz may require any non-compliant content to be corrected or removed.</p>`,
    },
    {
      key: "standards", title: "Content Standards and Product Safety", show: true, body: () => `
<p>The Influencer must:</p>
<ul>
  <li>use and depict the Products in accordance with the product instruction manual</li>
  <li>follow current Red Nose safe sleep guidance in any content involving infant sleep</li>
  <li>not make any safety, medical, therapeutic or performance claim about the Products beyond the claims published by Coolkidz</li>
  <li>not depict the Products in a way that is unsafe, in breach of an applicable Australian mandatory standard, or likely to bring the Brand into disrepute</li>
</ul>
<p>If Coolkidz notifies the Influencer that content raises a safety or compliance concern, the Influencer will remove or amend it within 24 hours.</p>
<p>If a Product is subject to a recall or safety notice, the Influencer will remove or update the relevant content on request and cooperate reasonably with Coolkidz.</p>`,
    },
    {
      key: "children", title: "Children Appearing in Content", show: true, body: n => `
<p>Where a child appears in content produced under this Agreement, the Influencer warrants that they are the parent or legal guardian of that child, or have the express permission of the parent or legal guardian, and that this permission extends to the licence granted at clause ${n("licence")}.</p>`,
    },
    {
      key: "licence", title: "Content Licence", show: true, body: () => `
<p>The Influencer grants Coolkidz a non-exclusive, royalty-free, worldwide licence to use, reproduce, edit, crop and re-publish content created under this Agreement for a period of ${a.usage_term_months} months from the date each item is ${a.agreement_type === "ugc_only" ? "delivered" : "published"}, across:</p>
<ul>${usageChannels}</ul>
<p>The Influencer will supply the original, unwatermarked files for each deliverable to ${ENTITY.email} within 7 days of publishing.</p>
<p>Coolkidz will credit the Influencer where the format reasonably allows.</p>
<p>The Influencer:</p>
<ul>
  <li>warrants that they own or control all rights in the content, and that it does not infringe any third party's rights, including in music, artwork or footage</li>
  <li>consents to Coolkidz using the content without further attribution or alteration approval, to the extent permitted by Part IX of the Copyright Act 1968 (Cth)</li>
  <li>will not use content produced under this Agreement to promote a competitor of the Brand</li>
</ul>`,
    },
    {
      key: "exclusivity", title: "Exclusivity", show: showExclusivity, body: n => `
<p>From the date of this Agreement until 14 days after the last deliverable at clause ${n("deliverables")} is published, the Influencer will not publish paid or gifted content for a brand that competes directly with the Products.</p>
<p>This does not restrict the Influencer's own unpaid use of, or organic commentary about, any product.</p>`,
    },
    {
      key: "discount", title: "Discount Codes", show: true, body: () => a.discount_code ? `
<p>Coolkidz will issue the Influencer the unique discount code <strong>${esc(a.discount_code)}</strong>, active from ${fmtDate(a.discount_start)} to ${fmtDate(a.discount_end)}.</p>
<p>The code carries no commission or payment on sales generated. Coolkidz may deactivate the code at any time if it is misused, published on a coupon aggregator site, or shared outside the Influencer's own audience.</p>` : `<p>No discount code is issued under this Agreement.</p>`,
    },
    {
      key: "compensation", title: "Compensation", show: true, body: n => `
<p>No fee is payable under this Agreement. The consideration to the Influencer is the supply of the Products at clause ${n("products")}. In exchange, the Influencer completes the deliverables at clause ${n("deliverables")} and grants the licence at clause ${n("licence")}.</p>
<p>This clause applies to this Agreement only and does not prevent Coolkidz and the Influencer entering a separate paid arrangement in future.</p>`,
    },
    {
      key: "shipping", title: "Shipping and Delivery", show: true, body: () => `
<p>Coolkidz cannot ship to a PO Box or leave parcels unattended. Delivery will be attempted up to three times before the parcel is returned to the Coolkidz office. If a parcel is returned uncollected, Coolkidz may charge the Influencer the cost of re-sending it.</p>`,
    },
    {
      key: "incomplete", title: "If Deliverables Are Not Completed", show: true, body: n => `
<p>If the Influencer does not complete the deliverables at clause ${n("deliverables")} by the due date, Coolkidz will give written notice and allow 14 days to remedy.</p>
<p>If the deliverables remain incomplete after that period, Coolkidz may, at its election, either arrange collection of the Products at its own cost, or invoice the Influencer for the cost price of the Products. Coolkidz will not do both.</p>
<p>If the Influencer removes a published item before the end of the visibility period at clause ${n("deliverables")}, Coolkidz will give written notice and allow 14 days for it to be restored, or replaced with equivalent content. If it is not, this clause applies as though the deliverable had not been completed.</p>`,
    },
    {
      key: "privacy", title: "Privacy", show: true, body: () => `
<p>Coolkidz collects the Influencer's name, contact details and delivery address to administer this Agreement and to send the Products. This information is handled in accordance with the Coolkidz privacy policy and the Privacy Act 1988 (Cth), and is not sold or supplied to third parties for their own marketing.</p>`,
    },
    {
      key: "term", title: "Term and Termination", show: true, body: n => `
<p>This Agreement starts on the date at the top and continues until the later of completion of the deliverables at clause ${n("deliverables")} and expiry of the licence at clause ${n("licence")}.</p>
<p>Either party may terminate on written notice if the other materially breaches the Agreement and does not remedy the breach within 14 days.</p>
<p>Clauses ${n("standards")}, ${n("children")}, ${n("licence")} and ${n("privacy")} survive termination.</p>`,
    },
    {
      key: "general", title: "General", show: true, body: () => `
<ul>
  <li>The Influencer warrants that they are 18 years of age or older.</li>
  <li>This Agreement is governed by the laws of ${ENTITY.governingLaw}.</li>
  <li>This Agreement is the entire agreement between the parties on this subject and replaces any earlier discussion or document.</li>
  <li>Any variation must be in writing and agreed by both parties.</li>
  <li>Nothing in this Agreement creates an employment, partnership, agency or joint venture relationship. The Influencer is an independent contractor.</li>
  <li>The Influencer may not assign this Agreement or subcontract the deliverables without written consent.</li>
</ul>`,
    },
    {
      key: "acceptance", title: "Acceptance", show: true, body: () => `
<p>By signing below, the Influencer confirms they have read, understood and agree to the terms of this Agreement.</p>
<table class="sign-table">
  <tr><th>Influencer</th><th>${esc(ENTITY.legalName)}</th></tr>
  <tr><td>Name: ${esc(a.influencer_name)}</td><td>Name: ${esc(a.representative_name || "—")}</td></tr>
  <tr><td>Handle: ${esc(a.influencer_handle || "—")}</td><td>Position: ${esc(a.representative_position || "—")}</td></tr>
</table>`,
    },
  ];

  const visible = defs.filter(d => d.show);
  const numberOf = (key: string) => { const i = visible.findIndex(d => d.key === key); return i === -1 ? 0 : i + 1; };
  const clausesHtml = visible.map((d, i) => `<h3>${i + 1}. ${d.title}</h3>${d.body(numberOf)}`).join("\n");

  return `
<div class="agreement">
${a.reference ? `<div class="eyebrow">${esc(a.reference)}</div>` : ""}
<h1>INFLUENCER COLLABORATION AGREEMENT</h1>

<p>This Collaboration Agreement ("Agreement") is made effective as of <strong>${fmtDate(a.agreement_date)}</strong> by and between <strong>${ENTITY.legalName}</strong> (ABN ${ENTITY.abn}) of ${ENTITY.address}, the authorised Australian distributor of <strong>${esc(a.brand_display_name)}</strong> ("Coolkidz"), and <strong>${esc(a.influencer_name)}</strong>${a.influencer_abn ? ` (ABN ${esc(a.influencer_abn)})` : ""} of ${esc(a.influencer_address)} ("the Influencer").</p>
<p>In this Agreement, "the Brand" means ${esc(a.brand_display_name)}, and "the Products" means the items listed at clause ${numberOf("products")}.</p>

${clausesHtml}

<div class="doc-footer">
  ${esc(ENTITY.legalName)} · ABN ${ENTITY.abn} · ${esc(ENTITY.address)} · ${ENTITY.phone} · ${ENTITY.email}<br>
  ${a.reference ? `Reference ${esc(a.reference)} · ` : ""}Template v${TEMPLATE_VERSION} · Governed by the laws of ${ENTITY.governingLaw}
</div>
</div>`.trim();
}
