-- Gaia Baby brand profile (adapted: brand_profiles + siteUrl/marketContext + blog channel)
insert into brand_profiles (slug, name, tier, profile) values
('gaia-baby', 'Gaia Baby', 'B', $json$
{
  "essence": "Premium, sustainable nursery furniture designed to grow with the child. From our family to yours.",
  "brandLine": "From our family to yours.",
  "positioning": "Gaia Baby is a premium, sustainable nursery-furniture brand built on real-wood craftsmanship, non-toxic materials and design that grows with the child. Pieces are engineered to transition from infancy to toddlerhood and beyond, and to be reused for future siblings, making them long-term investments rather than short-term baby products. The brand sits at the intersection of premium quality, sustainability and modern, timeless design. The Eos range extends that ethos into the mid-market at an accessible price, without compromising material authenticity.",
  "hero": "Gaia Baby runs a good-better tiered range: Eos is the accessible real-wood mid-market range (cot bed and dresser, customisable), with Hera and Serena serving the upper tier. The 2026 priority is the Eos launch. Lead with the range that fits the family's budget and stage, and treat Eos as the growth story for the year. Confirm exact current model and range names and AU pricing before naming them.",
  "tone": [
    "Calm, nurturing and design-focused",
    "Warm, minimal and intentional, never busy or baby-themed",
    "Educational and transparent, especially on materials and sustainability",
    "Premium but approachable, attainable quality rather than luxury for its own sake"
  ],
  "messageHierarchy": {
    "brand": "Premium, sustainable nursery furniture that grows with the child. Quality, sustainability and modern design that lasts.",
    "category": "Real-wood, non-toxic, design-led nursery furniture that adapts as the family's needs change, a considered long-term investment.",
    "product": "Clear articulation of material quality (100% real wood, not MDF or chipboard), customisation, cot-to-toddler convertibility and the moment it serves in the nursery.",
    "proof": "Real-wood construction, non-toxic finishes, convertibility, sustainability credentials, reviews and design-led storytelling. Substantiate material and safety claims."
  },
  "proofPoints": [
    "100% real wood construction (sustainably sourced New Zealand pine on Eos), not MDF or chipboard",
    "Non-toxic paints and finishes, responsibly sourced timber",
    "Cot-to-toddler convertibility and reuse for future siblings (grows-with-child, long-term value)",
    "Customisation (Eos: 2 frame tones plus 6 interchangeable base colours)",
    "Reviews, design-led imagery and the UPPAbaby tradeshow bundle association"
  ],
  "audience": {
    "primary": "Intentional, research-driven first-time parents aged 25 to 40, mid to upper-middle income, style-conscious and influenced by minimalist interiors, Pinterest moodboards and eco-conscious living. They want nursery furniture that feels elevated yet attainable, value real materials and durability for future children, and prefer pieces that grow with the child to maximise long-term value.",
    "split": "Grandparents (50 to 65) are a distinct, growing audience with higher disposable income, creating safe, stylish spaces for visiting grandchildren. They value stability, sturdiness and timeless aesthetics that complement their home decor rather than baby-themed furniture, and prize ease of use and peace of mind. Gaia also reaches value-driven families weighing quality against cost-of-living pressure."
  },
  "pillars": [
    {
      "id": "sustainability",
      "name": "Sustainable Craftsmanship",
      "desc": "Real wood, responsibly sourced timber and non-toxic finishes. Better materials and responsible design, communicated through education, not greenwash. Substantiate every sustainability claim."
    },
    {
      "id": "design",
      "name": "Modern Calm Aesthetic",
      "desc": "Scandinavian-inspired, soft, warm, minimal and design-led. Timeless rather than baby-themed, so it fits a styled, cohesive home."
    },
    {
      "id": "longevity",
      "name": "Designed to Grow",
      "desc": "Cot-to-toddler conversion, solid construction and reuse for future siblings. Durability and long-term value for practical, considered buyers."
    },
    {
      "id": "personalisation",
      "name": "Personalisation and Customisation",
      "desc": "Mix-and-match colour and frame options (Eos: 6 base colours, 2 frame tones) that let families refresh or restyle over time. Creative freedom and individuality."
    },
    {
      "id": "trust",
      "name": "Trust and Safety",
      "desc": "Solid construction, stability and reliability. Peace of mind for new parents and grandparents. All safety and standards claims verified for the specific AU product."
    }
  ],
  "moments": [
    {
      "id": "eos_launch",
      "name": "Eos Range Launch",
      "pillar": "design",
      "objective": "Establish Eos as the best mid-market real-wood nursery option in Australia",
      "focus": "Phased launch (prep, two-week pre-launch teaser, launch week conversion, PBC Melbourne expo, post-launch optimisation, retail expansion). Shopify is the hero platform. Position as accessible real-wood quality without compromising premium brand perception. Lead with material, customisation and convertibility."
    },
    {
      "id": "d2c_growth",
      "name": "D2C and Shopify Growth",
      "pillar": "design",
      "objective": "Drive direct online sales and first-party data",
      "focus": "Shopify as the owned hero channel: high-impact collection page, SEO and review-rich product pages, cot-plus-dresser bundles to lift AOV, and personalised flows (browse, cart, post-purchase). The centre of all digital activity."
    },
    {
      "id": "sustainability_education",
      "name": "Sustainability Education",
      "pillar": "sustainability",
      "objective": "Make the material and sustainability story a purchase driver",
      "focus": "Educate on real wood vs MDF or chipboard, responsibly sourced timber and non-toxic finishes. How-to and explainer content that equips eco-conscious buyers to choose confidently. Claims substantiated, never overstated."
    },
    {
      "id": "customisation",
      "name": "Customisation and Styling",
      "pillar": "personalisation",
      "objective": "Turn personalisation into engagement and differentiation",
      "focus": "Showcase colour and frame combinations, styling guides and colour-comparison content. Post-launch EDM with styling and combination inspiration. Personalisation is the clearest point of difference against mass mid-market competitors."
    },
    {
      "id": "grandparents",
      "name": "The Grandparent Buyer",
      "pillar": "trust",
      "objective": "Win the high-disposable-income gifting and second-home buyer",
      "focus": "Timeless, non-baby-themed design that fits their home, ease of use and peace of mind caring for grandchildren. Stability, sturdiness and reliability messaging. A distinct buyer with distinct motivations."
    },
    {
      "id": "retail",
      "name": "Retail Expansion and Trade",
      "pillar": "trust",
      "objective": "Build national in-store presence and floor advocacy",
      "focus": "Baby stores give in-person reassurance to see real wood, finishes and colours. Premium POS showcasing customisation, staff training so stores sell Eos confidently, retail promotions aligned to online windows (Mother's Day, EOFY), and co-branded placements."
    },
    {
      "id": "expo",
      "name": "Tradeshow and Expo Activation",
      "pillar": "design",
      "objective": "Direct consumer engagement, education and CRM capture",
      "focus": "PBC and One Fine Baby expos across the year. Educate on quality, longevity and customisation, offer expo bundles, and run the UPPAbaby pram-plus-furniture bundle. A direct-engagement and acquisition channel, not sales-only."
    },
    {
      "id": "lifecycle",
      "name": "Post-Purchase and Customer Experience",
      "pillar": "longevity",
      "objective": "Build loyalty, advocacy and reviews",
      "focus": "Seamless post-purchase: clear assembly guides, care guides, responsive service and follow-ups that seek feedback. Turn satisfied customers into reviewers and word-of-mouth advocates. Reviews and recommendations are a major purchase driver in this category."
    }
  ],
  "channels": [
    {
      "id": "pdp",
      "name": "D2C and website (Shopify, hero)",
      "presets": "Eos collection page, SEO and review-rich product pages, bundle modules, FAQ, personalised email-flow triggers",
      "role": "Primary owned channel and the centre of all digital activity. Full control of storytelling, pricing and experience. Drives direct sales (especially cot-plus-dresser bundles) and first-party data."
    },
    {
      "id": "blog",
      "name": "Blog / SEO",
      "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema",
      "role": "SEO-led education that ranks and supports PDP and retail conversion."
    },
    {
      "id": "paid",
      "name": "Meta (Facebook and Instagram)",
      "presets": "Lifestyle imagery, colour carousels, Reels, feature demos 1080x1350 and 1080x1920; teaser, launch and retargeting sets",
      "role": "Primary visual storytelling and awareness engine. Showcases design, colours, real-wood materials and nursery lifestyle. Reaches first-time parents and grandparents, builds warm audiences and converts via retargeting."
    },
    {
      "id": "search",
      "name": "Google Ads (Search, Shopping, PMax)",
      "presets": "High-intent nursery keywords, Performance Max, Shopping feed via Merchant Centre, competitor-term targeting (Mocka, Boori, Temple and Webster)",
      "role": "High-intent capture for shoppers actively comparing cots and nursery furniture. Converts buyers ready to decide. Meta builds awareness, Google captures intent."
    },
    {
      "id": "edm",
      "name": "EDM (Klaviyo)",
      "presets": "Teaser and countdown sends, launch-reveal send, styling and colour-combination content, browse and cart and post-purchase flows",
      "role": "Owned nurture and conversion. Delivers the full story (materials, sustainability, colours, features), drives launch conversions, and builds an audience activatable at no ad cost."
    },
    {
      "id": "social",
      "name": "Organic social (Instagram and Facebook)",
      "presets": "Countdowns, launch reveals, colour comparisons, nursery styling tips, how-to and assembly content, sustainability explainers",
      "role": "Brand building, education and community. Showcases the design aesthetic and sustainability ethos, positions Gaia as a trusted authority in sustainable, adaptable nursery furniture."
    },
    {
      "id": "retail",
      "name": "Retail and trade (baby stores)",
      "presets": "Premium POS signage showcasing customisation, staff training material, co-branded placements, retail-window promotions",
      "role": "In-person reassurance and credibility. Lets families and grandparents see real wood, finishes and colours. Expands accessibility nationwide; supports and aligns with online campaigns, does not undercut them."
    },
    {
      "id": "event",
      "name": "Tradeshows and expos",
      "presets": "Stand graphics and the UPPAbaby collaboration, expo bundles, demo units, education assets, CRM capture",
      "role": "Direct consumer engagement and acquisition. PBC and One Fine Baby expos across the year. Education-led selling, expo bundles, and the UPPAbaby pram-plus-furniture bundle."
    },
    {
      "id": "affiliate",
      "name": "Influencer and partnerships",
      "presets": "Styling and nursery-setup content, design-led creator collaborations, value-aligned brand partnerships",
      "role": "Reinforce brand values and visual identity through aligned creators and partners. Nursery-styling and real-home content that drives consideration. Disclose gifted or paid content (ACCC)."
    }
  ],
  "products": [
    {
      "name": "Eos Cot Bed",
      "type": "Convertible cot (Eos range, hero 2026)",
      "note": "100% real NZ pine, converts cot to toddler bed, frame in Natural Ash or White with 6 interchangeable base colours. Accessible mid-market price. Confirm exact AU pricing and current colour names before use."
    },
    {
      "name": "Eos Dresser",
      "type": "Dresser with change top (Eos range)",
      "note": "Built-in change-table top, matching customisation system. Often sold as a cot-plus-dresser bundle. Confirm exact AU pricing before use."
    },
    {
      "name": "Hera range",
      "type": "Upper-tier nursery (incl. Hera rocker)",
      "note": "Premium upper-tier range. Confirm exact current Hera line-up and pricing before naming specific pieces."
    },
    {
      "name": "Serena range",
      "type": "Upper-tier nursery furniture",
      "note": "Premium upper-tier range used in retail partnership expansion. Confirm exact current Serena line-up and pricing before naming specific pieces."
    }
  ],
  "mandatory": [
    "Lead with material authenticity (real wood, not MDF or chipboard), customisation and grows-with-child longevity.",
    "Hold the calm, design-led aesthetic. Warm, minimal, timeless, never busy or baby-themed.",
    "Educate on sustainability and materials rather than asserting it. Show the why.",
    "Frame Gaia as a considered long-term investment, value from durability and reuse, not from being cheap.",
    "Speak to both buyers where relevant: the style-conscious first-time parent and the peace-of-mind grandparent.",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No baby-themed, cartoonish or cluttered visual treatment.",
    "No hard-sell or heavy discount-led messaging that erodes the premium perception (Eos competes on value, not price-cutting).",
    "No vague or unsubstantiated sustainability or eco claims (greenwashing risk).",
    "No implying Eos is a premium-tier price product; it is accessible mid-market real wood.",
    "No safety, standards or material claims that are not verified for the specific AU product."
  ],
  "nonNegotiables": [
    "We will not compromise material authenticity or the design ethos to hit a price.",
    "We will not make sustainability claims we cannot substantiate.",
    "We will not erode premium brand perception through discount-led tactics, even on the accessible Eos range.",
    "We will not make safety or standards claims that are not verified for the specific Australian product.",
    "We will keep D2C, retail and expo coherent and aligned, not competing."
  ],
  "standingFlags": [
    {
      "level": "must",
      "note": "Furniture safety and standards claims must be verified for the specific Australian product before publishing. Cots and nursery furniture are subject to mandatory and voluntary Australian safety standards (for example the cots standard). Do not state or imply compliance, 'meets standard' or 'certified' unless verified for the specific product."
    },
    {
      "level": "must",
      "note": "Sustainability and material claims (real wood, sustainably or responsibly sourced, non-toxic finishes, eco-friendly) must be accurate and substantiable under the ACL and ACCC greenwashing guidance. Avoid broad, vague environmental claims; tie each claim to a specific, verifiable fact."
    },
    {
      "level": "check",
      "note": "Comparative claims against named competitors (Mocka, Boori, Babyhood, Temple and Webster) including material comparisons (real wood vs MDF or chipboard) must be truthful, current and not misleading. Competitor product specs change; verify before publishing a comparison."
    },
    {
      "level": "check",
      "note": "'Premium', 'best mid-market', 'leading' and similar claims must be truthful and not misleading. Frame leadership language as positioning ambition where it is not substantiated."
    },
    {
      "level": "check",
      "note": "Non-toxic and finish claims relate to child safety; ensure they reflect the actual current product certification and do not overstate. Verify before use."
    },
    {
      "level": "check",
      "note": "Review and ratings figures must reflect genuine, current reviews. Disclose incentivised reviews and gifted or paid creator content (ACCC)."
    }
  ],
  "siteUrl": "https://gaia-baby.com.au",
  "marketContext": "nursery furniture and cots in Australia"
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
