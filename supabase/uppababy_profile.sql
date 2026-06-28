-- UPPABABY brand profile · Coolkidz Briefing Engine
-- Adapted to this dashboard: brand_profiles table + siteUrl/marketContext + blog channel.
insert into brand_profiles (slug, name, tier, profile) values
('uppababy', 'UPPAbaby', 'A', $json$
{
  "essence": "Safety. Trust. Built for real life.",
  "brandLine": "The premium brand parents trust",
  "positioning": "UPPAbaby is the premium, safety-led brand parents trust to support them through their parenting journey. Thoughtfully designed, rigorously tested, and built for real life.",
  "hero": "Vista is the flagship stroller and Cruz the compact sibling. Mesa is the 2026 launch focus and the infant car seat hero. Lead with the product that fits the moment, and treat Mesa as the priority launch story for the year.",
  "siteUrl": "https://uppababy.com.au",
  "marketContext": "premium prams, strollers and car seats in Australia",
  "tone": [
    "Reassuring, confident and practical",
    "Parent-first, not technical or sales-led",
    "Premium but approachable, never clinical or intimidating"
  ],
  "messageHierarchy": {
    "brand": "Safety, trust, design and confidence for parents at every stage",
    "category": "Thoughtful innovation that makes everyday parenting easier and safer",
    "product": "Clear articulation of the parent problem being solved, supported by practical benefits",
    "proof": "Safety testing, certifications, awards, warranty, real-parent usage and advocacy"
  },
  "proofPoints": [
    "Safety testing and certifications (verify current AU status before use)",
    "Awards (verify current and AU-relevant before use)",
    "Warranty terms",
    "Real-parent usage and advocacy"
  ],
  "audience": {
    "primary": "First-time parents, 28 to 38, overwhelmed, research-driven and safety-first. They enter the category early, in trimester 1 to 2. Translate features into real-life benefit and never overwhelm them technically.",
    "split": "Second-time parents are more confident and upgrade-focused, the strongest opportunity for Mesa, accessories and travel systems. Influencers of purchase are midwives, maternity and child health nurses, hospital educators and parenting communities, who shape decisions early."
  },
  "pillars": [
    {"id": "safety", "name": "Safety & Trust", "desc": "Safety credentials, testing and trust-building, the core of the brand."},
    {"id": "design", "name": "Design & Functionality", "desc": "Thoughtful innovation and design that makes everyday parenting easier."},
    {"id": "proof", "name": "Real Parent Proof", "desc": "Real parents, real installs, honest usage and advocacy."},
    {"id": "education", "name": "Education & Confidence", "desc": "Layered education (simple to deeper to expert) that drives confident decisions."}
  ],
  "moments": [
    {"id": "mesa", "name": "Mesa Launch (flagship 2026)", "pillar": "safety", "objective": "Establish Mesa as the default premium infant car seat", "focus": "One core parent-first story, phased pre-launch, launch and post-launch. Safety, design and real-life ease. D2C-exclusive (not ranged at Baby Bunting). All safety and standards claims verified before use."},
    {"id": "pregnancy", "name": "Pregnancy and Early Research (Trimester 1 to 2)", "pillar": "education", "objective": "Influence preference early with reassurance and education", "focus": "Awareness, reassurance and education while parents are first researching. Pregnancy-stage navigation and the right product at the right time."},
    {"id": "comparison", "name": "Comparison and Decision Support", "pillar": "education", "objective": "Win high-consideration decisions", "focus": "Vista vs Cruz, Mesa vs competitors, comparison tools, what to know before you buy. Feature comparisons truthful and substantiable."},
    {"id": "travelsystem", "name": "Travel Systems and D2C Bundles", "pillar": "design", "objective": "Grow AOV and give a reason to buy direct", "focus": "Mesa plus stroller bundles, D2C-exclusive products no longer at Baby Bunting (Mesa, Ridge, Parent Organiser, Ganoosh, Changing Bag)."},
    {"id": "lifecycle", "name": "Post-Purchase, Accessories and Lifecycle", "pillar": "education", "objective": "Grow LTV and accessory attach", "focus": "Trimester and child-age CRM journeys, cross-sell of bassinets, adapters and accessories, replacement parts, referral and advocacy."},
    {"id": "healthcare", "name": "Healthcare and Professional Trust", "pillar": "safety", "objective": "Build early-funnel trust through professionals", "focus": "Hospital bags, antenatal class support, midwife and health-professional education kits, fit-check and installation confidence days. Education, not sales."},
    {"id": "retail", "name": "Retail Launch and Independent Support", "pillar": "proof", "objective": "Support disciplined retail and grow independents", "focus": "Baby Bunting under disciplined terms, 5 pilot independent stores, staff training and certification, POS, field and merch support. Reduce reliance on any single partner."},
    {"id": "expo", "name": "Tradeshow and Expo Activation", "pillar": "proof", "objective": "Acquire new D2C customers and capture data", "focus": "PBC and OFB expos across the year, updated stand design, education-led selling, CRM capture, bundle-led conversion. A D2C growth channel, not sales-only."},
    {"id": "advocacy", "name": "Reviews, UGC and Advocacy", "pillar": "proof", "objective": "Reinforce social proof and referral", "focus": "Real installs in real cars, day-in-the-life usage, honest Q&A, reviews and referral. Screen UGC for inaccurate safety or fit claims before amplifying."}
  ],
  "channels": [
    {"id": "social", "name": "Organic social (Instagram and YouTube)", "presets": "IG feed 1080x1350, Story/Reel 1080x1920, carousel; YouTube long-form install and comparison", "role": "Education, installs, comparisons, community and proof. Consideration and assisted conversion, not last-click sales."},
    {"id": "blog", "name": "Blog / SEO", "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema", "role": "SEO-led education that ranks and supports PDP and retail conversion."},
    {"id": "paid", "name": "Paid media", "presets": "Paid social 1080x1350 and 1080x1920, video 9:16 and 16:9, Search RSA", "role": "Demand generation and high-intent capture. Drives D2C, supports hero launches, retargets education audiences."},
    {"id": "edm", "name": "EDM and SMS (CRM)", "presets": "Email 600px modular; SMS for time-sensitive utility (launch, delivery, fit-check, lifecycle)", "role": "Retention and lifecycle revenue engine. Trimester journeys, accessories attach, LTV. Education-first, promotions selective."},
    {"id": "pdp", "name": "D2C / website", "presets": "Pregnancy-stage navigation, comparison tools, safety and certification hubs, bundle and PDP modules", "role": "Primary growth engine, education hub and data ownership. Complements retail, never undercuts."},
    {"id": "affiliate", "name": "Affiliate and partnerships", "presets": "Buying guides, comparison articles, what-to-know-before-you-buy, evergreen review content", "role": "Efficient, incremental acquisition via trusted publishers and selective loyalty/cashback (Cashrewards, ShopBack). Informed guides, not deal-driven promoters."},
    {"id": "healthcare", "name": "Healthcare and hospital", "presets": "Hospital bag education cards, antenatal materials, midwife education kits, fit-check day collateral", "role": "Early-funnel trust through professionals. Safety, correct usage and real-life practicality. Supportive partner, not sales-driven."},
    {"id": "retail", "name": "Retail and trade (Baby Bunting, independents)", "presets": "POS, merchandising, staff training and certification decks, demo videos, retail-ready EDM/digital", "role": "Baby Bunting for scale under disciplined terms; independents (5 pilot stores) as premium custodians and advocates. Premium execution, no race-to-the-bottom."},
    {"id": "marketplace", "name": "Amazon", "presets": "Listing content, A+ content, buy-box and pricing control", "role": "Controlled convenience and defensive presence. Capture high-intent demand while protecting pricing and content. Capped contribution."},
    {"id": "event", "name": "Tradeshows and expos", "presets": "Stand graphics, demo units, education assets, CRM capture tools", "role": "D2C growth channel. PBC and OFB expos across the year. Brand presence and new-customer acquisition."}
  ],
  "products": [
    {"name": "Vista", "type": "Stroller (flagship)", "note": "Priority product, higher affiliate commission, education-led coverage."},
    {"name": "Cruz", "type": "Stroller (compact)", "note": "Compared against Vista in decision-support content."},
    {"name": "Mesa", "type": "Infant car seat (2026 launch)", "note": "D2C-exclusive, not ranged at Baby Bunting. Safety and AS/NZS 1754 standards claims must be verified before any use."},
    {"name": "Ridge", "type": "Stroller", "note": "D2C-exclusive."},
    {"name": "Parent Organiser", "type": "Accessory", "note": "D2C-exclusive."},
    {"name": "Ganoosh", "type": "Footmuff accessory", "note": "D2C-exclusive."},
    {"name": "Changing Bag", "type": "Accessory", "note": "D2C-exclusive."}
  ],
  "mandatory": [
    "Lead with the parent problem, not the product feature.",
    "Plain-language. Translate features into real-life benefit and never overwhelm technically.",
    "Use proof points where relevant: safety testing, certifications, awards, warranty, real-parent advocacy. All verified and current.",
    "One core story per launch, adapted across channels, not diluted.",
    "D2C complements retail and never undercuts retail partners on price."
  ],
  "exclusions": [
    "No deep or frequent discounting and no race-to-the-bottom mechanics.",
    "No promotional urgency on key launches or safety-led products.",
    "No over-reliance on any single retail partner or paid channel.",
    "No clinical, intimidating, technical or sales-led tone.",
    "No measuring brand and education work on last-click attribution."
  ],
  "nonNegotiables": [
    "We will not chase short-term revenue through deep or frequent discounting.",
    "We will not over-invest in any single retail partner.",
    "We will not measure brand and education channels on last-click attribution.",
    "We will not compromise safety, education or trust for scale.",
    "We will not pursue growth that undermines long-term parent confidence."
  ],
  "standingFlags": [
    {"level": "must", "note": "Car seat and child-restraint safety and standards claims must be verified before publishing. Do not state or imply AS/NZS 1754 certification, crash-test results, or safest or comparative safety, unless verified and substantiated for the specific Australian product. Confirm Mesa AU certification status before any safety claim."},
    {"level": "must", "note": "No absolute or guarantee-style safety claims such as keeps your baby safe or prevents injury. Safety language must be accurate and must not overstate protection."},
    {"level": "must", "note": "Do not assert awards, certifications, testing or warranty terms that are not current and verified for the Australian product and market."},
    {"level": "check", "note": "Comparative claims (Mesa vs competitors, Vista vs Cruz) must be truthful, substantiable and not misleading under Australian Consumer Law. Feature comparisons are fine; safety comparisons need evidence."},
    {"level": "check", "note": "Installation, fit and usage guidance is safety-critical. Content must be accurate and should point parents to professional fitting and the manual, not replace proper installation. Fit-check content is guidance, not certification."},
    {"level": "check", "note": "Health-professional endorsements (midwife or nurse recommended) must be genuine and substantiated, and must not imply clinical or medical endorsement of safety beyond what is true."}
  ]
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
