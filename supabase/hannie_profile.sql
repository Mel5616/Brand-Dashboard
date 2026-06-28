-- HANNIE brand profile · Coolkidz Briefing Engine
-- Adapted: brand_profiles table + siteUrl/marketContext + blog channel.
insert into brand_profiles (slug, name, tier, profile) values
('hannie', 'Hannie', 'B', $json$
{
  "essence": "Freedom disguised as furniture. Designed for movement, built for moments.",
  "brandLine": "Designed for movement. Built for moments.",
  "positioning": "Hannie is the premium portable high chair for design-conscious modern families. It sits in the white space between low-cost functional seats that compromise on aesthetics and beautiful but immobile furniture-style chairs. Scandinavian design sensibility meets the everyday ease of Australian family life: a chair that folds flat, travels easily, and lives comfortably within a modern home rather than cluttering it.",
  "hero": "Hannie is a single hero product, the portable high chair, offered in a range of neutral colourways. There is no sub-range to navigate, so lead every story with the product in real-life context (cafe, home, travel) rather than a feature list. Treat the launch itself as the priority story for the year.",
  "siteUrl": "https://hannie.com.au",
  "marketContext": "portable high chairs and baby travel gear in Australia",
  "tone": [
    "Warm, minimal and intentional, never cute or childish",
    "Calm and reassuring, never frantic or over-explained",
    "Confident and design-led, spoken like a homewares brand, not a baby-gear brand"
  ],
  "messageHierarchy": {
    "brand": "Freedom and design for modern families. A seat that keeps up with family life wherever it happens.",
    "category": "A premium portable high chair that combines genuine portability with design integrity, the practical and the beautiful in one.",
    "product": "Clear articulation of the real-life moment Hannie solves: eating out, travelling, visiting family, small-space living. Folds small, holds strong.",
    "proof": "Real-world usage, authentic customer advocacy, verified reviews, and design credibility. Genuine proof over promotional volume."
  },
  "proofPoints": [
    "Real families using Hannie in everyday Australian settings (cafe, home, travel)",
    "Verified customer reviews and ratings (do not state a count until achieved and substantiated)",
    "Design credibility: Scandinavian aesthetic, neutral palette, styled alongside homewares",
    "Safety and build quality (verify exact certification and standard before any claim)"
  ],
  "audience": {
    "primary": "Urban parents 25 to 40, first-time or early-stage, balancing identity and practicality. They live in apartments or smaller homes, dine out and travel, and want products that fit their lifestyle rather than redefine it. Skews 70% female, mid to high income, urban and suburban Australia wide. They value quality, function, design and safety.",
    "split": "Two secondary audiences. Gift buyers (friends, colleagues, grandparents) want a premium, thoughtful gift with a wow factor that is impressive to unwrap and practical enough to justify the spend, angle: give them freedom, not clutter. Travelling and on-the-go families prize portability as both convenience and reassurance, angle: your child's seat, wherever life takes you."
  },
  "pillars": [
    {"id": "design", "name": "Design Credibility", "desc": "Scandinavian aesthetic meets Australian practicality. Neutral, timeless, styled within modern interiors, not loud baby gear."},
    {"id": "portability", "name": "Portability", "desc": "Lightweight, folds flat, easy to clean. Built for movement from kitchen to cafe to weekend trips."},
    {"id": "safety", "name": "Safety Assurance", "desc": "Secure harness, stable base, build you can trust. All specific safety and certification claims verified before use."},
    {"id": "lifestyle", "name": "Lifestyle and Freedom", "desc": "More than a product, a lifestyle enabler that lets families share meals, travel and stay connected without losing rhythm."},
    {"id": "proof", "name": "Authentic Proof and Advocacy", "desc": "Real usage, honest reviews, UGC and referral. Genuine real-world proof over high-volume influencer promotion."}
  ],
  "moments": [
    {"id": "prelaunch", "name": "Pre-Launch Buzz and Waitlist", "pillar": "lifestyle", "objective": "Build curiosity, trust and an owned audience before availability", "focus": "4 to 6 week teaser on Instagram and Facebook, waitlist landing page with email capture and referral layer, three-part email warm-up, early influencer seeding and a one-week-out press push. Build the list, do not sell yet."},
    {"id": "launch", "name": "Launch and Digital Activation", "pillar": "design", "objective": "Drive brand lift and convert early adopters", "focus": "0 to 2 months. Paid social on Meta with Google Display and Pinterest retargeting, launch email sequence to the waitlist, UGC-led creative, browse and cart abandonment flows. Establish Hannie as the design-led portable high chair in Australia."},
    {"id": "iconic", "name": "The Iconic Partnership", "pillar": "proof", "objective": "Win national reach and instant legitimacy", "focus": "Category page placement and newsletter feature, creative aligned to Hannie's palette, parallel ads to both D2C and the Iconic listing. Do not reference Iconic availability publicly until the partnership is signed."},
    {"id": "influencer", "name": "Influencer and Creator Seeding", "pillar": "proof", "objective": "Generate authentic real-world proof", "focus": "10 to 15 aligned creators across parenting, lifestyle, interiors and travel who represent modern family life, plus 3 to 5 micro-influencers for everyday content. Thoughtful unboxing, honest reviews and real use over specs. Avoid traditional high-volume mumfluencer promotion."},
    {"id": "content", "name": "Hannie Journal and Lifestyle Content", "pillar": "lifestyle", "objective": "Build search presence and tell the lifestyle story", "focus": "Owned blog series such as How to Eat Anywhere, themes of dining out with kids, travel, small-space living and design. SEO around portable high chair Australia, baby travel chair and design baby gear. Repurpose to social as reels and carousels."},
    {"id": "retail", "name": "Independent Retail and In-Store Experience", "pillar": "proof", "objective": "Build local trust and hands-on trial", "focus": "8 to 10 pilot independent and lifestyle boutiques with POS, minimalist posters, QR-linked shelf talkers, a demo unit per store and short staff-training video modules. Position as the design-led portable solution."},
    {"id": "affiliate", "name": "Affiliate and Publisher Program", "pillar": "proof", "objective": "Expand reach efficiently through trusted publishers", "focus": "Parenting, lifestyle and interiors publishers and mid-tier creators with tracking links and creative assets. A 4-week launch challenge and monthly leaderboard to build momentum. Informed guides, not deal-led promotion."},
    {"id": "events", "name": "Pop-Ups, Cafe Corners and Expos", "pillar": "lifestyle", "objective": "Create lifestyle-context trial and local buzz", "focus": "Hannie Cafe Corner pop-ups styled as mini dining setups, Pregnancy Babies and Children's Expo presence, in-store Weekend with Hannie demos, QR-linked giveaways and geo-targeted social around store postcodes."},
    {"id": "gifting", "name": "Gifting and Seasonal Moments", "pillar": "lifestyle", "objective": "Capture the gift-buyer audience at peak moments", "focus": "Gift-led storytelling for the wow-factor buyer, angle give them freedom not clutter. Seasonal gift-guide placements (Mother's Day, Christmas). Premium, thoughtful, easy to gift."},
    {"id": "advocacy", "name": "Reviews, Referral and Retention", "pillar": "proof", "objective": "Build a verified review base and lift lifetime value", "focus": "Drive verified 5-star reviews, a referral program, and retention flows (re-engagement, anniversary offers, new colourway releases). Hannie in the Wild customer-photo newsletter. State review counts only once genuinely achieved."}
  ],
  "channels": [
    {"id": "social", "name": "Organic social (Instagram and Facebook)", "presets": "IG feed 1080x1350, Story and Reel 1080x1920, carousel; cohesive teaser, lifestyle, demo and UGC content", "role": "Brand building, lifestyle storytelling and proof. Texture, folds, real-life use and customer content. Awareness and consideration, not last-click sales."},
    {"id": "blog", "name": "Blog / SEO", "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema", "role": "SEO-led education and lifestyle storytelling (Hannie Journal) that ranks and supports PDP and retail."},
    {"id": "paid", "name": "Paid media (Meta primary, Google Display and Pinterest retargeting)", "presets": "Paid social 1080x1350 and 1080x1920, lifestyle video 9:16, carousel for Folds Flat, Built for Movement, Scandinavian Design", "role": "Awareness and conversion. Pre-launch waitlist traffic, launch demand and retargeting of site visitors, waitlist and abandoned carts. Targets design-conscious parents 25 to 40 in Sydney, Melbourne, Brisbane."},
    {"id": "edm", "name": "EDM (Klaviyo)", "presets": "Email 600px modular; welcome, sneak peek and countdown warm-up, launch sequence, abandonment and retention flows", "role": "Owned audience nurture and conversion. Waitlist warm-up before launch, launch-day announcement and social proof, retention and re-engagement after."},
    {"id": "pdp", "name": "D2C and website (hannie.com.au)", "presets": "Pre-launch waitlist landing page, product pages, brand-story and lifestyle modules, seamless checkout", "role": "The heart of the brand and primary growth engine. First brand impression, waitlist capture, and the immersive design-led purchase experience. Targets roughly 40% of launch volume."},
    {"id": "influencer", "name": "Influencer and creator seeding", "presets": "Reels and photo posts of real-life use; unboxing, cafe, travel and home styling; shared hashtag", "role": "Authentic proof and social momentum. Aligned creators and micro-influencers over high-volume promotion. Honest reviews and emotional connection, not spec reads."},
    {"id": "affiliate", "name": "Affiliate and partnerships", "presets": "Tracking links, banners, product photography, copy snippets, buying-guide and review content", "role": "Efficient incremental reach through parenting, lifestyle and interiors publishers and mid-tier creators. Informed, design-led guides over deal-driven promotion."},
    {"id": "pr", "name": "PR and earned media", "presets": "Media kit with imagery, product sheet and lifestyle video; first-look pitches and gift-guide pitches", "role": "Credibility and discovery. Parenting and lifestyle outlets (Bounty Parents, Mum Central) plus design and interiors outlets to reach beyond the parenting niche. Superlative claims framed as ambition, not fact, until substantiated."},
    {"id": "retail", "name": "Retail and trade (The Iconic, independents, specialty)", "presets": "POS, minimalist posters, QR-linked shelf talkers, demo units, short staff-training video modules via DAM", "role": "Trust, trial and reach. The Iconic for national legitimacy, 8 to 10 independent pilots as premium custodians, specialty nursery and lifestyle retailers. Premium execution, consistent palette, no product clutter."},
    {"id": "content", "name": "Content and brand storytelling (Hannie Journal)", "presets": "Blog articles, lifestyle imagery, short video, early user quotes; reels and carousels for repurposing", "role": "Search presence and lifestyle authority. How to Eat Anywhere series and SEO around portable high chair and travel-chair terms. Distributed via email and social."},
    {"id": "event", "name": "Pop-ups and expos", "presets": "Cafe Corner pop-up styling, demo units, QR-linked giveaway tools, expo stand assets", "role": "Lifestyle-context trial and local buzz. Cafe Corner pop-ups, Pregnancy Babies and Children's Expo, and in-store demos."}
  ],
  "products": [
    {"name": "Hannie Portable High Chair", "type": "Portable high chair (hero, sole launch product)", "note": "Offered in a range of neutral colourways (for example neutral or sand, sage, clay or terracotta, charcoal). Confirm exact colour names and SKUs before use. RRP approximately $249 to $289, confirm final AU pricing before publishing."},
    {"name": "Seat cushion and harness", "type": "Included components", "note": "Soft seat liner and harness shown in product imagery. Confirm exact inclusions and any accessory or replacement-part range before referencing."}
  ],
  "mandatory": [
    "Lead with the real-life moment and lifestyle context, not the product spec sheet.",
    "Hold the brand voice: warm, minimal, intentional, confident. Never cute, childish or over-explained.",
    "Show Hannie in context: cafes, homes, travel, everyday family life. Style it alongside homewares, not stacked with baby products.",
    "Use inclusive imagery: dads, grandparents, mixed households and real homes.",
    "Use one committed hashtag across all content. Both #MomentsWithHannie and #HannieEverywhere appear in the plan; lock a single hero hashtag before content goes live (recommend #HannieEverywhere as the durable owned tag).",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No cute, colourful or childish tone or visual treatment.",
    "No cluttered, busy or product-stacked imagery. Keep it calm and minimal.",
    "No high-volume traditional mumfluencer promotion or spec-led influencer content.",
    "No implying Hannie is the highest-priced or most-premium chair. At around $249 to $289 it is mid-premium on price and wins on design value.",
    "No unverified safety, certification or standards claims.",
    "No public reference to The Iconic availability before the partnership is signed."
  ],
  "nonNegotiables": [
    "We will lead with authentic, real-world proof over high-volume promotional activity.",
    "We will not compromise the calm, design-led aesthetic for reach or volume.",
    "We will not make safety, certification or standards claims that are not verified for the specific Australian product.",
    "We will not fragment the brand with competing taglines or hashtags.",
    "We will keep D2C, The Iconic and independent retail coherent and will not undercut retail partners."
  ],
  "standingFlags": [
    {"level": "must", "note": "High chair safety and standards claims must be verified before publishing. Do not state or imply 'certified', 'meets international safety standards', 'parent-tested' or compliance with any Australian or international standard unless verified and substantiated for the specific Australian Hannie product. The source plan uses these phrases unverified."},
    {"level": "must", "note": "No absolute or guarantee-style safety claims such as 'no compromise on safety' or 'keeps your baby safe'. Safety language must be accurate and must not overstate protection. Harness and stability claims must be truthful."},
    {"level": "must", "note": "Do not assert certifications, testing or awards that are not current and verified for the Australian product and market."},
    {"level": "check", "note": "'Premium' and any comparative claim against named competitors (Stokke, Silver Cross, Redsbaby and others) must be truthful and not misleading under Australian Consumer Law. Lead on design and value; do not imply a price tier or 'best' status without basis."},
    {"level": "check", "note": "Superlatives such as 'Australia's leading' or 'most portable premium high chair' are aspirational. Do not publish as fact until substantiated; treat as internal ambition."},
    {"level": "check", "note": "Review and ratings figures (for example 250+ 5-star) must reflect genuine verified reviews. Do not state a review count or rating until achieved and substantiated."},
    {"level": "check", "note": "Do not publish 'Now available at The Iconic' or stockist claims until the relevant partnership is signed and live."}
  ]
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
