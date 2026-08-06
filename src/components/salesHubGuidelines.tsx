// Sales Hub guideline pages — content sourced from "Working With Marketing"
// (Marketing, draft v0.1). No MDX pipeline exists in this repo, so this lives
// as plain JSX rather than separate .mdx files — still versioned in git,
// still easy to edit. TBC markers are kept literal; don't quietly resolve them.

const Table = ({ rows }: { rows: [string, string][] }) => (
  <table className="w-full text-sm border-collapse mb-3">
    <tbody>{rows.map(([a, b], i) => (
      <tr key={i} className="border-b border-gray-100 last:border-0">
        <td className="py-2 pr-4 font-semibold text-slate-700 align-top whitespace-nowrap">{a}</td>
        <td className="py-2 text-slate-600">{b}</td>
      </tr>
    ))}</tbody>
  </table>
);
const TBC = () => <span className="text-amber-600 font-bold">TBC</span>;

export const GUIDELINE_SECTIONS: { id: string; title: string; owner: string; version: string; lastReviewed: string; body: React.ReactNode }[] = [
  {
    id: "images", title: "How to use our images", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <h3 className="font-bold text-slate-800 mb-2">Where images come from</h3>
      <p className="mb-3">Every approved image lives in the brand asset library. If an image is not in the library, it is not approved — even if it appeared on our Instagram last week.</p>
      <p className="mb-3"><strong>Do not source imagery from:</strong> our website, our Instagram grid, a Google image search, a creator's own feed, the global brand's overseas site, or a retailer's existing artwork. Global assets are the most common trap — if it is not in the AU library, assume it is not cleared for AU use.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">What you can do without asking Marketing</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li>Use any library image as supplied, unaltered, on approved surfaces</li>
        <li>Crop to a standard social or print ratio — product must stay whole, logo untouched</li>
        <li>Share the library link with a retail partner</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">What needs Marketing</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li>Any crop that cuts the product</li>
        <li>Any image with text, price or a badge added</li>
        <li>Any image used next to a competitor product</li>
        <li>Any use of a creator or influencer image</li>
        <li>Any new photography commissioned by a retailer featuring our product</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Influencer, creator and UGC imagery</h3>
      <p className="mb-3">Creator content is licensed to us, for our channels, for a fixed term — that licence almost never extends to retail partners, and almost never extends to paid media. <strong>Creator content cannot be supplied to retailers</strong>, and cannot be used in print, POS or paid social without a written extension. If a retailer asks for a specific reel, the answer is no — offer the equivalent brand asset from the library instead.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Images featuring children</h3>
      <p className="mb-3">Covered by a signed release specifying where it can appear and for how long. Releases are held in the Command Centre — ask Marketing to check the release before committing new-context child photography to print. Do not assume.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Expiry</h3>
      <p>Some assets carry an end date. Expired assets are archived, not deleted — if you have a local copy, check the library before reusing it. <strong>Local copies are the single biggest source of expired-asset breaches.</strong></p>
    </>,
  },
  {
    id: "store-social", title: "Store social promotions", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <p className="mb-3 text-xs text-gray-400">This is the section to send when a store asks "can you share our post".</p>
      <h3 className="font-bold text-emerald-700 mb-2">We will</h3>
      <Table rows={[
        ["Reshare to our story", <>When a store tags us in a post that meets the checklist below, we'll reshare to our brand story, usually within 1 business day <span className="text-gray-400 text-xs">(proposed)</span>.</>],
        ["Supply approved artwork", "Sized to the retailer's spec, through the Artwork Request form, with proper lead time."],
        ["Supply product imagery and copy", "From the asset library, for the retailer's own channels and product pages."],
        ["Support a Tune-Up Day", "Where consumer demand supports it and the store meets operating requirements."],
        ["Support co-funded activity", "Through the trade marketing agreement, arranged with your State Manager."],
        ["Provide product training and demo support", "Arranged through your rep."],
      ] as any} />
      <h3 className="font-bold text-rose-600 mb-2 mt-4">We will not</h3>
      <Table rows={[
        ["Post a store promotion to our grid", "Our feed is brand, not retail — reads as a national offer and creates channel conflict. Story reshare only."],
        ["Supply free product for giveaways/comps/staff incentives/seeding", "Trade spend, not marketing budget — goes through your State Manager + National Sales Manager via the Product Request form."],
        ["Create artwork carrying a price without an approved promotion", "Needs a confirmed RRP and a signed-off promotion."],
        ["Alter the logo", "No recolouring, cropping, stretching, effects, or busy backgrounds."],
        ["Approve artwork same day", "See lead times. Emergencies handled case by case, and cost us elsewhere."],
        ["Supply creator or influencer content to retailers", "Licensing does not extend that far."],
        ["Support content naming/comparing a competitor", "Including \"better than\", side-by-side imagery, competitor product in frame."],
        ["Approve safety, medical or clinical claims", "See claims section below."],
      ] as any} />
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Checklist for a story reshare</h3>
      <p className="mb-2 text-xs text-gray-500">All must be true — if any fail, we come back with what needs to change rather than reshare and correct later.</p>
      <ol className="list-decimal pl-5 mb-3 space-y-1">
        <li>Correct brand handle tagged</li>
        <li>Product names spelled/styled correctly, including trademarks</li>
        <li>Imagery from the approved library, or the store's own accurate in-store photography</li>
        <li>Any price shown is current RRP, or no price</li>
        <li>No discounting breaching agreed pricing or promo window</li>
        <li>No competitor product visible or named</li>
        <li>No safety, medical or developmental claim</li>
        <li><strong>Product shown in a correct and safe configuration</strong> (harness done up, capsule correctly installed, child correctly positioned, brake on where stationary)</li>
      </ol>
      <p className="mb-3 text-xs text-gray-500">Point 8 is the one that catches people — tell stores up front rather than at the point of refusal.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Claims we never make or endorse</h3>
      <p>No "safest", no "safest on the market", no medical or developmental benefit, no sleep claim, no clinical language. Applies to store posts, retailer EDMs, product pages and our own content. If a claim needs a footnote to be true, it does not go out.</p>
    </>,
  },
  {
    id: "instagram", title: "Instagram guidelines", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <h3 className="font-bold text-slate-800 mb-2">Handles</h3>
      <p className="mb-3">Each brand has its own handle — tag the brand, not Coolkidz (the distributor, not a consumer-facing brand). Full handle list: <TBC /></p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Naming and trademarks</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li><strong>UPPAbaby</strong>: capital U, capital P, capital P, lowercase b. Not Uppababy, not UppaBaby.</li>
        <li><strong>smarTrike Wonder™, Wonder+™, Wonder max™</strong>: trademark symbols on first use, lowercase "max".</li>
        <li>Model generations as supplied — e.g. Vista V3, not vista v3.</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Terminology</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li><strong>Pram</strong>, not stroller, for the AU market</li>
        <li><strong>Capsule</strong>, not infant car seat</li>
        <li>Use the product's own feature names, don't invent descriptive ones</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Tagging and hashtags</h3>
      <p className="mb-3">Tag the brand handle in the post (not just caption), tag the retailer where relevant. Brand hashtag list: <TBC /></p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Customer complaints in comments</h3>
      <p className="mb-3">Do not answer product faults, warranty questions or safety concerns in comments. Direct to the warranty helpdesk at help.uppababy.com.au (or the relevant brand path). Never delete a complaint. Never argue.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Paid amplification</h3>
      <p>Retailers must not run paid social using our brand assets without agreement — competes with our own media buy and inflates our costs. Boosting an organic post that already met the reshare checklist is usually fine; anything beyond that goes through your State Manager. <TBC /> confirm where the line sits.</p>
    </>,
  },
  {
    id: "website", title: "Website guidelines (retailer product pages)", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <h3 className="font-bold text-slate-800 mb-2">Product copy</h3>
      <p className="mb-3">Retailers use supplied copy — written for AU compliance, approved feature names, no unsubstantiated claims. Rewritten copy is where most compliance risk enters the channel.</p>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li>Product names must not be shortened or altered in the page title</li>
        <li>Feature lists must not add capabilities the product doesn't have</li>
        <li>Age/weight/height ranges must match the AU manual, not US/UK spec</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Imagery</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li>Library assets only, at supplied resolution</li>
        <li>No retailer badges, sale flashes or shipping claims overlaid on product imagery</li>
        <li>Lifestyle imagery must match the colourway sold on that page</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Pricing</h3>
      <p className="mb-3">Current RRP unless an approved promotion is running, ending on the agreed date.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Brand terms and search</h3>
      <p className="mb-3">Retailers should not bid on our brand terms or brand-plus-model terms without written agreement, and should not use a brand name in a domain/subdomain/store name. <TBC /> confirm current position, align with existing trading terms.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Our own brand sites</h3>
      <p>Source of truth for specs, RRP and imagery — if a retailer page disagrees, our site wins and the retailer page gets corrected. Sites: uppababy.com.au, fridaaustralia.com.au, nanit.com.au, smartrike.com.au, hannie.com.au, magicbabyproducts.com.au, wonderfold.com.au, gaia-baby.com.au, mamave.com.au, matchstickmonkey.com.au, zazu-kids.com.au, miamily.com.au</p>
    </>,
  },
  {
    id: "product-and-gifting", title: "Free product, samples and gifting", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <p className="mb-3"><strong>Marketing does not hold budget for free product.</strong> Not for retailer competitions, staff incentives, customer giveaways, display units, or "just one for the manager".</p>
      <p className="mb-3">All of it is trade spend — goes through your State Manager and the National Sales Manager, via the Product Request form, and needs a stated return: placement, posts, staff training, a sell-through commitment, something.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">The two exceptions</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li><strong>Swatches and fabric samples</strong> — stock dependent, via the Swatch Request form</li>
        <li><strong>Influencer and creator seeding</strong> — comes out of the marketing gifting budget, planned by brand, not requested ad hoc</li>
      </ul>
      <p>If someone tells you Marketing approved free product verbally, it did not happen. Send them the form.</p>
    </>,
  },
  {
    id: "tune-up-days", title: "Tune-Up Days", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <>
      <p className="mb-3"><strong>What it is.</strong> A free maintenance service event hosted at a store, and the visible proof point for our 3-Year Warranty with Lifetime Service Support message — a selling tool, not just servicing.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">The non-negotiables</h3>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li>Once an event is published on Eventbrite and promoted, times cannot be changed — stores must confirm timing before go-live</li>
        <li>The $20 refundable booking fee stays — attendance insurance against no-shows, refunded 2–5 days after check-in</li>
        <li>Stores must be approved by Baby Bunting or the independent retailer before publishing, including date/time/location</li>
      </ul>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">The shape of a day</h3>
      <p className="mb-3">10:00–14:00 most states, 11:00–14:00 in SA. Fifteen-minute appointments, max 15 participants, 30-minute lunch scheduled in. Two staff wherever possible: one on check-in/queue/questions, one performing the service.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Comms cadence</h3>
      <p className="mb-3">EDM 7 days out, SMS 4 days out, waitlist EDM 5 days out, registrations close 4 days prior, post-event survey on check-in.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">South Australia</h3>
      <p className="mb-3">Every second month, Marleston only, on consistently lower demand.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Warranty issues on the day</h3>
      <p className="mb-3">Do not attempt to resolve — direct the customer to submit a ticket at help.uppababy.com.au and hand them a Warranty Procedure Card.</p>
      <h3 className="font-bold text-slate-800 mb-2 mt-4">Nominating a store</h3>
      <p>Use the Tune-Up Nomination form (in this Hub). Bring evidence of demand: customer requests, pram sales, prior attendance. Nominations are reviewed when the next six-month schedule is built.</p>
    </>,
  },
  {
    id: "who-to-ask", title: "Who to ask", owner: "Marketing", version: "0.1", lastReviewed: "draft",
    body: <Table rows={[
      ["Need artwork", "Artwork Request form (this Hub)"],
      ["Need swatches or fabric samples", "Swatch Request form (this Hub)"],
      ["Want a Tune-Up Day at a store", "Tune-Up Nomination form (this Hub)"],
      ["Want free product for anything", "Product Request form (this Hub) — routes to Sales leadership"],
      ["Store wants us to share their post", "Check it against the reshare checklist first, then tag us"],
      ["Retailer page has wrong copy or imagery", "Flag to Marketing with the URL"],
      ["Customer complaint or warranty issue", "Warranty helpdesk, help.uppababy.com.au"],
      ["Not sure", "Ask before it goes to print, not after"],
    ] as any} />,
  },
];
