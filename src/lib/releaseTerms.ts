// Media release standard terms — SINGLE SOURCE OF TRUTH.
// Shown on the public signing page AND rendered into the signed PDF.
// Never duplicate this text elsewhere. Bump TERMS_VERSION on ANY wording change
// so historic signatures stay tied to the wording the guardian agreed to.
// ⚠ Drafted in-house — legal review required before first live signing.

export const TERMS_VERSION = "2026-07-v1";

export const TERMS_INTRO =
  "This release is between you (the parent or legal guardian named below) and Coolkidz Australia Pty Ltd " +
  "(“Coolkidz”) in relation to photographs and video (“Content”) featuring your child taken at the shoot " +
  "described above.";

export const TERMS: { heading: string; body: string }[] = [
  {
    heading: "1. What you are agreeing to",
    body: "You give Coolkidz permission to capture, use, reproduce, edit and publish Content featuring your child for marketing purposes across Coolkidz-owned channels, including websites, email, social media, packaging inserts, point-of-sale material and paid advertising for the brands Coolkidz distributes.",
  },
  {
    heading: "2. Retail partners (optional)",
    body: "If you tick the retail partner option, the same permission extends to Coolkidz's authorised retail partners using the Content to promote the featured products (for example on their websites, catalogues and social channels). If you leave it unticked, Content stays on Coolkidz-owned channels only.",
  },
  {
    heading: "3. Your child's privacy",
    body: "Coolkidz will only ever use your child's first name, or no name at all. No surname, school, suburb or any other identifying details will be collected, stored or published alongside the Content.",
  },
  {
    heading: "4. Ownership and editing",
    body: "The Content is owned by Coolkidz. Coolkidz may crop, edit, retouch or combine the Content with other material, and is under no obligation to use it. No fee is payable for the permissions granted under this release unless separately agreed in writing.",
  },
  {
    heading: "5. How long this lasts, and withdrawing",
    body: "This permission is ongoing, but you can withdraw it at any time by emailing marketing@coolkidz.com.au. On withdrawal, Coolkidz will stop new uses of the Content and remove it from Coolkidz-controlled channels within 30 days. Material already in circulation (for example printed items or third-party reposts) cannot always be recalled.",
  },
  {
    heading: "6. Your confirmation",
    body: "By signing you confirm you are the parent or legal guardian of the child named above, you have the authority to give these permissions, and the details you have provided are accurate.",
  },
];
