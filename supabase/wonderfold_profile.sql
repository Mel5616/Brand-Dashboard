-- WONDERFOLD brand profile · Coolkidz Briefing Engine
-- Adapted: brand_profiles table + siteUrl/marketContext + blog channel.
insert into brand_profiles (slug, name, tier, profile) values
('wonderfold', 'WonderFold', 'B', $json$
{
  "essence": "More than a wagon. A way to move through life together, comfortably, confidently and inclusively.",
  "brandLine": "Move through life together.",
  "positioning": "WonderFold is a premium family mobility brand that supports modern Australian families to move through life together, comfortably, confidently and inclusively. It is a long-term family solution, not a short-term baby product: wagons designed to grow with families, adapt to different needs and support shared experiences over time. WonderFold sits in a unique space between traditional prams and short-term kids' gear, removing friction from family outings so parents can get out, stay out longer, and include everyone regardless of age or ability. In 2026 the brand is established and trusted; the strategic shift is from awareness into embedded family relevance.",
  "hero": "WonderFold's hero is the multi-seat family wagon range. Lead with the real-life family moment (school drop-off, weekend adventure, travel, appointments, community outings), not a spec list. This is a considered, high-value purchase with a long consideration cycle, so every story builds confidence first and sells second. Confirm exact model names and configurations before naming them.",
  "siteUrl": "https://wonderfold.com.au",
  "marketContext": "family wagons and stroller wagons in Australia",
  "tone": [
    "Warm and confident: reassurance and clarity, calm and considered, never loud or sales-driven",
    "Practical and human: speak like real people who understand family life, not a brand or a catalogue",
    "Reassuring, never pushy: support decisions, do not pressure them",
    "Aspirational but grounded: show what is possible, but keep it real and achievable, rooted in imperfect, busy days"
  ],
  "messageHierarchy": {
    "brand": "A premium family mobility brand helping families move through life together, comfortably, confidently and inclusively. More than a wagon, an enabler of connection, independence and shared experiences.",
    "category": "A long-term family solution that grows with families and adapts to different needs, sitting between traditional prams and short-term kids' gear.",
    "product": "Clear articulation of the everyday family moment WonderFold solves: school drop-offs, weekend adventures, travel, appointments and community outings. Removes friction and gives parents confidence to get out and stay out longer.",
    "proof": "Real families, strong reviews, lived experience, the WonderFold Whisperer Program and trusted health-professional advocacy. Peer recommendation over paid influence."
  },
  "proofPoints": [
    "Strong, consistent customer reviews and organic word-of-mouth",
    "Real families using WonderFold in everyday Australian settings (school run, outings, travel)",
    "The WonderFold Whisperer Program: community-led, lived-experience advocacy",
    "Trusted OT and allied-health advocacy where genuinely suitable (verify endorsement compliance before any use)",
    "Starlight Children's Foundation partnership (reference only as approved by the partner)"
  ],
  "audience": {
    "primary": "Modern Australian families with children aged 0 to 6. Experience-led, research before purchasing, value products that simplify life, and rely heavily on peer trust and reviews.",
    "split": "Secondary: families with additional mobility, accessibility or sensory needs, often supported by Occupational Therapists and paediatric or allied health professionals. Tertiary: community and professional advocates, OTs and health specialists, community leaders, and disability and inclusion advocates. Address the additional-needs space with respect, authenticity and lived experience, never tokenism or marketing gloss."
  },
  "pillars": [
    {"id": "reallife", "name": "Built for Real Family Life", "desc": "Designed for how families actually live: busy days, multiple kids, different stages, real environments. If it does not reflect real life, it is not on-brand."},
    {"id": "value", "name": "Premium Quality with Long-Term Value", "desc": "Premium, but value comes from longevity and versatility, not luxury for its own sake. Built to last, used for years, grows with the family. A smart long-term investment."},
    {"id": "connection", "name": "Connection, Independence and Shared Experiences", "desc": "An enabler of moments: shared outings, children's independence, and confidence navigating public spaces together. Show the moment, not just the product."},
    {"id": "inclusion", "name": "Inclusive by Design", "desc": "Inclusivity is DNA, not a campaign. Suitable for a wide range of family needs, strong disability-community resonance, growing OT and health engagement. Respect, authenticity and lived experience, never gloss."},
    {"id": "trust", "name": "Trusted by Families, Supported by Community", "desc": "Trust is the strongest asset: strong reviews, real family advocacy and the Whisperer Program. Real voices over hype; peer recommendation always outweighs paid influence."}
  ],
  "moments": [
    {"id": "whisperer", "name": "WonderFold Whisperer Program", "pillar": "trust", "objective": "Build peer trust and advocacy through real families", "focus": "A community-led advocacy program, not an influencer-reach play. Real families share honest, lived experience across stages, needs and family dynamics, including disability and neurodiverse voices. Whisperers educate, reassure and inspire confidence, they do not sell. Grounded in long-term relationships."},
    {"id": "health", "name": "Children's Health and Allied Health Community", "pillar": "inclusion", "objective": "Build professional trust and ethical referral", "focus": "Long-term relationships with OTs, paediatric and allied health professionals through a structured Professional Ambassador and referral pathway. Education before referral, suitability before conversion, professional integrity never compromised. All endorsements and referral arrangements must clear AHPRA and legal review before any public use."},
    {"id": "experiential", "name": "Experiential and Community Marketing", "pillar": "connection", "objective": "Bring the brand to life in the real world", "focus": "On Tour pop-up roadshows across Australian cities, family-friendly event sponsorships, WonderFold Care Corners (cleaning and maintenance stations) and interactive retail displays. Hands-on demos staffed by trained reps and Whisperers who educate, not sell. Feeds authentic UGC back to digital."},
    {"id": "starlight", "name": "Starlight Children's Foundation Partnership", "pillar": "inclusion", "objective": "Deepen credibility and emotional connection through community impact", "focus": "Expand the 2025 partnership into a long-term, mutually beneficial relationship that reflects WonderFold's values. All references accurate, current and approved by the partner. Do not overstate the contribution."},
    {"id": "inclusion", "name": "Inclusion and Accessibility Storytelling", "pillar": "inclusion", "objective": "Stand authentically for inclusivity and accessibility", "focus": "Amplify lived-experience voices from the disability and neurodiverse communities with respect and authenticity. Describe suitability and real-life use, not medical or therapeutic outcomes. Co-create or review with lived-experience voices, never tokenism."},
    {"id": "retail", "name": "Retail Education (Independents and Baby Bunting)", "pillar": "value", "objective": "Physical validation and education, not volume", "focus": "Fewer, stronger retail partnerships. Independents as trusted local advocates with confident, informed staff and hands-on demos; Baby Bunting for national visibility and mainstream validation. Consistent premium presentation. Retail supports, does not compete with, D2C and community."},
    {"id": "digital", "name": "Digital and Performance Acceleration", "pillar": "reallife", "objective": "Capture high-intent demand efficiently", "focus": "Google for active researchers close to a decision (protect brand search, capture high-intent non-branded) and paid social to amplify high-performing organic and community content. Calm, informative messaging, no urgency or discount-led copy. Measured beyond last-click."},
    {"id": "crm", "name": "CRM, Loyalty and Lifetime Value", "pillar": "trust", "objective": "Drive retention, repeat purchase and advocacy", "focus": "Email and customer journeys that educate and build confidence after purchase, encourage reviews and referrals, and drive accessories and upgrades thoughtfully. A robust loyalty program. Fewer, better emails; promotions never the lead message."},
    {"id": "content", "name": "Real-Life Content and UGC", "pillar": "reallife", "objective": "Educate through lived experience", "focus": "Real families in real environments on real days. Education through lived experience over feature lists. Reviews and real-life content are essential, not optional. Authenticity over aesthetic perfection; if it looks too perfect to be real, it does not belong."}
  ],
  "channels": [
    {"id": "pdp", "name": "D2C and website (hero channel)", "presets": "Education hub, product and comparison pages, reviews and real-family modules, loyalty program, retail-discovery support", "role": "The foundation and source of truth. Builds confidence whether a family buys online or via retail, supports long consideration cycles, and showcases reviews and lived experience. Education comes before selling; every channel drives back here."},
    {"id": "blog", "name": "Blog / SEO", "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema", "role": "SEO-led, lived-experience education that ranks and drives families back to the D2C hub."},
    {"id": "edm", "name": "EDM and CRM (Klaviyo)", "presets": "Email 600px modular, lifecycle and post-purchase journeys, review and referral prompts, loyalty and accessory flows", "role": "Long-term relationships, not short-term wins. Educates subscribers and new customers, builds post-purchase confidence, drives reviews, referrals and thoughtful upgrades. Speak like a helpful guide; fewer, better emails; promotions never the lead."},
    {"id": "search", "name": "Google Advertising", "presets": "Brand and non-brand search, RSA, education-led landing pages", "role": "Capture families actively researching and close to a decision. Protect brand search, capture high-intent non-branded demand, support D2C and retail discovery. Calm, informative copy, no urgency or discounts. Measured beyond last-click."},
    {"id": "social", "name": "Social media (organic and paid)", "presets": "IG and Facebook feed 1080x1350, Story and Reel 1080x1920, carousel; real-family, UGC and Whisperer content", "role": "Builds familiarity, trust and community. Organic educates through lived experience and amplifies Whisperers and UGC; paid amplifies high-performing organic and supports key moments and retargeting. An extension of the community, not an ad feed."},
    {"id": "whisperer", "name": "WonderFold Whisperer Program", "presets": "Whisperer briefs, real-life routine and use-case content, community storytelling, lived-experience UGC", "role": "Cornerstone community advocacy channel. Real families sharing honest experiences across stages, needs and accessibility. Educates and reassures, does not sell. Peer recommendation always outweighs paid influence. Not an influencer reach program."},
    {"id": "healthcare", "name": "Children's health and allied health", "presets": "Professional product education and usage resources, professional-only family-discussion materials, ambassador pathway and referral resources", "role": "Professional trust and ethical referral. OT, paediatric and allied health relationships grounded in suitability and integrity. Education before referral. Endorsements and referral arrangements must clear AHPRA and legal review before use."},
    {"id": "retail", "name": "Retail and trade (independents and Baby Bunting)", "presets": "POS, demo units, staff education and training, consistent merchandising, retail-ready digital and EDM", "role": "Physical validation and education, not volume. Fewer, stronger partnerships. Independents as local advocates, Baby Bunting for national validation. Premium, consistent presentation. Supports, does not compete with, D2C."},
    {"id": "affiliate", "name": "Affiliate and partnerships", "presets": "Education-led guides, reviews, lived-experience content, tracking links, tiered long-term structures", "role": "Credibility-led discovery through trusted voices. Who introduces us matters more than link volume. Aligned parenting, lifestyle, travel, community and professional partners. Education first, longer-term relationships, not one-off transactional promotion."},
    {"id": "pr", "name": "PR and earned media", "presets": "Family and lifestyle media kits, inclusion-led storytelling, community and partnership angles", "role": "Build credibility and trust through third-party validation. Family and lifestyle media, community partnerships and inclusion-led storytelling. Avoids hype; lets real voices and lived experience lead."},
    {"id": "experiential", "name": "Experiential and community marketing", "presets": "On Tour pop-up roadshow assets, event sponsorship presence, Care Corner service stations, interactive retail demo spaces with QR to D2C", "role": "Brings the brand to life in the real world. Hands-on, no-pressure trial staffed by trained reps and Whisperers who educate, not sell. Prioritises community presence, inclusion and shared experiences over transactional outcomes. Feeds UGC back to digital."}
  ],
  "products": [
    {"name": "WonderFold Wagon (multi-seat family wagon)", "type": "Family wagon (hero range)", "note": "Multi-seat folding wagon range. Confirm exact model names, seat configurations and AU SKUs before use, do not invent model names. Premium, long-term, grows-with-family positioning."},
    {"name": "Accessories and add-ons", "type": "Accessories", "note": "Canopies, liners, covers and similar add-ons shown in imagery. Confirm the exact AU accessory range and replacement parts before referencing."}
  ],
  "mandatory": [
    "Lead with real family life and lived experience, not feature lists or idealised parenting. If it does not reflect real life, it is not on-brand.",
    "Reinforce longevity and real value: a long-term solution families grow with. Value from durability and years of use, not price or trend.",
    "Hold the tone: warm, confident, practical, human, reassuring and never pushy. Aspirational but grounded.",
    "Treat inclusion and accessibility with authenticity, care and respect, lived experience, never tokenism.",
    "Lead with real voices: reviews, Whisperers, community and health professionals as a natural extension of the brand. Peer recommendation over paid influence.",
    "Education before selling. Every channel should drive families back to the D2C education hub.",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No over-polished or unrealistic imagery. Authenticity over aesthetic perfection.",
    "No over-technical or clinical language unless speaking directly to health professionals.",
    "No hard-sell tactics: urgency-led messaging, pressure-based CTAs or aggressive promotions.",
    "No short-term promotional thinking that delivers a spike but weakens trust or positioning.",
    "No tokenistic or surface-level inclusion messaging.",
    "No treating the Whisperer Program as an influencer reach or volume play."
  ],
  "nonNegotiables": [
    "We will pursue the right kind of growth: sustainable, trusted and community-led, growing with families, not ahead of them.",
    "We will not rely on urgency, pressure or discount-led tactics to grow.",
    "We will not let short-term spikes undermine long-term brand equity, trust or positioning.",
    "We will not over-rely on any single channel.",
    "We will not compromise inclusion authenticity or professional integrity for conversion.",
    "Before any campaign we ask: does this reflect real family life, build trust and long-term value, and strengthen WonderFold's role in families' everyday lives. If no, we pause and rethink."
  ],
  "standingFlags": [
    {"level": "must", "note": "Health-practitioner endorsements and the OT and allied-health Professional Ambassador and referral program must be reviewed for compliance with AHPRA advertising rules and professional codes before any public use. Do not publish endorsements or testimonials from registered health practitioners about the product in advertising without confirming they are permitted and genuine. Referral and financial arrangements with health professionals must be transparent and compliant. Flag for legal review."},
    {"level": "must", "note": "Do not position WonderFold as a medical device, mobility aid, therapeutic or disability-support product, and do not imply NDIS funding eligibility or clinical or medical benefit, unless verified, substantiated and registered. Inclusion and accessibility messaging describes suitability and lived experience, not medical or therapeutic outcomes."},
    {"level": "must", "note": "Safety and restraint claims (harness, stability, standards) must be accurate and verified for the specific Australian product before publishing. Do not state or imply compliance with any Australian or international safety standard, and do not make absolute safety claims, unless verified."},
    {"level": "check", "note": "'Premium' and any comparative claim (versus prams or other brands) must be truthful, substantiable and not misleading under Australian Consumer Law."},
    {"level": "check", "note": "Charity and cause-partnership references (Starlight Children's Foundation) must be accurate, current and approved by the partner before use. Cause-related claims must not overstate the contribution."},
    {"level": "check", "note": "Inclusion and disability-community content should be authentic and ideally co-created or reviewed with lived-experience voices, never tokenistic."},
    {"level": "check", "note": "Review and advocacy claims must reflect genuine, current reviews and real families. Do not fabricate or imply volume not achieved."}
  ]
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
