-- Matchstick Monkey brand profile (adapted: brand_profiles + siteUrl/marketContext + blog channel)
insert into brand_profiles (slug, name, tier, profile) values
('matchstick-monkey', 'Matchstick Monkey', 'C', $json$
{
  "essence": "Award-winning teethers that help babies and parents navigate teething together: fun, flexible, hygienic, and ergonomically built for tiny hands.",
  "brandLine": "Teething, sorted together.",
  "positioning": "Matchstick Monkey makes award-winning silicone teethers and baby oral-care products. The signature product is a teether and gel applicator: textured bumps let a parent apply teething gel hygienically, without fingers, and the ergonomic, grippy shape is built for tiny hands and doubles as a pre-training toothbrush. The brand is fun, flexible, well-designed and practical, a friendly companion for the teething stage that makes a hard phase a little easier for baby and parent.",
  "hero": "The hero is the Teething Toy and Gel Applicator, sold across a wide colour range (around $21 to $23). Around it sit Animal Teethers (Fox, Giraffe, Lion, Pig), the Baby Sonic Toothbrush and replacement heads, bath toys and bundle sets. Lead with the teething moment and the practical, hygienic benefit (apply gel without fingers, soothe through chewing, develop motor skills), and the playful character. Confirm the current AU range and pricing before naming items.",
  "tone": [
    "Warm, friendly and reassuring, on the parent's side through a hard phase",
    "Practical and clear, function-led, easy to understand",
    "Playful and characterful (colours and animals), never clinical",
    "Honest and calm, acknowledges teething is hard without alarm"
  ],
  "messageHierarchy": {
    "brand": "Award-winning teethers that help babies and parents navigate teething together. Fun, flexible, hygienic and built for tiny hands.",
    "category": "Silicone teethers, gel applicators and baby oral care for the teething stage (roughly 3 months to 3 years).",
    "product": "Name the teething moment and the practical benefit: textured bumps apply gel hygienically without fingers, chewing soothes, the grippy shape builds motor skills, and it doubles as a pre-training toothbrush.",
    "proof": "Award-winning, food-grade BPA-free silicone, easy-clean (dishwasher, steriliser, fridge), and trusted by Australian parents. Care with any pain-relief efficacy language (see flags)."
  },
  "proofPoints": [
    "Award-winning teether range (verify the specific award and year before citing)",
    "Food-grade, BPA-free, non-toxic silicone; solid design that resists mould build-up",
    "Hygienic gel application without fingers, reaching hard-to-reach back gums and molars",
    "Ergonomic, lightweight, grippy design that supports motor-skill development and doubles as a pre-training toothbrush",
    "Easy clean: dishwasher, steam and cold-water sterilisation, fridge-friendly for cooling comfort",
    "Trusted by Australian parents and stocked widely (suitable approx. 3 months to 3 years)"
  ],
  "audience": {
    "primary": "Parents of babies and young toddlers (roughly 3 months to 3 years) going through teething, looking for a practical, safe, easy-to-clean way to soothe sore gums and apply teething products hygienically. They value design, safety and real usefulness, and they read reviews.",
    "split": "Secondary: gift-buyers (grandparents, friends, baby showers) drawn to the colourful, characterful, giftable design. Retail and stockist partners are a B2B audience for the trade side."
  },
  "pillars": [
    {
      "id": "practical",
      "name": "Practical and Hygienic",
      "desc": "Textured bumps apply teething gel without fingers and reach hard-to-reach gums; solid design resists mould; easy to clean and chill. Genuinely useful through a hard phase."
    },
    {
      "id": "design",
      "name": "Built for Tiny Hands",
      "desc": "Ergonomic, lightweight, grippy shape designed for babies to hold, supporting motor-skill development, and doubling as a pre-training toothbrush."
    },
    {
      "id": "safe",
      "name": "Safe Materials",
      "desc": "Food-grade, BPA-free, non-toxic silicone. Reassurance on what goes in baby's mouth. All material and safety claims verified for the AU product."
    },
    {
      "id": "playful",
      "name": "Fun and Characterful",
      "desc": "Colourful, playful, animal-led design that babies love and parents find giftable. Friendly, never clinical."
    },
    {
      "id": "together",
      "name": "Through It Together",
      "desc": "Teething is hard on baby and parent. The brand is a warm, practical companion that makes the stage a little easier for both."
    }
  ],
  "moments": [
    {
      "id": "teething",
      "name": "The Teething Stage",
      "pillar": "practical",
      "objective": "Be the go-to teether for sore-gum relief and hygienic gel application",
      "focus": "The core moment. Lead with the hard night, sore gums and the practical relief of chewing plus hygienic, finger-free gel application. Frame soothing through chewing and cooling honestly; be careful with pain-relief efficacy language (see flags), and note any teething gel is a separate product Matchstick Monkey does not make."
    },
    {
      "id": "oral_care",
      "name": "First Oral Care",
      "pillar": "design",
      "objective": "Own the move from teether to toothbrush",
      "focus": "The teether doubles as a pre-training toothbrush, and the Baby Sonic Toothbrush extends into early brushing habits. A natural progression that builds early oral-care routine. Keep claims to habit-forming and familiarity, not dental-health outcomes."
    },
    {
      "id": "gifting",
      "name": "Gifting and Baby Showers",
      "pillar": "playful",
      "objective": "Win the colourful, giftable purchase",
      "focus": "Colour range, animal characters and bundle sets make Matchstick Monkey an easy, cheerful gift for baby showers and new parents. Lead with character and the practical benefit. Lean into gift windows."
    },
    {
      "id": "education",
      "name": "Teething Education",
      "pillar": "together",
      "objective": "Be a helpful, calm voice on teething",
      "focus": "Practical, reassuring content on the teething stage, what helps, how to clean and cool a teether, when to use it. Helpful guidance that earns trust. No medical or treatment claims; signpost to health professionals for pain or symptoms."
    },
    {
      "id": "retail",
      "name": "Retail and Stockists",
      "pillar": "safe",
      "objective": "Build presence and confident selling through partners",
      "focus": "Strong fit for Baby Bunting, pharmacy and independents. POS, product education, and giftable merchandising. Australian authorised-retailer and warranty reassurance. Consistent, safe, accurate claims at shelf."
    }
  ],
  "channels": [
    {
      "id": "pdp",
      "name": "D2C and website (Shopify, matchstickmonkey.com.au)",
      "presets": "Colour and character product pages, teether vs toothbrush education, bundle sets, reviews, FAQ",
      "role": "Owned hero. Educates on the practical and hygienic benefit and the colour and character range, and converts. Free shipping threshold and AU dispatch as reassurance."
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
      "presets": "Colourful product and real-baby lifestyle, character and colour carousels, how-to Reels 1080x1920, retargeting",
      "role": "Primary awareness and visual storytelling. Show the teething moment and the playful range. Reaches parents and gift-buyers; builds warm audiences for retargeting."
    },
    {
      "id": "search",
      "name": "Google Ads (Search, Shopping, PMax)",
      "presets": "High-intent teething terms (baby teether, teething toy, teething gel applicator, baby toothbrush), Shopping feed, PMax",
      "role": "High-intent capture for parents in the teething stage. Converts the searching, ready-to-buy parent. Meta builds awareness, Google captures intent."
    },
    {
      "id": "edm",
      "name": "EDM (Klaviyo)",
      "presets": "Welcome and teething-education flows, new-colour and product launches, gifting and bundle prompts, browse and cart and post-purchase flows",
      "role": "Nurture and retention. Helpful teething guidance plus colour and bundle prompts. Builds an owned audience and repeat purchase across colours and oral care."
    },
    {
      "id": "social",
      "name": "Organic social (Instagram and Facebook)",
      "presets": "Teething tips, colour and character content, real-parent UGC, cleaning and cooling how-tos, gifting",
      "role": "Community and education. Warm, helpful, playful content that builds trust. Honest benefit framing, no medical or pain-cure claims."
    },
    {
      "id": "affiliate",
      "name": "Influencer and partnerships",
      "presets": "Parent-creator teething content, honest reviews, gifting features, value-aligned collaborations",
      "role": "Credible discovery through trusted parent voices and gift round-ups. Real teething experience over polish. Disclose gifted or paid content (ACCC); brief creators away from pain-cure or medical claims."
    },
    {
      "id": "retail",
      "name": "Retail and stockists (Baby Bunting, pharmacy, independents)",
      "presets": "POS, giftable merchandising, product education and staff training, authorised-retailer and warranty messaging",
      "role": "Physical presence and confident, accurate selling. Strong giftable impulse and considered fit. AU authorised-retailer and warranty support as trade reassurance."
    }
  ],
  "products": [
    {
      "name": "Teething Toy and Gel Applicator",
      "type": "Teether (hero)",
      "note": "Silicone teether with textured bumps that hold teething gel for hygienic, finger-free application; doubles as a pre-training toothbrush. Wide colour range (~$21 to $23). Approx. 3 months to 3 years. Matchstick Monkey makes the applicator, not the gel."
    },
    {
      "name": "Animal Teethers",
      "type": "Teether",
      "note": "Fox, Giraffe, Lion and Pig character teethers. Confirm current AU line-up and pricing before naming them."
    },
    {
      "name": "Baby Sonic Toothbrush and replacement heads",
      "type": "Oral care (electronic)",
      "note": "Sonic toothbrush for early brushing; replacement heads sold separately. If electronic, verify electrical and product safety (RCM) for the AU product before claims."
    },
    {
      "name": "Bath toys and bundle sets",
      "type": "Toys and bundles",
      "note": "Bath toys and curated bundles, useful for gifting. Confirm current AU range and pricing before referencing."
    }
  ],
  "mandatory": [
    "Lead with the teething moment and the practical, hygienic benefit (apply gel without fingers, soothe through chewing, build motor skills), plus the playful character.",
    "Keep the tone warm, friendly, practical and reassuring. On the parent's side, never clinical.",
    "Reinforce safe materials (food-grade, BPA-free silicone) and easy cleaning, verified for the AU product.",
    "Acknowledge teething is hard without alarm; be a calm, helpful companion.",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No claim that the teether itself relieves, cures or treats pain as a guaranteed outcome (pain-relief efficacy language needs care, see flags).",
    "No medical or therapeutic claims; do not position as a treatment for teething pain or any condition.",
    "No implying Matchstick Monkey makes or endorses a specific teething gel or drug; the gel is a separate product.",
    "No importing overseas certifications (for example FDA) into AU marketing as if they were AU approvals.",
    "No alarmist or fear-led framing of teething."
  ],
  "nonNegotiables": [
    "We describe soothing and comfort honestly and never claim the teether cures or treats pain.",
    "We do not make medical or therapeutic claims, and we signpost to health professionals for pain or symptoms.",
    "We keep teething-gel references clear that the gel is a separate product we do not make.",
    "We verify material, safety and any antimicrobial claims for the specific AU product before use.",
    "We keep the brand warm, practical and playful, never clinical or alarmist."
  ],
  "standingFlags": [
    {
      "level": "must",
      "note": "Pain-relief efficacy language needs care. Retailer copy widely uses 'soothe', 'relieve', 'source of the pain'. Matchstick Monkey makes a teether (a gel applicator), not a teething gel or drug. Describe comfort from chewing and cooling, and the hygienic application of gel, but do not claim the teether itself relieves, cures or treats teething pain as a guaranteed therapeutic outcome under the ACL. Any teething gel referenced is a separate therapeutic good that Coolkidz does not manufacture; do not make therapeutic claims about it."
    },
    {
      "level": "must",
      "note": "No medical or therapeutic claims. Do not position the teether as a treatment for teething pain or any condition. For pain or symptoms, signpost parents to a health professional rather than the product."
    },
    {
      "level": "check",
      "note": "Material and safety claims (food-grade, BPA-free, non-toxic silicone, mould-resistant design, dishwasher and steriliser safe) must reflect the actual current AU product. Verify before use."
    },
    {
      "level": "check",
      "note": "Antimicrobial claims (for example BioCote technology) are regulated claims; verify the claim is substantiated and currently applies to the AU product before using it, and do not imply it protects the child from illness."
    },
    {
      "level": "check",
      "note": "Overseas certifications (FDA, CE) are not AU approvals. Do not present them as Australian safety approvals. Confirm the product meets the relevant Australian toy and product safety requirements and reference those, not overseas marks."
    },
    {
      "level": "check",
      "note": "'Award-winning' must reference a genuine, specific award; verify the award and year before citing. Reviews and gifted or paid creator content must be genuine and disclosed (ACCC)."
    }
  ],
  "siteUrl": "https://matchstickmonkey.com.au",
  "marketContext": "baby teethers and oral care in Australia"
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
