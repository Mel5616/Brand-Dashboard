// Sales Hub guideline pages — content sourced from "Working With Marketing"
// (Marketing, draft v0.1). No MDX pipeline exists in this repo, so this lives
// as plain JSX rather than separate .mdx files — still versioned in git,
// still easy to edit. TBC markers are kept literal; don't quietly resolve them.
// Built visual-first (icons, boxes, do/don't cards) — this is the version
// meant to actually get read, not just linked to.

const FILECAMP_URL = "https://coolkidz.filecamp.com/l";

const TBC = () => <span className="text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-xs">TBC</span>;

// Big, hard-to-miss link out to the actual asset library.
export function FilecampCard() {
  return (
    <a href={FILECAMP_URL} target="_blank" rel="noreferrer"
      className="flex items-center gap-4 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl p-5 mb-5 shadow-sm hover:shadow-md hover:from-indigo-500 hover:to-indigo-600 transition group">
      <div className="shrink-0 w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-lg">Open the Asset Library — Filecamp</div>
        <div className="text-indigo-100 text-sm">Every approved image lives here. If it's not in Filecamp, it's not approved to use.</div>
      </div>
      <svg className="w-5 h-5 text-indigo-200 group-hover:translate-x-1 transition shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
    </a>
  );
}

export const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} /></svg>
);
const ICONS = {
  check: "M5 13l4 4L19 7", cross: "M6 18L18 6M6 6l12 12", info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  camera: "M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z",
  child: "M12 4a4 4 0 100 8 4 4 0 000-8zM6 20a6 6 0 0112 0",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  at: "M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9 8.96 8.96 0 004-1",
  hash: "M5 9h14M5 15h14M11 4L7 20M17 4l-4 16",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  ad: "M3 8a5 5 0 015-5h8a5 5 0 015 5v8a5 5 0 01-5 5H8a5 5 0 01-5-5V8zm5 3h8m-8 4h5",
  price: "M7 7h.01M7 3h5.586a1 1 0 01.707.293l6.414 6.414a1 1 0 010 1.414l-8.586 8.586a1 1 0 01-1.414 0L3.293 13.293a1 1 0 010-1.414L7 3z",
  code: "M10 20l4-16M6 8L2 12l4 4M18 8l4 4-4 4",
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  gift: "M20 12v10H4V12M2 7h20v5H2V7zm10-5v20M12 7a2.5 2.5 0 11-2.5-2.5H12v2.5zm0 0a2.5 2.5 0 102.5-2.5H12v2.5z",
  wrench: "M11 4.5A3.5 3.5 0 007.5 8c0 .35.05.68.14 1L3 13.64l1.5 1.5L8.86 11.36c.32.09.65.14 1 .14A3.5 3.5 0 0013.5 8m-2.5-3.5c1.05 0 2 .5 2.5 1.5m-2.5-1.5A3.5 3.5 0 007 8c0 1.93 1.57 3.5 3.5 3.5",
  help: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};
function DoCard({ title, note }: { title: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center mt-0.5"><Icon path={ICONS.check} className="w-3.5 h-3.5" /></div>
      <div><div className="font-bold text-emerald-800 text-sm">{title}</div><div className="text-emerald-700 text-[13px] mt-0.5">{note}</div></div>
    </div>
  );
}
function DontCard({ title, note }: { title: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-rose-50 border border-rose-100 rounded-xl p-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center mt-0.5"><Icon path={ICONS.cross} className="w-3.5 h-3.5" /></div>
      <div><div className="font-bold text-rose-800 text-sm">{title}</div><div className="text-rose-700 text-[13px] mt-0.5">{note}</div></div>
    </div>
  );
}
function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><Icon path={icon} className="w-4 h-4" /></div>
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}
function ChecklistItem({ n, children, highlight }: { n: number; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex gap-3 items-start p-2.5 rounded-lg ${highlight ? "bg-amber-50 border border-amber-200" : ""}`}>
      <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${highlight ? "bg-amber-500 text-white" : "bg-slate-700 text-white"}`}>{n}</div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}
function AskTile({ icon, situation, where }: { icon: string; situation: string; where: string }) {
  return (
    <div className="flex gap-3 items-center bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Icon path={icon} /></div>
      <div><div className="font-semibold text-slate-800 text-sm">{situation}</div><div className="text-gray-500 text-[13px]">{where}</div></div>
    </div>
  );
}

