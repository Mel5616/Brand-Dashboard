-- MAMAVE brand profile · Coolkidz Briefing Engine
-- Adapted to this dashboard: brand_profiles table + siteUrl/marketContext + blog channel.
insert into brand_profiles (slug, name, tier, profile) values
('mamave', 'Mamave', 'C', $json$
{
  "essence": "Support. Reassurance. Skincare that works.",
  "brandLine": "From bump to bub and beyond",
  "nameMeaning": "Mamave is a portmanteau of Mama and Love. Soft, modern and reassuring. Premium without being clinical, emotional without being sentimental.",
  "positioning": "A premium, Australian made maternity and baby skincare brand. Thoughtfully formulated, science-led products that support families from pregnancy through postpartum and early childhood, without unnecessary ingredients or overwhelming claims.",
  "hero": "No single hero SKU. The range is built on two pillars: Mumma Care for pregnancy and postpartum skin, and Bubba Care for gentle everyday baby skin. Lead with the range that fits the moment.",
  "siteUrl": "https://mamave.com.au",
  "marketContext": "maternity and baby skincare in Australia",
  "tone": [
    "Warm, informed and supportive",
    "Confident but never clinical",
    "Premium, modern and human"
  ],
  "audience": {
    "primary": "New and expecting parents, 25 to 40, pregnancy through early parenting. Research-driven, values reassurance, credibility, safety and ingredient transparency. Strong affinity for Australian made. Most engaged in early and mid pregnancy. Instagram, online research and reviews, and the D2C site are where they look.",
    "split": "Secondary audience is gift buyers (friends, family, baby showers) with limited product knowledge who want something trusted, premium and safe to give. For them, lead with easy-to-understand benefits, gifting cues and premium presentation. They sit mostly on marketplaces, gifting content and affiliate guides."
  },
  "pillars": [
    {"id": "science", "name": "Science-backed formulations", "desc": "Clear, evidence-based formulations parents can understand."},
    {"id": "australian", "name": "Made and Designed in Australia", "desc": "Local credibility, quality and trust."},
    {"id": "premium", "name": "Premium without being intimidating", "desc": "Beautiful, modern, calm and reassuring."},
    {"id": "parentfirst", "name": "Parent-first", "desc": "Supporting confidence, wellbeing and real-life needs."}
  ],
  "moments": [
    {"id": "pregnancy", "name": "Pregnancy and Postpartum Skin (Mumma Care)", "pillar": "science", "objective": "Support changing skin and build trust with expecting and new mums", "focus": "Stretching, dryness and sensitivity through pregnancy and postpartum. Mumma's Oil and Moisturiser. Early and mid pregnancy is peak engagement."},
    {"id": "babyskincare", "name": "Everyday Baby Skincare (Bubba Care)", "pillar": "parentfirst", "objective": "Establish Mamave as the gentle daily choice for delicate baby skin", "focus": "First bath, daily moisturising, nappy area protection. Bubba's Wash, Moisturiser, Massage Oil, Barrier Cream. Gentle, non-stripping, reassuring."},
    {"id": "education", "name": "Science and Ingredient Education", "pillar": "science", "objective": "Build credibility and reassurance through plain-language education", "focus": "Simple breakdowns of ingredients and why products work. Non-clinical, calm, confidence-building. The always-on engine of the brand."},
    {"id": "australianstory", "name": "Australian Made and Founder Story", "pillar": "australian", "objective": "Reinforce trust and authenticity", "focus": "Made and Designed in Australia credentials, founder narrative, local design."},
    {"id": "gifting", "name": "Gifting (baby showers and gift buyers)", "pillar": "premium", "objective": "Convert the secondary gift-buyer audience", "focus": "Gift-ready presentation, why this is a thoughtful and safe gift, easy benefits, premium cues. Peaks around baby showers and seasonal gifting."},
    {"id": "retail", "name": "Retail Launch and Ranging Support", "pillar": "parentfirst", "objective": "Help independent retailers stock and sell with confidence", "focus": "Staff education, sell sheets, POS, sampling, co-funded launches. Independent baby stores are the priority channel."},
    {"id": "advocacy", "name": "Reviews, UGC and Advocacy", "pillar": "parentfirst", "objective": "Drive social proof, repeat purchase and referral", "focus": "Real-parent testimonials, UGC, referral and loyalty. Screen all testimonials for therapeutic claims before use."}
  ],
  "channels": [
    {"id": "social", "name": "Organic social (Instagram-led)", "presets": "IG/FB feed 1080x1350, Story/Reel 1080x1920, carousel up to 10 frames", "role": "Primary channel for education, trust-building and community. Supportive and human, never salesy."},
    {"id": "blog", "name": "Blog / SEO", "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema", "role": "SEO-led education that ranks and supports PDP and retail conversion."},
    {"id": "paid", "name": "Paid social and digital (incl Google)", "presets": "Paid social 1080x1350 and 1080x1920, video 9:16 and 16:9, Search RSA", "role": "Education-led awareness and consideration. Restrained, supports retail launches and key moments, not a shortcut to scale."},
    {"id": "edm", "name": "EDM and CRM (Klaviyo)", "presets": "600px content width, modular blocks, single primary CTA", "role": "Welcome and education journeys, routines, loyalty, replenishment. Education-first, promotions sparingly."},
    {"id": "pdp", "name": "D2C / website", "presets": "Product page modules, FAQ schema, ingredient explainers, founder story, reviews", "role": "Education and brand authority, the source of truth. Sales secondary. Does not undercut retail."},
    {"id": "affiliate", "name": "Affiliate and partnerships", "presets": "Reviews, buying guides, education articles, gifting guides", "role": "Credibility-led discovery through trusted parenting, lifestyle and gifting voices. Education over discounting."},
    {"id": "retail", "name": "Retail and trade", "presets": "Sell sheets, POS, shelf talkers, staff training decks, sampling, gift-ready packaging", "role": "Education-led ranging with independent baby stores, pharmacy and gifting. Premium in-store execution."},
    {"id": "event", "name": "Tradeshows and events", "presets": "Stand graphics, samples, education assets", "role": "Brand-building and ranging at Coolkidz tradeshows. Education and presentation, not sales-only."},
    {"id": "marketplace", "name": "Online marketplaces (The Iconic, Adore Beauty)", "presets": "Listing imagery, A+ content, review presence", "role": "Controlled brand-building. Consistent pricing and premium standards, not volume or price-led."}
  ],
  "ranges": [
    {"name": "Mumma Care", "desc": "Supporting skin changes during pregnancy and postpartum."},
    {"name": "Bubba Care", "desc": "Gentle, everyday care for delicate baby skin."}
  ],
  "products": [
    {"name": "Bubba's Wash", "range": "Bubba Care", "role": "Gentle everyday cleansing for baby skin", "claimSafe": "Gentle, non-stripping cleansing. Suitable for everyday use. Supports comfort and softness without irritation."},
    {"name": "Bubba's Massage Oil", "range": "Bubba Care", "role": "Support bonding and skin comfort through gentle massage", "claimSafe": "Encourages calm, connection and routine. Gentle glide for delicate skin."},
    {"name": "Bubba's Moisturiser", "range": "Bubba Care", "role": "Everyday hydration for delicate baby skin", "claimSafe": "Supports soft, hydrated skin. Suitable for daily routines."},
    {"name": "Bubba's Barrier Cream", "range": "Bubba Care", "role": "Protect and support skin in the nappy area", "claimSafe": "Creates a protective barrier. Supports skin comfort. Suitable for frequent use. Do not frame as treating or healing nappy rash unless ARTG supports it."},
    {"name": "Mumma's Pregnancy and Postpartum Oil", "range": "Mumma Care", "role": "Support changing skin during pregnancy and postpartum", "claimSafe": "Nourishing support for changing skin. Helps maintain comfort and hydration. Do not claim it prevents or reduces stretch marks."},
    {"name": "Mumma's Pregnancy and Postpartum Moisturiser", "range": "Mumma Care", "role": "Daily hydration and comfort for pregnancy and postpartum skin", "claimSafe": "Gentle, effective hydration. Supports skin comfort as the body changes. Lightweight for daily use."}
  ],
  "mandatory": [
    "Made and Designed in Australia credentials where relevant.",
    "Plain-language, science-led explanation. Educate without overwhelming.",
    "Clear, calm, confidence-building tone in every asset.",
    "Use real-parent reviews and testimonials for social proof where the format allows, screened for compliance.",
    "D2C supports retail. Never undercut retail partners on price."
  ],
  "exclusions": [
    "No discount-led, deal-driven or aggressive promotional framing. Subscriptions are a convenience benefit, not a discount.",
    "No clinical or cold tone. Confident but never clinical.",
    "No hype, overwhelming claims or doing-more messaging. Do what matters, well.",
    "No fear-based messaging.",
    "No D2C activity that undercuts retail partners on price."
  ],
  "standingFlags": [
    {"level": "must", "note": "Keep product claims cosmetic (cleanses, moisturises, hydrates, softens, protects, soothes for comfort). Do not make therapeutic claims (treats, heals, cures, prevents or relieves a condition such as eczema, dermatitis, nappy rash or stretch marks) unless that specific product is ARTG-registered and the claim is permitted. Verify before use."},
    {"level": "must", "note": "Do not assert ARTG, TGA or approved or registered status, or clinically proven, without verification and evidence on file."},
    {"level": "must", "note": "Pregnancy and baby safety claims need care. Use designed for use through pregnancy and postpartum rather than implying medical or doctor-endorsed safety, unless substantiated."},
    {"level": "check", "note": "Substantiate science-led, science-backed and any ingredient efficacy claim. Avoid clinically proven unless you hold the evidence."},
    {"level": "check", "note": "Substantiate cruelty-free. Avoid vague or absolute claims like no nasties, chemical-free, toxin-free or all natural that can mislead under Australian Consumer Law."},
    {"level": "check", "note": "Screen reviews, testimonials and UGC for therapeutic claims before amplifying. Testimonials that reference treating a condition cannot be used."}
  ]
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
