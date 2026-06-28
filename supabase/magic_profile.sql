-- MAGIC brand profile · Coolkidz Briefing Engine
-- Adapted: brand_profiles table + siteUrl/marketContext + blog channel.
-- NOTE: Magic is value-led and uses promotions ON strategy. The engine now reads the
-- brand's own ALWAYS/NEVER from the profile, so discounting is not suppressed for Magic.
insert into brand_profiles (slug, name, tier, profile) values
('magic', 'Magic', 'B', $json$
{
  "essence": "Clean. Clever. Lasting.",
  "brandLine": "Odour-free living, made simple",
  "positioning": "A baby brand built on a simple idea: everyday products should make life easier, cleaner and kinder to the planet. The flagship Magic Bin reimagines the nappy bin with no-refill convenience that works with any standard bin liner, strong odour control, Scandinavian-influenced design and recycled materials built to last beyond the baby years.",
  "hero": "Magic Bin, the flagship and core product. No-refill nappy disposal that uses any standard bin liner, available in minimalist colourways, repurposes into a household bin after the nappy years.",
  "siteUrl": "https://magicbabyproducts.com.au",
  "marketContext": "nappy bins and baby waste disposal in Australia",
  "tone": [
    "Intelligent but warm. Knows its stuff, but speaks in simple human language, not a lab",
    "Minimalist, elegant, modern. Scandinavian influence with a softer edge",
    "Honest and transparent. No exaggerated claims or gimmicks, tells it straight",
    "Dependable, built for real life. Steady not flashy, just does the job"
  ],
  "audience": {
    "primary": "New and expecting parents, 25 to 40, urban and suburban Australia-wide, mid to high income, skewing female. Two core mindsets: the Conscious Parent (eco-aware, researches everything, wants less waste and a calm aesthetic) and the Practical Parent (busy, efficiency and hygiene first, less brand loyal, wants something that just works, lasts and saves money). Lead the Conscious Parent on sustainability and design, the Practical Parent on no refills, no smells, no fuss.",
    "split": "Secondary audiences are gift buyers (grandparents, friends, colleagues wanting a practical premium gift, guided by visual appeal and word of mouth) and the Eco Educator (childcare directors and early-education professionals, a B2B audience focused on hygiene, low operating cost and sustainability, reached with case studies and savings proof)."
  },
  "personas": [
    {"name": "The Conscious Parent", "profile": "First-time, early 30s, metro/inner-suburban, eco-aware, researches everything.", "angle": "Smarter, sustainable alternative to cartridge systems. Longevity, recycled materials, freedom from costly refills."},
    {"name": "The Practical Parent", "profile": "Busy, two young kids, suburban, efficiency and hygiene first.", "angle": "No refills. No smells. No fuss. Durability, ease of use, cost savings over time, side-by-side comparisons."},
    {"name": "The Gift Giver", "profile": "Grandparents, friends, colleagues buying a practical premium gift.", "angle": "The perfect practical gift that lasts beyond the baby years. Reliability and style cues, in-store displays."},
    {"name": "The Eco Educator (B2B)", "profile": "Childcare directors and early-education professionals managing shared nursery spaces.", "angle": "Cost-effective, hygienic, eco-responsible for childcare. B2B case studies and savings proof."}
  ],
  "pillars": [
    {"id": "clean", "name": "Clean", "desc": "Hygiene, order and peace of mind. Odour control, clean aesthetics, clean impact on the planet."},
    {"id": "clever", "name": "Clever", "desc": "Smart, no-refill engineering. The why-didn't-someone-do-this-sooner cleverness."},
    {"id": "lasting", "name": "Lasting", "desc": "Durable, sustainable and timeless. Outlives the nappy phase, repurposed and reused."},
    {"id": "proof", "name": "Real Proof", "desc": "Real homes, real parents, honest comparisons and reviews."}
  ],
  "moments": [
    {"id": "launch", "name": "Australian Launch and Brand Introduction", "pillar": "clever", "objective": "Introduce Magic to the Australian market", "focus": "The problem (odour, waste, refills) into the Magic solution. How It Works videos, the drop-and-turn mechanism, the seal, elegant design. Press and PR."},
    {"id": "problemsolution", "name": "The Problem and the Magic Solution (Education)", "pillar": "clever", "objective": "Build confidence through education", "focus": "No refills, no odour, no waste. Why it is different, how it works, uses any standard bin liner. The always-on education engine."},
    {"id": "comparison", "name": "Comparison and Switching", "pillar": "proof", "objective": "Win switchers from refill-based systems", "focus": "Side-by-side vs refill bins, I switched from X to Magic, cost savings over time. Competitor claims must be truthful, current and substantiated."},
    {"id": "sustainability", "name": "Sustainability Story", "pillar": "lasting", "objective": "Own the sustainable choice positioning", "focus": "Recycled materials, no refills and no waste, repurposing beyond baby. Environmental claims must be specific and substantiated, not vague."},
    {"id": "everyhome", "name": "Magic for Every Home (Beyond Baby)", "pillar": "lasting", "objective": "Show longevity and design value", "focus": "Repurposes into a kitchen or bathroom bin after the nappy years. Built to last, design that does not expire, aspirational interior content."},
    {"id": "gifting", "name": "Gifting and Seasonal", "pillar": "clean", "objective": "Capture gift and seasonal demand", "focus": "Baby showers, Mother's and Father's Day, Christmas, New Year fresh start. Practical premium gift, registry inclusion. Promotions are on-strategy here."},
    {"id": "advocacy", "name": "Reviews, UGC, Loyalty and Advocacy", "pillar": "proof", "objective": "Turn customers into advocates and repeat buyers", "focus": "#MadeByMagic, real homes and real parents, testimonials, Magic Circle loyalty, refer-a-friend Give 20 Get 20. Screen UGC for accuracy of claims."},
    {"id": "retail", "name": "Retail Launch and Demo", "pillar": "clean", "objective": "Drive retail trial and sell-through", "focus": "Try the seal, smell the difference. Demo units, staff training, co-op POS, retailer-exclusive bundles, touch and feel pop-ups at Baby Bunting and boutiques."},
    {"id": "expo", "name": "Tradeshows and Events", "pillar": "proof", "objective": "Build in-person trust and capture leads", "focus": "PBC and OFB expos, the Smell Challenge demo, lead capture for post-event remarketing, sustainable nursery workshops."},
    {"id": "b2b", "name": "Childcare and B2B (Eco Educator)", "pillar": "lasting", "objective": "Open the childcare and B2B channel", "focus": "Childcare centres, hygiene and compliance, cost and waste savings. B2B case studies and testimonials."}
  ],
  "channels": [
    {"id": "social", "name": "Organic and paid social (Instagram, Facebook, YouTube)", "presets": "IG/FB feed 1080x1350, Story/Reel 1080x1920, YouTube Shorts 15-30s demos, comparison reels, carousels", "role": "Primary brand presence, education and community. Teasers, drop-and-turn demos, comparison reels, UGC #MadeByMagic, Magic Moments reels."},
    {"id": "blog", "name": "Blog / SEO", "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema", "role": "SEO-led education that ranks and supports PDP and retail conversion."},
    {"id": "paid", "name": "Paid media (Google + Meta)", "presets": "Search RSA, Shopping feed, Display, Performance Max, Meta 1080x1350 and 1920, YouTube Shorts", "role": "High-intent capture (best nappy bin Australia, no refill nappy bin, odour-free nappy disposal), retargeting, seasonal. Efficient CPA and blended ROAS."},
    {"id": "edm", "name": "EDM and lifecycle (Klaviyo)", "presets": "600px modular, single primary CTA, welcome and post-purchase flows", "role": "Join the Magic welcome series, post-purchase setup and review requests, referral Give 20 Get 20, newsletters, abandoned cart. Segments: expecting, new, eco, gift."},
    {"id": "pdp", "name": "D2C / website (magicbabyproducts.com.au)", "presets": "How It Works videos, FAQs, sustainability story, blog/SEO, bundles, UGC gallery, 30-Day Freshness Promise", "role": "Core brand hub and full-margin sales. Education, storytelling and conversion."},
    {"id": "affiliate", "name": "Affiliate and influencer", "presets": "Comparison content, unboxings, day-in-the-life reels, buying guides, reviewer content, ambassador content", "role": "Reach through trusted micro and mid creators (2 to 50K), eco and parenting reviewers, comparison sites. Authenticity over polish. 8 to 10% commission."},
    {"id": "retail", "name": "Retail and trade (Baby Bunting, independents)", "presets": "Demo units, POS, window signage, staff training, retailer-exclusive bundles, touch and feel pop-up kits", "role": "Core retail distribution and credibility. Try the seal, smell the difference. Co-op marketing and staff training."},
    {"id": "marketplace", "name": "Marketplaces", "presets": "Listing imagery, A+ content, Sponsored Products, consistent imagery and tone", "role": "Amazon AU (focus), Myer Marketplace, The Iconic, Catch, Kogan, Temple & Webster. Discovery and review-driven volume. Lightning Deals and seasonal bundles."},
    {"id": "specialty", "name": "Specialty, boutique, gift and pharmacy", "presets": "Registry assets, gift-ready content, boutique POS, pharmacy listing content", "role": "Biome, Hardtofind, Purebaby, Pillow Talk, Priceline, Chemist Warehouse online, TerryWhite. Design-led gift positioning and registry inclusion."},
    {"id": "event", "name": "Tradeshows and events", "presets": "Stand graphics, Smell Challenge demo, sample and lead-capture tools", "role": "PBC and OFB expos, pop-ups, sustainable nursery workshops, media preview events. Trial and lead capture."},
    {"id": "pr", "name": "PR and earned media", "presets": "Press release, media kit, product imagery, founder and sustainability story", "role": "Baby forums (Bounty Baby), parenting and sustainability publications, eco-home and lifestyle media, podcasts."}
  ],
  "competitors": [
    {"name": "Ubbi", "note": "Steel build, works with standard bags. Heavier, more expensive, may not fully eliminate smell in heat. Approx RRP claims and any figures must be verified and current before use."},
    {"name": "Tommee Tippee (Twist & Click / Sangenic)", "note": "Strong brand, wraps each nappy in film. Proprietary refill cassettes, recurring cost. Any cited review score or price must be verified and current before use."},
    {"name": "AngelCare", "note": "Foot-pedal and airlock systems. Still relies on liners/refills. Any figures must be verified and current before use."},
    {"name": "Munchkin", "note": "Compact, child-safe, strong store presence. Specialised refills and multilayer films, recurring spend. Any figures must be verified and current before use."}
  ],
  "salesChannelTargets": "Year 1 target 10,000 to 15,000 units. Mix: Baby stores ~40% (Baby Bunting + independents), Online D2C ~30%, Specialty/boutique/pharmacy ~15%, Marketplaces ~15%.",
  "mandatory": [
    "Lead with the core promise: no refills, no waste, strong odour control. Works with any standard bin liner.",
    "Plain, honest, human language. No exaggeration or gimmicks, in line with the brand voice.",
    "Show the design fitting any room and repurposing beyond the baby years (built to last).",
    "Use real reviews, testimonials and side-by-side comparisons for social proof, screened for accuracy.",
    "Make sustainability claims specific and substantiated, never vague."
  ],
  "exclusions": [
    "No exaggerated, absolute or gimmicky claims that the brand cannot substantiate.",
    "No clinical or cold tone. Warm, human and dependable.",
    "No vague green claims (eco, sustainable, kinder to the planet) without specifics and evidence.",
    "Note: promotions and discounting are ON strategy for Magic and should not be suppressed. Keep promotional claims honest and accurate."
  ],
  "standingFlags": [
    {"level": "must", "note": "Absolute performance claims (100% odour control, completely or truly odour-free, locks odours away completely) must be substantiated with evidence or softened to qualified language (strong odour control, designed to lock in odours). Unsubstantiated absolute claims breach Australian Consumer Law."},
    {"level": "must", "note": "Environmental and sustainability claims (recycled materials, recyclable, sustainable, eco-friendly, kinder to the planet) must be specific, accurate and substantiated. Avoid vague green claims. This is an active ACCC greenwashing enforcement area."},
    {"level": "must", "note": "Only claim patented if a patent is granted, or patent pending if pending. Verify status before use."},
    {"level": "check", "note": "Comparative claims naming competitors (Ubbi, Tommee Tippee, AngelCare, Munchkin) must be truthful, current and substantiable. Any cited price or review score must be accurate and current at the time of publishing, not out of date."},
    {"level": "check", "note": "Cost-savings and no-ongoing-cost claims must be substantiable against a fair, like-for-like comparison."},
    {"level": "check", "note": "Satisfaction and guarantee claims (30-Day Freshness Promise, Freshness Guarantee) must be honoured exactly as stated and must not mislead on terms."}
  ]
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
