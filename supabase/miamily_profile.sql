-- MiaMily brand profile (adapted: brand_profiles + siteUrl/marketContext + blog channel)
insert into brand_profiles (slug, name, tier, profile) values
('miamily', 'MiaMily', 'C', $json$
{
  "essence": "Swiss-designed family travel luggage that makes moving through the world with kids easier: a ride-on carry-on with a built-in seat, smart storage and refined design.",
  "brandLine": "Family travel, made easier.",
  "positioning": "MiaMily is a Swiss-designed family travel and lifestyle brand (founded 2014) known for innovative ride-on luggage and expandable backpacks. The hero is a carry-on suitcase with a patented built-in seat: a fun, secure ride for a child through the airport and a resting seat for an adult, with smart organisation, a zipper-free TSA-approved lock and 360-degree wheels. The mission is to make travel easier for modern families by combining function, safety and refined design. The range extends to larger check-in cases, luggage sets and backpacks.",
  "hero": "The hero is the ride-on Carry-On with the built-in seat, sold in a few colourways and as part of luggage sets with a larger medium or check-in case. Lead with the real family-travel moment (the terminal, the boarding queue, the tired toddler) and the relief the built-in seat brings, then the smart storage and refined design. Always carry the safe-use guidance with the ride-on benefit, never the benefit alone. Confirm the current AU range, sizes and pricing before naming items.",
  "tone": [
    "Calm, refined and design-led, premium family travel, not gimmicky",
    "Practical and reassuring, solves a real travel-with-kids pain",
    "Warm and human, on the side of the travelling parent",
    "Clear and responsible, the safe-use guidance is part of the story, not fine print"
  ],
  "messageHierarchy": {
    "brand": "Swiss-designed family travel luggage that makes travelling with kids easier. Function, safety and refined design.",
    "category": "Ride-on carry-on luggage with a built-in seat, plus check-in cases, sets and backpacks for modern family travel.",
    "product": "Name the travel moment (long terminal walks, boarding queues, a tired child) and the relief the built-in seat and smart storage bring, with safe-use always attached.",
    "proof": "Swiss design, patented built-in seat, durable materials, TSA-approved lock, real traveller reviews and an AU limited lifetime warranty. Safety and airline claims stated carefully (see flags)."
  },
  "proofPoints": [
    "Swiss-designed, founded 2014, established family-travel brand",
    "Patented built-in seat, a ride for a child and a resting seat for an adult",
    "Durable build (impact-resistant polycarbonate, aluminium frame, wider base for stability)",
    "Zipper-free, TSA-approved lock and 360-degree spinner wheels",
    "AU limited lifetime warranty and free shipping; ships nationwide",
    "Strong, genuine traveller reviews (use real, current reviews only)"
  ],
  "audience": {
    "primary": "Modern travelling families with young children (toddler and up) who fly or move through airports, hotels and cities and want to make travel with kids easier. They value design, durability and clever function, are willing to invest in premium travel gear, and research and read reviews before buying.",
    "split": "Secondary: gift-buyers and frequent-traveller parents; the refined design and adult-seat use also broaden appeal beyond families. Retail and stockist partners (baby and travel retailers) are a B2B audience for the trade side."
  },
  "pillars": [
    {
      "id": "easier",
      "name": "Travel Made Easier",
      "desc": "Solves the real pain of moving through airports with a tired child: the built-in seat, smart storage and smooth wheels turn waiting time into downtime. Lead with the moment of relief."
    },
    {
      "id": "design",
      "name": "Swiss Design",
      "desc": "Refined, considered, premium. Zipper-free, clean lines, thoughtful organisation. Design-led, never gimmicky."
    },
    {
      "id": "durable",
      "name": "Built to Last",
      "desc": "Impact-resistant materials, aluminium frame, stable wider base, backed by an AU limited lifetime warranty (warranty terms and exclusions stated accurately)."
    },
    {
      "id": "versatile",
      "name": "Multi-Use",
      "desc": "A ride for a child, a seat for an adult, and a stable base for stacking bags or storing a nappy bag when travelling without a child. One product, many jobs."
    },
    {
      "id": "responsible",
      "name": "Safe and Responsible Use",
      "desc": "The built-in seat is a genuine feature with genuine limits. Safe-use guidance travels with every ride-on message: supervised, belted, one child, 2+, not a toy. Never sell the ride without the rules."
    }
  ],
  "moments": [
    {
      "id": "airport_travel",
      "name": "Airport and Terminal Travel",
      "pillar": "easier",
      "objective": "Own the ride-on carry-on moment for travelling families",
      "focus": "The core moment: long terminal walks, boarding queues, a tired toddler. Lead with the built-in seat turning waiting into downtime, smart packing and smooth wheels, with safe-use guidance attached. Airline-fit framed carefully (fits most overhead bins, always check your airline)."
    },
    {
      "id": "family_trips",
      "name": "Family Trips and Getaways",
      "pillar": "versatile",
      "objective": "Position the range for whole-family travel",
      "focus": "Carry-on plus medium or check-in case and sets for getaways of different lengths. Multi-use seat, smart organisation, matching Swiss design across sizes. The practical, stylish choice for family travel."
    },
    {
      "id": "gifting",
      "name": "Gifting and Premium Purchase",
      "pillar": "design",
      "objective": "Win the considered, giftable premium buy",
      "focus": "Refined design and a genuinely useful feature make MiaMily a strong premium gift for travelling parents and a considered self-purchase. Lead with design and the travel benefit; lean into travel and gift windows."
    },
    {
      "id": "education",
      "name": "Travel-With-Kids Education and Safe Use",
      "pillar": "responsible",
      "objective": "Be a helpful, responsible voice on family travel",
      "focus": "Practical content on travelling with young children, packing, airport tips, and correct, safe use of the ride-on seat. Helpful guidance that builds trust and models responsible use. Safe-use guidance is content, not fine print."
    },
    {
      "id": "retail",
      "name": "Retail and Stockists",
      "pillar": "durable",
      "objective": "Build presence and confident, accurate selling through partners",
      "focus": "Baby and travel retailers (the range is already stocked widely). POS, product education, consistent premium presentation, and accurate communication of warranty, airline-fit and safe-use. Demo units show the seat and wheels."
    }
  ],
  "channels": [
    {
      "id": "pdp",
      "name": "D2C and website (Shopify, miamily.com.au)",
      "presets": "Ride-on carry-on and set product pages, colourways, dimensions and capacity specs, safe-use and airline-fit copy, reviews, FAQ",
      "role": "Owned hero. Demonstrates the built-in seat, storage, wheels and durability, communicates safe-use and airline-fit accurately, and converts. AU warranty and free shipping as reassurance."
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
      "presets": "Real family-travel lifestyle, the seat in action, colourway carousels, demo Reels 1080x1920 and feed 1080x1350, retargeting",
      "role": "Primary awareness and visual storytelling. Show the travel moment and the seat. Keep ride-on depictions responsible (belted, supervised). Reaches travelling parents and gift-buyers; builds warm audiences."
    },
    {
      "id": "search",
      "name": "Google Ads (Search, Shopping, PMax)",
      "presets": "High-intent terms (ride-on suitcase, kids carry-on, ride-on luggage with seat, family carry-on), Shopping feed, PMax",
      "role": "High-intent capture for parents actively shopping family travel luggage. Converts the searching, ready-to-buy traveller. Meta builds awareness, Google captures intent."
    },
    {
      "id": "edm",
      "name": "EDM (Klaviyo)",
      "presets": "Welcome and travel-tips flows, new-colour and set launches, gifting and travel-window campaigns, browse and cart and post-purchase flows",
      "role": "Nurture and retention. Travel guidance plus product and set prompts. Builds an owned audience and repeat or upgrade purchase across sizes and sets."
    },
    {
      "id": "social",
      "name": "Organic social (Instagram and Facebook)",
      "presets": "Family-travel tips, the seat in real use, packing content, UGC, gifting and travel inspiration",
      "role": "Community and education. Aspirational but practical travel content that builds trust and models safe use. Honest framing on the seat, airline-fit and durability."
    },
    {
      "id": "affiliate",
      "name": "Influencer and partnerships",
      "presets": "Travelling-parent creator content, honest reviews, travel and gift round-ups, value-aligned collaborations",
      "role": "Credible discovery through trusted travelling-parent voices and travel round-ups. Real family-travel use over polish. Disclose gifted or paid content (ACCC); brief creators to show safe use (belt, supervision)."
    },
    {
      "id": "retail",
      "name": "Retail and stockists (baby and travel)",
      "presets": "Demo units, POS, product education and staff training, accurate warranty, airline-fit and safe-use messaging",
      "role": "Physical presence and confident, accurate selling. Demos show the seat and wheels. Premium, consistent presentation, with safe-use and warranty communicated correctly."
    }
  ],
  "products": [
    {
      "name": "Ride-On Carry-On (with built-in seat)",
      "type": "Carry-on luggage (hero)",
      "note": "Patented built-in seat: a ride for a child and a resting seat for an adult, plus a base for stacking bags. Zipper-free TSA-approved lock, 360-degree wheels, multiple interior compartments, several colourways. Supports up to ~100kg / 220lbs total. Confirm current AU sizes, capacity and pricing before use. Always pair with safe-use guidance."
    },
    {
      "name": "Medium and check-in cases",
      "type": "Larger luggage",
      "note": "Larger cases (e.g. ~64cm medium) for longer trips, impact-resistant polycarbonate. Confirm current AU sizes and pricing before naming them."
    },
    {
      "name": "Luggage sets",
      "type": "Sets",
      "note": "Two-piece and matching sets (e.g. ride-on carry-on plus medium case) with cohesive Swiss design. Confirm current AU set configurations and pricing before referencing."
    },
    {
      "name": "Backpacks",
      "type": "Backpacks",
      "note": "Expandable family and travel backpacks. Confirm current AU availability and range before referencing."
    }
  ],
  "mandatory": [
    "Always pair the ride-on seat benefit with safe-use guidance: recommended 2+, one child at a time, built-in seat belt, adult supervision, never on empty luggage, child able to sit unassisted. The benefit never travels without the rules.",
    "Lead with the real family-travel moment and the relief, then design, storage and durability.",
    "Hold the refined, premium, design-led tone. Practical and reassuring, never gimmicky.",
    "State airline-fit carefully: fits most overhead bins, always check your specific airline.",
    "State warranty accurately, including its exclusions (it does not cover carrier mishandling or normal wear).",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No depicting or describing unsafe use of the ride-on seat (unbelted, unsupervised, multiple children, child on empty luggage, riding it like a toy).",
    "No positioning the ride-on suitcase as a toy; the brand explicitly states it is not a toy.",
    "No absolute or guaranteed airline-acceptance claims; airline policies vary.",
    "No overstated or absolute safety claims; describe features and correct use, not guaranteed safety.",
    "No importing overseas certifications as if they were AU approvals; reference the correct AU requirements."
  ],
  "nonNegotiables": [
    "We never show or describe the ride-on seat being used unsafely, and safe-use guidance accompanies every ride-on message.",
    "We never call the ride-on suitcase a toy.",
    "We never guarantee airline acceptance; we always say to check the specific airline.",
    "We state warranty terms and exclusions accurately.",
    "We keep safety and product claims verified for the specific AU product."
  ],
  "standingFlags": [
    {
      "level": "must",
      "note": "The ride-on seat is the central compliance area. The brand's own copy carries strict safe-use guidance: recommended for children 2+, not a toy, one child seated at a time, built-in seat belt used, adult always supervising, never leave a child unattended on the seat, never seat a child on empty luggage, child must be able to sit unassisted. Every ride-on depiction or claim in any channel must carry this guidance and must not show unsafe use. This is a child-safety matter, treat it as load-bearing."
    },
    {
      "level": "must",
      "note": "Do not make absolute or guaranteed safety claims about a child riding the luggage. Describe the safety features (seat belt, wider base, stability) and correct use, not a guarantee of safety. The product is luggage with a seat feature, not certified child-restraint or ride-on safety equipment; do not imply a safety certification it does not hold."
    },
    {
      "level": "check",
      "note": "Airline-fit claims must stay qualified: 'fits most overhead bins, always check your airline'. Airline cabin-baggage policies and dimensions vary; do not state guaranteed cabin acceptance. Use accurate current dimensions for the specific AU product."
    },
    {
      "level": "check",
      "note": "Weight-capacity and material claims (e.g. supports up to ~100kg / 220lbs, aluminium frame, impact-resistant polycarbonate) must match the actual current AU product spec. Verify before publishing; do not mix up figures across models."
    },
    {
      "level": "check",
      "note": "Warranty claims (AU limited lifetime warranty) must be stated accurately including exclusions (does not cover carrier or baggage-handler damage or normal wear and tear). Do not overstate coverage."
    },
    {
      "level": "check",
      "note": "Overseas references (TSA-approved lock, Swiss design, assembled in China) are fine as described but must be accurate; TSA is a US travel-security feature, not an AU safety approval. Reviews and gifted or paid creator content must be genuine and disclosed (ACCC)."
    }
  ],
  "siteUrl": "https://miamily.com.au",
  "marketContext": "family travel luggage and ride-on suitcases in Australia"
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
