-- FRIDA brand profile · Coolkidz Briefing Engine
-- Adapted: brand_profiles table + siteUrl (AU) / marketContext + blog channel.
-- COMPLIANCE: highest-risk brand (TGAC + ACL, therapeutic goods). See standingFlags.
insert into brand_profiles (slug, name, tier, profile) values
('frida', 'Frida', 'A', $json$
{
  "essence": "The honest, expert-backed brand that prepares parents for the reality of birth, recovery and early parenting. Not here to make it pretty, here to make it better.",
  "brandLine": "For the moments nobody prepares you for.",
  "positioning": "Frida is the honest, expert-backed brand that gives parents exactly what they need, before they even know they need it. It prepares parents for the reality of birth, recovery and early parenting, honestly, practically and without sugarcoating. Frida is already in the Australian market; the task is to scale from a brand with a footprint into the brand that owns the postpartum and early-parenting care category by leading an honest conversation no other brand is having.",
  "hero": "Frida's hero products carry the brand: the Postpartum Recovery Kit (the complete answer to 'what do I actually need?'), the Peri Bottle, Disposable Underwear and NoseFrida. Every product story follows one framework: define the moment, name the problem nobody warned about, deliver the outcome. Lead with the outcome, not the feature ('the thing that makes the first shower feel survivable', not the clinical product name). Products are framed as essential, not optional. All therapeutic claims must clear compliance first.",
  "siteUrl": "https://fridaaustralia.com.au",
  "marketContext": "postpartum recovery and baby care in Australia",
  "tone": [
    "Direct but not harsh",
    "Honest but not overwhelming",
    "Supportive without being patronising",
    "Confident without becoming clinical",
    "Like advice from a friend who has been through it, not a healthcare pamphlet and not an Instagram grid"
  ],
  "messageHierarchy": {
    "brand": "The honest, expert-backed brand that prepares parents for the reality of birth, recovery and early parenting. Real over ideal, preparation over surprise, support over judgment, function over fluff.",
    "category": "Owns the postpartum and early-parenting care conversation by saying the things others avoid, leading with honest education rather than promotion.",
    "product": "Define the moment, name the problem nobody warned about, deliver the outcome. Products framed as essential answers to real moments of need, not nice-to-haves.",
    "proof": "Global category authority, products built around real use cases, honest creator and customer storytelling, and trusted healthcare context. Substance over polish."
  },
  "proofPoints": [
    "Global category authority: Frida built the modern postpartum category, it did not just enter it",
    "Products designed around specific real-life moments, driving genuine trial and word-of-mouth",
    "Honest creator and customer storytelling that performs because it is real, not staged",
    "Healthcare familiarity and context (note: using health-professional endorsement in advertising is restricted, see standing flags)",
    "Amazon review depth on hero SKUs (reviews must be genuine and must not carry therapeutic claims)"
  ],
  "audience": {
    "primary": "The modern Australian parent who researches from the first trimester, consumes large volumes of content on TikTok, Instagram, podcasts and forums, seeks real, experience-led advice, dismisses anything sanitised or corporate, and will invest in products that make recovery easier and reflect their actual experience. Despite this, most still walk into birth and postpartum underprepared. The gap is honest, practical, relevant information.",
    "split": "The Partner in the Room is a distinct, almost entirely untapped audience: the father, co-parent, same-sex partner or support person who does the research, reads the forums at midnight and walks into the pharmacy with a list. Frida speaks to both people in the room by expanding the conversation, not splitting the brand or softening the message. Secondary trust audiences are healthcare professionals (midwives, maternal health nurses) and the influencer and community ecosystem."
  },
  "pillars": [
    {"id": "education", "name": "Education, Not Promotion", "desc": "Lead with honest, practical, relevant information. Education is load-bearing, not optional. A brand that requires explanation has a reason to show up everywhere with something genuinely useful to say."},
    {"id": "honesty", "name": "Real Over Ideal", "desc": "Say the things others will not and normalise real experiences. Direct and honest, never sanitised, never shaming, never shock for its own sake. Validate what parents are actually experiencing."},
    {"id": "function", "name": "Function Over Fluff", "desc": "Products built around specific real moments. Define the moment, name the problem, deliver the outcome. Essential, not aspirational."},
    {"id": "trust", "name": "Trust and Advocacy", "desc": "The parent and partner who advocate, the healthcare context that lends credibility, and the community that hosts the conversation. Real voices over paid reach."},
    {"id": "category", "name": "Category Ownership", "desc": "Create demand and own the postpartum conversation. Become the word people use when they mean honesty in parenting, before a competitor defines the category first."}
  ],
  "moments": [
    {"id": "category", "name": "Own the Postpartum Category", "pillar": "category", "objective": "Become the most trusted and recommended postpartum and baby-care brand in Australia within 24 months", "focus": "The overarching play. Lead an honest conversation no competitor is having, create demand rather than capture it, and move decisively before Due or others define the category on a copycat brief. Build from the centre out: metro first (Sydney, Melbourne, Brisbane), then secondary cities and regional once sell-through confirms the model."},
    {"id": "hospital", "name": "Hospital and Midwife Channel", "pillar": "trust", "objective": "Be recommended before a parent has started shopping", "focus": "The load-bearing trust channel. Private maternity hospitals first, public deferred. Education before referral: clinical reference materials, midwife sample kits, a named Coolkidz healthcare contact, and a 20 to 30 midwife advocacy network in Year 1. Midwives are professionals, not a distribution channel or paid spokespeople. All endorsement use in advertising must clear TGAC and AHPRA review first."},
    {"id": "influencer", "name": "Influencer Seeding and the Partner Perspective", "pillar": "honesty", "objective": "Drive discovery and trust through real, honest experience", "focus": "The primary discovery mechanism in this category. Seed 200+ creators in 90 days with an always-on gifting program. Open the untapped partner perspective. The brief is always: tell the truth about your experience. No staged scenarios, no too-clean outcomes. Creators must not make therapeutic claims and must disclose gifted content."},
    {"id": "d2c", "name": "D2C Brand Home and Content Hub", "pillar": "education", "objective": "Build the deepest trust and full-depth education", "focus": "The website is the centre of everything and the only place the full brand voice lives without compromise. 'What No One Tells You' content hub, trimester-based product journeys, a hospital-bag checklist builder, and subscription and replenishment. Every other channel points back here."},
    {"id": "amazon", "name": "Amazon Performance and Review Engine", "pillar": "function", "objective": "Win the decision at the moment of research and need", "focus": "A compounding performance engine and a primary research and validation tool. Dominate high-intent search, build genuine reviews per hero SKU, educate-while-selling A+ content, and Subscribe and Save on replenishment. Reviews must be authentic, disclosed if incentivised, and free of therapeutic claims."},
    {"id": "massretail", "name": "Pharmacy and Grocery (Chemist Warehouse, Coles, Woolworths)", "pillar": "trust", "objective": "Credibility and scale at the shelf", "focus": "Chemist Warehouse is a credibility play: pharmacy implied endorsement, staff education, high-visibility placements. Coles and Woolworths deliver scale, frequency and immediacy: hero SKUs that are easy to understand and buy, strong visual differentiation against softer competitors."},
    {"id": "specialty", "name": "Specialty Retail and Gifting", "pillar": "education", "objective": "Win the considered, research-mode purchase", "focus": "Baby Bunting, Purebaby, RipeMaternity and others, where the 32-week parent is open to discovery and education. Position as a premium must-have, not a commodity. Giftable formats and curated bundles for baby showers and registries. In-store storytelling that educates."},
    {"id": "community", "name": "Owned Community", "pillar": "trust", "objective": "Turn purchase into belonging and durable retention", "focus": "Host the conversation parents are already having rather than just being mentioned in it. A lightly moderated private community with Frida as host not subject, expert-led drops, first access for members, and naturally sourced UGC."},
    {"id": "pr", "name": "PR and Expert-Led Commentary", "pillar": "category", "objective": "Lead the conversation, do not join it", "focus": "Put honest postpartum content into the mainstream. Education first, product second, authority always. Build relationships with credible healthcare professionals as spokespeople for honest postpartum conversation, tell the brand-origin story (the SnotSucker), and contribute to cultural moments. Any health-professional spokesperson use must comply with TGAC and AHPRA."},
    {"id": "launch", "name": "Launch Event", "pillar": "honesty", "objective": "Introduce Frida by doing exactly what the brand does", "focus": "An honest education event, not a product showcase. Delivered in market as the 'Nobody Told Me' event (24 July 2026, Gills Nursery, Cheltenham). Midwife-led honest sessions, open Q&A, products woven in naturally as answers to real questions. Everything captured and amplified for audiences who were not in the room."},
    {"id": "paid", "name": "Paid Media Amplification", "pillar": "function", "objective": "Scale what works, do not manufacture what does not", "focus": "The amplification layer, and it must feel like the rest of the brand: native, human, credible. Meta as the conversion engine, TikTok as discovery, Google Search and Shopping for high-intent capture, plus affiliate and complementary brand partnerships. Therapeutic claims in any paid asset must clear compliance."}
  ],
  "channels": [
    {"id": "pdp", "name": "D2C and website (brand home)", "presets": "Content hub articles, trimester product journeys, hospital-bag checklist builder, PDP and bundle modules, subscription", "role": "The centre of everything and the full brand voice without compromise. Deepest education and relationship-building. Every other channel points back here."},
    {"id": "blog", "name": "Blog / SEO", "presets": "1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema", "role": "Honest 'what no one tells you' education that ranks and drives to the D2C hub. No therapeutic claims without verified ARTG status and TGAC compliance."},
    {"id": "marketplace", "name": "Amazon", "presets": "High-intent listing content, A+ educational content, review-generation, Subscribe and Save on replenishment", "role": "Performance and validation engine. Wins the decision at the moment of research and need. Reviews must be genuine, disclosed if incentivised, and free of therapeutic claims."},
    {"id": "retail_mass", "name": "Pharmacy and grocery (Chemist Warehouse, Coles, Woolworths)", "presets": "Pharmacy staff education, end caps and promotional bays, hero-SKU shelf communication, strong visual differentiation", "role": "Credibility plus scale. Pharmacy delivers implied endorsement and staff recommendation; grocery delivers immediacy and reach. Communication must be immediate and easy to act on."},
    {"id": "retail_specialty", "name": "Specialty retail (Baby Bunting, Purebaby, RipeMaternity)", "presets": "In-store storytelling, giftable bundles, registry and baby-shower formats, premium positioning", "role": "The considered, research-mode purchase. Education and discovery for the parent open to spending time. Premium must-have, not commodity."},
    {"id": "healthcare", "name": "Hospital and midwife channel", "presets": "Clinical reference and product-education kits, midwife sample kits, QR to education hub, advocacy-network materials", "role": "The load-bearing trust channel. Education before referral. Endorsement use in advertising is restricted and must clear TGAC and AHPRA review."},
    {"id": "influencer", "name": "Influencer and creator", "presets": "Always-on gifting briefs, real-experience Reels and posts, partner-perspective content, expert-creator collaborations", "role": "Primary discovery mechanism. Real voices over polished content; tell the truth about your experience. Creators must not make therapeutic claims and must disclose gifted content (ACCC)."},
    {"id": "social", "name": "Organic social (TikTok and Instagram)", "presets": "TikTok-native discovery content, IG feed 1080x1350 and Reel and Story 1080x1920, owned content territories", "role": "Where the postpartum conversation lives, raw and honest. Frida joins and shapes it through native, honest content. Owned territories: what no one tells you, hospital-bag reality, expectation vs reality, real recovery, the first six weeks."},
    {"id": "paid", "name": "Paid media (Meta, TikTok, Google)", "presets": "Meta retargeting and lookalikes, TikTok discovery, Google Search and Shopping for high-intent terms, creator-led creative", "role": "Amplification layer that must feel native and credible. Meta converts, TikTok discovers, Google captures intent. Therapeutic claims in any asset must clear compliance."},
    {"id": "affiliate", "name": "Affiliate and brand partnerships", "presets": "Embedded affiliate links in creator content, editorial affiliates and round-ups, co-branded campaigns with aligned brands", "role": "Connects inspiration to purchase with no friction, and extends reach earlier in the journey through complementary, similarly trusted brands. Each should feel like a natural recommendation."},
    {"id": "pr", "name": "PR and earned media", "presets": "Expert-led commentary, brand-origin story, cultural-moment participation, partnership-led multi-voice campaigns", "role": "Shape the conversation and own the authoritative voice. Education first, product second, authority always. Health-professional spokesperson use must comply with TGAC and AHPRA."},
    {"id": "edm", "name": "EDM, CRM and community", "presets": "Email 600px modular, lifecycle and post-purchase journeys, content-hub distribution, private community hosting", "role": "Long-term relationship, education and retention. Builds the owned community where the deepest belonging and advocacy form. Fewer, better sends; promotions never the lead."},
    {"id": "event", "name": "Launch event and experiential", "presets": "Honest education-event format, midwife-led sessions, in-context product demonstration, capture-and-amplify content plan", "role": "Introduce Frida by doing what the brand does: say the things no one else says in a safe space. Delivered as the 'Nobody Told Me' event. Education event that happens to introduce the brand, not a product showcase."}
  ],
  "products": [
    {"name": "Postpartum Recovery Kit", "type": "Hero bundle", "note": "The complete answer to 'what do I actually need?'. A multi-product recovery bundle. Component items may be therapeutic goods; confirm ARTG status and TGAC compliance for the bundle and each component before any therapeutic claim."},
    {"name": "Peri Bottle", "type": "Hero, postpartum recovery", "note": "Functional postpartum product, often the first thing people tell friends about. Lead with the moment and outcome. Verify any recovery or relief claim against TGAC before use."},
    {"name": "Disposable Postpartum Underwear", "type": "Hero, postpartum recovery", "note": "Vaginal and C-section variants. Confirm exact AU range and any claims before use."},
    {"name": "NoseFrida (SnotSucker)", "type": "Hero, baby care (nasal aspirator)", "note": "Likely a therapeutic good or medical device. Confirm ARTG registration status before any therapeutic, health or efficacy claim."},
    {"name": "Instant Ice Maxi Pads", "type": "Postpartum recovery (cooling)", "note": "Cooling and comfort product. Cooling, pain-relief or healing language is a therapeutic claim; verify ARTG status and TGAC compliance before use."},
    {"name": "Perineal Healing Foam", "type": "Postpartum recovery", "note": "The product name itself ('healing') is a therapeutic claim. Confirm ARTG status and lead with outcome language rather than treatment claims. Flag for compliance."},
    {"name": "DermaFrida and NailFrida", "type": "Baby care", "note": "Baby skin and nail care. Confirm exact AU range and any claims before referencing."}
  ],
  "mandatory": [
    "Lead with education, not promotion. For every product: define the moment, name the problem nobody warned about, deliver the outcome.",
    "Lead with outcomes, not features. Use the moment language ('the thing that makes the first shower feel survivable'), not the clinical product name.",
    "Hold the voice: direct but not harsh, honest but not overwhelming, supportive not patronising, confident not clinical. Like a friend who has been through it.",
    "Normalise real experiences and validate what parents are actually going through.",
    "Speak to both people in the room, the birthing parent and the partner, by expanding the conversation, not splitting the brand.",
    "Every therapeutic, healing, recovery, relief or treatment claim must clear compliance before use (see standing flags).",
    "Australian English throughout. No em dashes."
  ],
  "exclusions": [
    "No overly clinical or technical language that creates distance, unless speaking directly to health professionals.",
    "No polished, unrealistic or idealised portrayals that make parents feel they are doing it wrong.",
    "No fear-based or alarmist messaging. Inform, do not alarm.",
    "Never shame parents for how they are coping.",
    "Never minimise the challenges of recovery and early parenting.",
    "No shock value as a substitute for substance.",
    "No therapeutic, healing, treatment, pain-relief or prevention claims for any product without verified ARTG status and TGAC compliance."
  ],
  "nonNegotiables": [
    "We lead with honest education before promotion, always.",
    "We will not sanitise, soften or sell an idealised version of parenting.",
    "We will not make therapeutic claims that are not substantiated and compliant for the specific Australian product.",
    "We will not use shock, shame or fear to drive engagement.",
    "We build trust through real voices and genuine professional context, never manufactured or non-compliant endorsement.",
    "We measure trust channels (healthcare, influencer, word-of-mouth) on the right indicators, not vanity metrics."
  ],
  "standingFlags": [
    {"level": "must", "note": "The Therapeutic Goods Advertising Code (TGAC) is the governing constraint for Frida, alongside the ACL. Any product that is a therapeutic good (for example the NoseFrida nasal aspirator, instant ice or cooling products, perineal healing foam, and any item making a healing, recovery, pain-relief or treatment claim) may only be advertised in line with the TGAC. Confirm each product's ARTG registration or listing status before making any therapeutic claim. Two issues remain unresolved: physical packaging drug claims, and unconfirmed ARTG status for certain products. Do not amplify either in marketing until resolved."},
    {"level": "must", "note": "Do not make therapeutic claims (treats, heals, relieves, prevents, soothes a condition, medical-grade, clinically proven) for any product whose therapeutic-good status and substantiation are not confirmed. Lead with outcome and moment language rather than clinical or treatment claims."},
    {"level": "must", "note": "Health-professional endorsement in advertising is restricted under the TGAC. Midwives and nurses recommending products in a clinical setting is not the same as using their endorsement in advertising. Do not use midwife, nurse or other health-practitioner endorsements, names, titles or testimonials in advertising of therapeutic goods to the public. The midwife advocacy program, sample kits and professional materials must be reviewed for TGAC and AHPRA compliance before any public-facing use."},
    {"level": "must", "note": "Samples, gifts and incentives to healthcare professionals and hospitals for therapeutic goods are subject to restrictions. The hospital sample-kit and midwife-gifting program must be reviewed for compliance before rollout."},
    {"level": "check", "note": "Reviews and testimonials: the Amazon review-volume push must generate genuine reviews, disclosed where incentivised, and testimonials must not carry therapeutic claims. Testimonials referring to therapeutic use are restricted under the TGAC."},
    {"level": "check", "note": "Influencer and gifted content must comply with both the TGAC (no therapeutic claims by creators for therapeutic goods) and ACCC disclosure rules (clear gifted or paid disclosure). Brief every creator on both before seeding."},
    {"level": "check", "note": "Comparative and superlative claims ('most trusted', 'most recommended', 'category leader', 'the benchmark', and comparisons against Due, Medela or Tommee Tippee) must be truthful, substantiable and not misleading under the ACL. Treat category-leadership language as internal ambition, not published fact, until substantiated."},
    {"level": "check", "note": "Postpartum and recovery language must be honest without implying medical outcomes. Do not imply Frida products treat or resolve medical conditions (tears, infections, complications). Describe support and comfort, not cure."}
  ]
}
$json$)
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