export const GUIDELINE_SECTIONS: { id: string; title: string; icon: string; owner: string; version: string; lastReviewed: string; body: React.ReactNode }[] = [
  {
    id: "images", title: "How to use our images", icon: ICONS.image, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <FilecampCard />
      <Section icon={ICONS.info} title="Where images come from">
        <p className="text-sm text-slate-600 mb-2">Every approved image lives in <strong>Filecamp</strong> (link above). If an image is not in the library, it is not approved — even if it appeared on our Instagram last week.</p>
        <p className="text-sm text-slate-600">Global assets are the most common trap — overseas markets shoot different colourways/configs. <strong>If it's not in the AU library, assume it's not cleared for AU use.</strong></p>
      </Section>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <Section icon={ICONS.check} title="You can do this yourself">
          <div className="space-y-2">
            <DoCard title="Use as supplied" note="Any library image, unaltered, on approved surfaces" />
            <DoCard title="Crop to a standard ratio" note="Social/print crop OK — product stays whole, logo untouched" />
            <DoCard title="Share the library link" note="Send the Filecamp link straight to a retail partner" />
          </div>
        </Section>
        <Section icon={ICONS.help} title="Ask Marketing first">
          <div className="space-y-2">
            <DontCard title="Any crop that cuts the product" note="" />
            <DontCard title="Text, price or a badge added" note="" />
            <DontCard title="Used next to a competitor product" note="" />
            <DontCard title="Creator or influencer imagery" note="Different rules below" />
            <DontCard title="New retailer-commissioned photography" note="" />
          </div>
        </Section>
      </div>
      <Section icon={ICONS.camera} title="Influencer, creator and UGC imagery">
        <p className="text-sm text-slate-600">Creator content is licensed to us, for our channels, for a fixed term. <strong className="text-rose-600">It cannot be supplied to retailers</strong>, and cannot be used in print, POS or paid social without a written extension. Retailer asks for "that reel"? Answer is no — offer the equivalent library asset instead.</p>
      </Section>
      <Section icon={ICONS.child} title="Images featuring children">
        <p className="text-sm text-slate-600">Covered by a signed release (held in the Command Centre) specifying where/how long it can appear. Ask Marketing to check before committing new-context child photography to print — do not assume.</p>
      </Section>
      <Section icon={ICONS.clock} title="Expiry">
        <p className="text-sm text-slate-600">Some assets carry an end date — expired ones are archived, not deleted. <strong>Local copies are the single biggest source of expired-asset breaches</strong> — always check Filecamp before reusing a saved file.</p>
      </Section>
    </>,
  },
  {
    id: "store-social", title: "Store social promotions", icon: ICONS.chat, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <p className="mb-4 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">💬 This is the section to send when a store asks "can you share our post".</p>
      <Section icon={ICONS.check} title="We will">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DoCard title="Reshare to our story" note={<>Within 1 business day if it passes the checklist below <span className="text-emerald-500">(proposed)</span></>} />
          <DoCard title="Supply approved artwork" note="Sized to spec, via the Artwork Request form" />
          <DoCard title="Supply product imagery + copy" note="From Filecamp, for the retailer's own channels" />
          <DoCard title="Support a Tune-Up Day" note="Where demand + operating requirements are met" />
          <DoCard title="Support co-funded activity" note="Via the trade marketing agreement + your State Manager" />
          <DoCard title="Product training & demo support" note="Arranged through your rep" />
        </div>
      </Section>
      <Section icon={ICONS.cross} title="We will not">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DontCard title="Post a store promo to our grid" note="Reads as national + creates channel conflict — story reshare only" />
          <DontCard title="Supply free product" note="Trade spend — use the Product Request form" />
          <DontCard title="Artwork with a price, no approved promo" note="Needs confirmed RRP + sign-off" />
          <DontCard title="Alter the logo" note="No recolour/crop/stretch/effects/busy backgrounds" />
          <DontCard title="Approve artwork same day" note="See lead times — emergencies handled case by case" />
          <DontCard title="Supply creator content to retailers" note="Licensing doesn't extend that far" />
          <DontCard title="Name or compare a competitor" note="Including side-by-side imagery" />
          <DontCard title="Approve safety/medical/clinical claims" note="See claims below" />
        </div>
      </Section>
      <Section icon={ICONS.check} title="Reshare checklist — all 8 must pass">
        <div className="space-y-1">
          <ChecklistItem n={1}>Correct brand handle tagged</ChecklistItem>
          <ChecklistItem n={2}>Product names spelled/styled correctly, incl. trademarks</ChecklistItem>
          <ChecklistItem n={3}>Imagery from the approved library, or accurate in-store photography</ChecklistItem>
          <ChecklistItem n={4}>Price shown is current RRP, or no price</ChecklistItem>
          <ChecklistItem n={5}>No discounting breaching agreed pricing / promo window</ChecklistItem>
          <ChecklistItem n={6}>No competitor product visible or named</ChecklistItem>
          <ChecklistItem n={7}>No safety, medical or developmental claim</ChecklistItem>
          <ChecklistItem n={8} highlight>Product shown safely — harness done up, capsule correctly installed, child correctly positioned, brake on if stationary</ChecklistItem>
        </div>
        <p className="text-xs text-gray-400 mt-2">⚠️ Point 8 is the one that catches people — tell stores up front, not at the point of refusal.</p>
      </Section>
      <Section icon={ICONS.info} title="Claims we never make or endorse">
        <div className="flex flex-wrap gap-2">
          {["No \"safest\"", "No medical/developmental claim", "No sleep claim", "No clinical language"].map(c => <span key={c} className="text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100 rounded-full px-3 py-1.5">{c}</span>)}
        </div>
        <p className="text-sm text-slate-600 mt-2">Applies to store posts, retailer EDMs, product pages and our own content. If a claim needs a footnote to be true, it does not go out.</p>
      </Section>
    </>,
  },
  {
    id: "instagram", title: "Instagram guidelines", icon: ICONS.at, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <Section icon={ICONS.at} title="Handles">
        <p className="text-sm text-slate-600">Tag the brand, not Coolkidz (the distributor, not consumer-facing). Full handle list: <TBC /></p>
      </Section>
      <Section icon={ICONS.hash} title="Naming and trademarks">
        <div className="space-y-2">
          <DoCard title="UPPAbaby" note="Capital U, capital P, capital P, lowercase b — not Uppababy, not UppaBaby" />
          <DoCard title="smarTrike Wonder™, Wonder+™, Wonder max™" note={'™ on first use, lowercase "max"'} />
          <DoCard title="Model generations as supplied" note="e.g. Vista V3, not vista v3" />
        </div>
      </Section>
      <Section icon={ICONS.info} title="Terminology">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-3 py-1.5">Pram, not stroller</span>
          <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-3 py-1.5">Capsule, not infant car seat</span>
          <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-3 py-1.5">Use the product's own feature names</span>
        </div>
      </Section>
      <Section icon={ICONS.hash} title="Tagging and hashtags">
        <p className="text-sm text-slate-600">Tag the brand handle in the post (not just caption), tag the retailer where relevant. Brand hashtag list: <TBC /></p>
      </Section>
      <Section icon={ICONS.chat} title="When a customer complains in comments">
        <DontCard title="Do not answer product faults, warranty or safety concerns in comments" note="Direct to help.uppababy.com.au (or the relevant brand path). Never delete a complaint. Never argue." />
      </Section>
      <Section icon={ICONS.ad} title="Paid amplification">
        <p className="text-sm text-slate-600">Retailers must not run paid social on our brand assets without agreement. Boosting an already-approved organic post is usually fine; anything beyond that goes through your State Manager. <TBC /> confirm where the line sits.</p>
      </Section>
    </>,
  },
  {
    id: "website", title: "Website guidelines", icon: ICONS.code, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <Section icon={ICONS.code} title="Product copy">
        <p className="text-sm text-slate-600 mb-2">Use supplied copy as-is — rewritten copy is where most compliance risk enters the channel.</p>
        <div className="space-y-2">
          <DontCard title="Shortened or altered product name in the page title" note="" />
          <DontCard title="Feature lists adding capabilities the product doesn't have" note="" />
          <DontCard title="Age/weight/height ranges from the US or UK spec" note="Must match the AU manual" />
        </div>
      </Section>
      <Section icon={ICONS.image} title="Imagery">
        <div className="space-y-2">
          <DoCard title="Library assets only" note="At supplied resolution" />
          <DontCard title="Badges, sale flashes or shipping claims overlaid" note="" />
          <DontCard title="Lifestyle imagery not matching the page's colourway" note="" />
        </div>
      </Section>
      <Section icon={ICONS.price} title="Pricing">
        <p className="text-sm text-slate-600">Current RRP unless an approved promotion is running, ending on the agreed date.</p>
      </Section>
      <Section icon={ICONS.ad} title="Brand terms and search">
        <p className="text-sm text-slate-600">No bidding on our brand / brand-plus-model terms without written agreement, no brand name in a domain/subdomain/store name. <TBC /> confirm current position, align with trading terms.</p>
      </Section>
      <Section icon={ICONS.home} title="Our own brand sites — source of truth">
        <p className="text-sm text-slate-600 mb-2">If a retailer page disagrees with our site, our site wins and the retailer page gets corrected.</p>
        <div className="flex flex-wrap gap-1.5">
          {["uppababy.com.au", "fridaaustralia.com.au", "nanit.com.au", "smartrike.com.au", "hannie.com.au", "magicbabyproducts.com.au", "wonderfold.com.au", "gaia-baby.com.au", "mamave.com.au", "matchstickmonkey.com.au", "zazu-kids.com.au", "miamily.com.au"].map(s => (
            <span key={s} className="text-[11px] font-mono bg-slate-50 text-slate-600 border border-slate-200 rounded px-2 py-1">{s}</span>
          ))}
        </div>
      </Section>
    </>,
  },
  {
    id: "product-and-gifting", title: "Free product, samples & gifting", icon: ICONS.gift, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <DontCard title="Marketing does not hold budget for free product" note={'Not for retailer competitions, staff incentives, customer giveaways, display units, or "just one for the manager".'} />
      <p className="text-sm text-slate-600 my-3">All of it is trade spend — goes through your <strong>Sales Manager</strong>, via the Product Request form in this Hub, and needs a stated return: placement, posts, staff training, a sell-through commitment, something.</p>
      <Section icon={ICONS.check} title="The two exceptions">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DoCard title="Swatches and fabric samples" note="Stock dependent, via the Swatch Request form" />
          <DoCard title="Influencer / creator seeding" note="Marketing gifting budget, planned by brand — not ad hoc" />
        </div>
      </Section>
      <p className="text-xs text-gray-400 mt-3">If someone tells you Marketing approved free product verbally, it did not happen — send them the form.</p>
    </>,
  },
  {
    id: "tune-up-days", title: "Tune-Up Days", icon: ICONS.wrench, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <Section icon={ICONS.info} title="What it is">
        <p className="text-sm text-slate-600">A free maintenance service event at a store, and the proof point for our 3-Year Warranty with Lifetime Service Support message — a <strong>selling tool</strong>, not just servicing.</p>
      </Section>
      <Section icon={ICONS.cross} title="Non-negotiables">
        <div className="space-y-2">
          <DontCard title="Times can't change once live on Eventbrite" note="Stores must confirm timing before go-live" />
          <DontCard title="The $20 refundable booking fee always stays" note="No-show insurance, refunded 2–5 days after check-in" />
          <DontCard title="Store must be approved before publishing" note="By Baby Bunting or the independent retailer" />
        </div>
      </Section>
      <Section icon={ICONS.clock} title="The shape of a day">
        <p className="text-sm text-slate-600">10:00–14:00 most states, 11:00–14:00 in SA. 15-min appointments, max 15 participants, 30-min lunch scheduled in. Two staff where possible: check-in/queue, and service.</p>
      </Section>
      <Section icon={ICONS.chat} title="Comms cadence">
        <div className="flex flex-wrap gap-2">
          {["EDM · 7 days out", "SMS · 4 days out", "Waitlist EDM · 5 days out", "Registrations close · 4 days prior", "Survey on check-in"].map(c => <span key={c} className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-3 py-1.5">{c}</span>)}
        </div>
      </Section>
      <Section icon={ICONS.info} title="South Australia">
        <p className="text-sm text-slate-600">Every second month, Marleston only — consistently lower demand.</p>
      </Section>
      <Section icon={ICONS.wrench} title="Warranty issues on the day">
        <DontCard title="Do not attempt to resolve" note="Direct to help.uppababy.com.au and hand over a Warranty Procedure Card" />
      </Section>
      <Section icon={ICONS.check} title="Nominating a store">
        <p className="text-sm text-slate-600">Use the Tune-Up Nomination form (this Hub). Bring evidence: customer requests, pram sales, prior attendance. Reviewed in a batch when the next six-month schedule is built.</p>
      </Section>
    </>,
  },
  {
    id: "who-to-ask", title: "Who to ask", icon: ICONS.help, owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <AskTile icon={ICONS.image} situation="Need artwork" where="Artwork Request form (this Hub)" />
      <AskTile icon={ICONS.camera} situation="Need swatches or fabric samples" where="Swatch Request form (this Hub)" />
      <AskTile icon={ICONS.wrench} situation="Want a Tune-Up Day at a store" where="Tune-Up Nomination form (this Hub)" />
      <AskTile icon={ICONS.gift} situation="Want free product for anything" where="Product Request form → Sales leadership" />
      <AskTile icon={ICONS.chat} situation="Store wants us to share their post" where="Check the reshare checklist first, then tag us" />
      <AskTile icon={ICONS.code} situation="Retailer page has wrong copy or imagery" where="Flag to Marketing with the URL" />
      <AskTile icon={ICONS.child} situation="Customer complaint or warranty issue" where="Warranty helpdesk, help.uppababy.com.au" />
      <AskTile icon={ICONS.help} situation="Not sure?" where="Ask before it goes to print, not after" />
    </div>,
  },
];
