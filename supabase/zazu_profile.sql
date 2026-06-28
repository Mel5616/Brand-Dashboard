-- Zazu brand profile (adapted: brand_profiles + siteUrl/marketContext + blog channel)
insert into brand_profiles (slug, name, tier, profile) values
('zazu', 'Zazu', 'C', $json$
{
  "essence": "Better sleep for kids, and parents too. Products that work better and last longer, solving real bedtime problems with clean design and honest materials.",
  "brandLine": "Better sleep for kids and parents too.",
  "positioning": "Zazu makes children's sleep and bedtime products: nightlights, projectors, sleep-trainer clocks, white-noise machines, soft toys and sleep accessories. The brand is built on calm, functional, well-made products that solve real bedtime problems and last, with clean design and honest materials. The promise runs to the whole household: better sleep for the child, and an easier bedtime for the parent.",
  "hero": "Zazu's range spans a few clear jobs-to-be-done: help a child feel safe in the dark (nightlights), wind down and drift off (projectors, white noise, breathing light), and learn when to stay in bed and when it is OK to get up (sleep-trainer clocks). Lead with the bedtime problem the product solves and the named character, not a spec list. Confirm the current AU line-up and character names before naming them.",
  "tone": [
    "Calm, warm and reassuring, built for the bedtime moment",
    "Practical and honest, problem-and-solution led, not hype",
    "Friendly and character-driven (named animals), approachable for tired parents",
    "Plain and clear, no clinical or technical overload"
  ],
  "messageHierarchy": {
    "brand": "Better sleep for kids and parents too. Calm, functional, well-made bedtime products that solve real problems and last.",
    "category": "Children's sleep and bedtime aids: nightlights, projectors, sleep-trainer clocks, white-noise machines and accessories.",
    "product": "Name the bedtime problem (fear of the dark, won't wind down, up too early) and the character, then the calm it brings. Honest materials, clean design, built to last.",
    "proof": "Award-winning range, thoughtful child-friendly design, clean materials, real parent reviews. Functional benefits described carefully, not as guaranteed outcomes."
  },
  "proofPoints": [
    "Award-winning children's sleep range (verify the specific award and year before citing)",
    "Purpose-built for distinct bedtime jobs: fear of the dark, winding down, early rising",
    "Thoughtful, child-friendly design and considered safety features (cool-touch LED, auto shut-off, volume-limited sound, where applicable to the specific AU product)",
    "Clean design and honest materials, built to work better and last longer",
    "Real parent reviews and an established AU presence (Australian warehouse, stockists)"
  ],
  "audience": {
    "primary": "Parents of babies, toddlers and young children (roughly 0 to 6) navigating bedtime battles, fear of the dark, early rising or unsettled sleep. They want calm, practical, well-made products that genuinely help, and they read reviews before buying.",
    "split": "Secondary: gift-buyers (grandparents, friends) for whom the character-led design and clear bedtime benefit make an easy, thoughtful present. Stockists and retail partners are a B2B audience for the trade and partnership side."
  },
  "pillars": [
    {
      "id": "calm",
      "name": "Calm at Bedtime",
      "desc": "Products designed to settle and soothe: soft light, gentle sound, breathing and dimming cues. The brand exists to make the wind-down easier for child and parent."
    },
    {
      "id": "function",
      "name": "Solves a Real Problem",
      "desc": "Every product maps to a specific bedtime job: fear of the dark, won't wind down, up too early. Lead with the problem and the relief, not the feature list."
    },
    {
      "id": "craft",
      "name": "Clean Design, Honest Materials",
      "desc": "Well-made products that work better and last longer. Considered, child-friendly design and honest materials, not throwaway gadgets."
    },
    {
      "id": "wholehome",
      "name": "Better Sleep for Everyone",
      "desc": "The benefit runs to the whole household. When the child sleeps better, so do the parents. Speak to both."
    },
    {
      "id": "trust",
      "name": "Safe and Reassuring",
      "desc": "Child-friendly, considered safety, and a calm, trustworthy tone. All safety, electrical and efficacy claims verified for the specific AU product before use."
    }
  ],
  "moments": [
    {
      "id": "bedtime_battles",
      "name": "Bedtime Battles and Winding Down",
      "pillar": "calm",
      "objective": "Help children settle and fall asleep more easily",
      "focus": "Projectors, white-noise machines and breathing-light products for the wind-down. Pair with the consistent-routine message. Describe the calming benefit honestly; avoid quantified efficacy claims (e.g. 'falls asleep X% faster') unless substantiated for the AU product."
    },
    {
      "id": "fear_of_dark",
      "name": "Fear of the Dark",
      "pillar": "function",
      "objective": "Help children feel safe in their own room",
      "focus": "Nightlights and wall lights (warm glow, cool-touch, soft toys, gesture or cry-sensor features where applicable). Lead with the child feeling safe and the parent checking in without waking them."
    },
    {
      "id": "early_rising",
      "name": "Up Too Early",
      "pillar": "function",
      "objective": "Teach when to stay in bed and when it is OK to get up",
      "focus": "Sleep-trainer clocks (the named-character clocks) that use gentle cues to signal sleep and wake. Frame as a calm habit-builder for the household, not a behavioural guarantee."
    },
    {
      "id": "newborn_settling",
      "name": "Newborn Settling and On-the-Go",
      "pillar": "calm",
      "objective": "Support settling for babies and travel",
      "focus": "White noise, heartbeat and breathing-light products, the portable sleep pod and the pram and baby rocker. Calm, portable settling for home and away. Verify any infant-safe-use guidance for the specific product."
    },
    {
      "id": "gifting",
      "name": "Gifting",
      "pillar": "craft",
      "objective": "Win the easy, thoughtful present",
      "focus": "Character-led design and a clear bedtime benefit make Zazu a natural gift for new parents and young children. Lead with the character and the moment. Lean into seasonal gift windows."
    },
    {
      "id": "education",
      "name": "Bedtime Education and Routine",
      "pillar": "wholehome",
      "objective": "Be a helpful voice on better sleep, not just a product",
      "focus": "Practical, honest content on routines, winding down and gentle sleep habits. Helpful guidance that earns trust. Educational, not clinical, and free of medical or treatment claims."
    },
    {
      "id": "retail",
      "name": "Retail and Stockists",
      "pillar": "trust",
      "objective": "Build presence and confident selling through partners",
      "focus": "Stockist and retail support: POS, product education so staff can match the right product to the bedtime problem, and consistent presentation. Australian-warehouse dispatch and warranty support as reassurance."
    }
  ],
  "channels": [
    {
      "id": "pdp",
      "name": "D2C and website (Shopify, zazu-kids.com.au)",
      "presets": "Problem-led collection pages (nightlights, projectors, sleep trainers, white noise), character product pages, reviews, FAQ",
      "role": "Owned hero. Organised by bedtime problem and character. Educates on which product suits which sleep challenge and converts. Australian warehouse and shipping reassurance."
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
      "presets": "Calming bedtime lifestyle, character reveals, problem-and-solution Reels 1080x1920 and feed 1080x1350, retargeting",
      "role": "Primary awareness and visual storytelling. Show the calm bedtime moment and the character. Reaches parents and gift-buyers; builds warm audiences for retargeting."
    },
    {
      "id": "search",
      "name": "Google Ads (Search, Shopping, PMax)",
      "presets": "High-intent bedtime terms (toddler nightlight, sleep trainer clock, baby white noise, star projector), Shopping feed, PMax",
      "role": "High-intent capture for parents actively solving a sleep problem. Converts the searching, ready-to-buy parent. Meta builds awareness, Google captures intent."
    },
    {
      "id": "edm",
      "name": "EDM (Klaviyo)",
      "presets": "Welcome and education flows, routine and wind-down tips, new-product and character launches, browse and cart and post-purchase flows",
      "role": "Nurture and retention. Helpful bedtime guidance plus product matching. Builds an owned audience and repeat purchase across the range."
    },
    {
      "id": "social",
      "name": "Organic social (Instagram and Facebook)",
      "presets": "Routine tips, character storytelling, real-home bedtime content, UGC, seasonal gifting",
      "role": "Community and education. Calm, helpful, character-led content that builds trust and familiarity. Honest benefit framing, no medical claims."
    },
    {
      "id": "affiliate",
      "name": "Influencer and partnerships",
      "presets": "Parent-creator bedtime content, honest reviews, gifting features, value-aligned collaborations",
      "role": "Credible discovery through trusted parent voices and gift round-ups. Real bedtime experience over polish. Disclose gifted or paid content (ACCC); brief creators away from medical or quantified efficacy claims."
    },
    {
      "id": "retail",
      "name": "Retail and stockists",
      "presets": "POS, product-education and staff training, consistent merchandising, become-a-stockist materials",
      "role": "Physical presence and confident selling. Helps staff match product to bedtime problem. Australian-warehouse dispatch and warranty support as trade reassurance."
    }
  ],
  "products": [
    {
      "name": "Nightlights and wall lights",
      "type": "Nightlight (electronic)",
      "note": "Named-character range (for example Lou the Owl, Billy, Emmy, Katie, Bo, Max, and the wall light with soft toys). Features vary: warm glow, cool-touch LED, cry sensor, gesture control, breathing light. Confirm the current AU line-up, features and electrical safety (RCM) before claims."
    },
    {
      "name": "Bedtime projectors",
      "type": "Projector (electronic)",
      "note": "Star, sunset and ocean projectors with melodies and, on some, a multi-step sleep program and cry sensor (for example Tim, Cody, Otto, Leo). Confirm current AU models and features before naming them."
    },
    {
      "name": "Sleep-trainer clocks",
      "type": "Sleep trainer (electronic)",
      "note": "Teach when to stay in bed and when it is OK to get up (for example Davy the Dog, Sam, Pam, Bobby, Brody). Frame as a gentle habit-builder, not a behavioural guarantee."
    },
    {
      "name": "White-noise and sound machines",
      "type": "Sound machine (electronic)",
      "note": "For example Dex the Dog and Suzy. Volume matters for infant hearing; verify volume-limiting and any infant-safe-use guidance for the specific AU product before claims."
    },
    {
      "name": "Sleep accessories, soft toys and rocker",
      "type": "Accessories",
      "note": "Rest Nest portable sleep pod, Baby and Pram Rocker (Robby), soft toys (for example Timo the Clapping Toucan). Confirm current AU range and any safe-sleep or safe-use guidance before referencing."
    }
  ],
  "mandatory": [
    "Lead with the bedtime problem and the named character, then the calm or benefit it brings.",
    "Keep the tone calm, warm, honest and practical. Built for the bedtime moment, never hype.",
    "Speak to the whole household: better sleep for the child and an easier night for the parent.",
    "Describe functional benefits carefully and honestly. No medical, therapeutic or guaranteed-outcome claims.",
    "Reinforce clean design, honest materials and built-to-last quality.",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No US-market claims imported into AU marketing (see standing flags): no 'CPSIA certified', no 'meets or exceeds US safety standards', no American Academy of Pediatrics references.",
    "No quantified efficacy claims (for example 'fall asleep 40% faster') unless substantiated for the specific AU product.",
    "No 'science-backed', 'clinically proven' or similar unless substantiated and verified for the AU product.",
    "No medical or therapeutic claims (does not treat sleep disorders, conditions or developmental issues).",
    "No hype or pressure-led tone that breaks the calm, trustworthy bedtime feel."
  ],
  "nonNegotiables": [
    "We describe sleep benefits honestly and never as guaranteed outcomes.",
    "We do not import US claims, certifications or standards into Australian marketing.",
    "We make no medical or therapeutic claims about children's sleep.",
    "We verify electrical and product safety for the specific AU product before any safety claim.",
    "We keep the brand calm, honest and helpful, never hype-led."
  ],
  "standingFlags": [
    {
      "level": "must",
      "note": "The global Zazu site (zazusleep.com) makes claims the Australian site deliberately avoids: 'fall asleep 40% faster', 'science-backed breathing light technology', 'CPSIA certified', 'meets or exceeds US safety standards', and American Academy of Pediatrics references. Do NOT import any of these into Australian marketing. US certifications and standards do not apply in Australia, and quantified or 'science-backed' efficacy claims need substantiation under the ACL."
    },
    {
      "level": "must",
      "note": "Zazu products are electronic and battery or mains powered. Electrical and electronic product safety (including the RCM mark and relevant AU electrical safety requirements) must be verified for the specific AU product before any safety claim. Do not state or imply compliance, certification or a safety standard unless verified for that product."
    },
    {
      "level": "must",
      "note": "No medical or therapeutic claims. Do not claim or imply Zazu products treat, cure or prevent sleep disorders, conditions or developmental issues. Describe calming, settling and routine support, not clinical outcomes."
    },
    {
      "level": "check",
      "note": "Sleep-efficacy and behaviour claims (helps fall asleep faster or easier, reduces bedtime battles, teaches when to wake) must be honestly framed and substantiable under the ACL. Prefer 'aids' and 'helps' over guarantees; avoid specific percentages unless substantiated."
    },
    {
      "level": "check",
      "note": "'Award-winning' must reference a genuine, specific award; verify the award and year before citing."
    },
    {
      "level": "check",
      "note": "Sound-machine volume and infant hearing: any volume-safety or hearing claim must reflect the actual current AU product and be verified. Reviews and gifted or paid creator content must be genuine and disclosed (ACCC)."
    }
  ],
  "siteUrl": "https://zazu-kids.com.au",
  "marketContext": "children's sleep aids and nightlights in Australia"
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
