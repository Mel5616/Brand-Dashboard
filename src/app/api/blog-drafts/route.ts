import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { mintToken, storeCreds } from "@/lib/shopifyMint";

// AI Blog Writer pipeline (Blogging > AI Blog Writer): generate a full,
// on-brand, SEO-structured post per the house content guidelines, review it,
// then publish it straight to the right brand's Shopify blog on approval.
// Generation/editing: admin or Alison. Publishing live to a real storefront:
// admin only.
export const revalidate = 0;
export const maxDuration = 90;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

function canWrite(acc: Awaited<ReturnType<typeof getAccess>>) {
  return acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
}

// ── House content guidelines (Coolkidz_Blog_Content_Guidelines_2026.docx), condensed ──
const HOUSE_RULES = `HOUSE CONTENT RULES (apply to every article, every brand):
- The test: "Would a parent use this as a trustworthy answer?" Decision-useful, not filler.
- Answer the core question early. Target ONE clear search intent (buying decision, comparison, use-case, age-stage, or a direct question).
- Say plainly who the product suits and who it doesn't. Tie every feature to a real benefit — never leave a feature unsupported ("one-handed fold" -> "makes car-to-pram transitions easier when you're juggling a baby and bags").
- Site role: "hero" (Coolkidz.com.au — broad buying guides, "best of" content, category authority) vs "cluster" (a brand's own site — product-specific comparisons, worth-it questions, FAQs, product fit). Never duplicate the same intent across both.
- Voice: human, warm, conversational, Australian English. Short paragraphs, scannable H2s. Concrete over vague — reject "premium quality" style claims. Use real parenting scenarios. No keyword stuffing, no robotic SEO phrasing, no clichés.
- Structure (use as the backbone, adapt headings to the brand's own house style if one is given below): Quick Answer (1-2 short paragraphs) -> At a Glance (best for / not ideal for / key strength / trade-off) -> Category context -> Why parents choose it (3-5 reasons, each a feature tied to a benefit) -> Trade-offs (honest) -> Comparison if relevant -> When it's the right choice -> Is it worth it? -> FAQs (real search-style questions, standalone answers) -> Conclusion with a soft CTA. Never a hard sell.
- SEO: meta title ~50-60 characters, primary keyword near the front; meta description ~140-160 characters, benefit-led, soft CTA, includes the primary keyword; H2s should mirror real questions people ask.
- Claims: no unconfirmed AU prices/specs/launch dates; state trade-offs as clearly as benefits; cite comparisons around the reader's real use case (family size, travel, terrain, budget), not just spec tables.
- Punctuation: avoid em dashes (—). Use a period for a new sentence, a comma, or a colon to introduce a list or explanation instead. Commas and full stops only — no em dashes anywhere in the output.
- Output must be ready to paste into Shopify as-is.`;

// ── Per-brand voice + compliance guardrails ──────────────────────────────
const BRAND_VOICE: Record<string, { blogs: { key: string; handle: string; label: string; audience: string; tieins: string }[]; voice: string }> = {
  Frida: {
    voice: `FRIDA AUSTRALIA VOICE (fridaaustralia.com.au):
- Warm, honest, reassuring — the reader is often a pregnant woman or new mum who may be anxious. Direct and practical, no fluff.
- Australian English throughout (labour not labor, mum not mom, colour, recognise). Conversational but credible — like advice from a trusted friend who knows her stuff. Never preachy, alarmist or condescending.
- No "#NobodyToldMe" campaign language in article body copy.
COMPLIANCE (non-negotiable):
- Never say a product treats, cures, prevents or manages a medical condition. "Helps with"/"designed for" is fine; "treats"/"relieves" is not.
- Describe symptoms as "common" or "normal" — never "safe to ignore" or "harmless".
- Every article must include at least one nudge to consult a midwife, GP or relevant health professional for clinical questions. Never position the content as a substitute for medical advice.
- No therapeutic claims, no implication a product is a medical device.
- Any content touching infant sleep must align with Red Nose Australia safe sleep guidance (on their back, in their own sleep space, smoke-free) — never contradict or omit it.
- Perineal/postpartum products: can describe what they do physically (cooling, soothing, protecting) — never frame as a treatment for tears, trauma or episiotomies.
PRODUCT MENTION: single mention near the end, its own short paragraph, natural and useful — never salesy. Never more than two product references.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): each question must be its own <details class="faq"><summary class="faq__q">Question text<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon icon-plus"><path d="M12 5v14M5 12h14"></path></svg></summary><div class="faq__a"><p>Answer text.</p></div></details> block, one after another with no other markup between them, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6, max 10, standalone Q&A) add ~400-600 words on top.`,
    blogs: [
      { key: "pregnancy-guides", handle: "pregnancy-guides", label: "Pregnancy Guides", audience: "Pregnant women, mostly 2nd trimester on, research-heavy and often anxious", tieins: "Frida Mum: Hospital Labour & Delivery Kit, Postpartum Recovery Kit, Peri Bottle, Instant Ice Maxi Pads, Perineal Cooling Pad Liners" },
      { key: "postpartum-guides", handle: "postpartum-guides", label: "Postpartum Guides", audience: "New mums in the fourth trimester (0-12 weeks), often exhausted and looking for reassurance", tieins: "Frida Mum: Postpartum Recovery Kit, Peri Bottle, Instant Ice Maxi Pads, Perineal Foam, Perineal Cooling Pad Liners" },
      { key: "baby-care-guides", handle: "baby-care-guides", label: "Baby Care Guides", audience: "Parents of newborns through toddlers, practical and action-oriented", tieins: "Frida Baby: NoseFrida, SnipperClipper Set, Skinsoother, 3-in-1 Nose Nail & Ear Picker, MediFrida" },
    ],
  },
  SmarTrike: {
    voice: `SMARTRIKE / WONDER VOICE (smartrike.com.au):
- Brand: smarTrike® makes the Wonder™ family — "the world's most lightweight compact stroller-trike." Converts stroller <-> trike as a toddler grows, folds in 3 seconds, carry-on approved for air travel.
- ALWAYS render product names exactly: smarTrike® Wonder™, smarTrike® Wonder+™ (the + is same size/weight as the letters), smarTrike® Wonder max™ ("max" always lowercase, TM after "max").
- Core lines to reach for naturally, not forced into every paragraph: "Growing together", "Everyday travel with Wonder™", "Travel light", "the world's most lightweight compact stroller-trike".
- Real provable strengths to lead with: ultra-lightweight, carry-on approved / ready for air travel, 3-second fold, patented 360° easy steer, 140° reclining seat, grows with the child.
- Awards worth citing where credibility helps: Red Dot Award: Product Design 2026, German Design Award 2026 (Winner), 2025 Baby Innovation Award (All-Terrain Stroller Product of the Year).
- Tone: clean, confident, warm, modern, aspirational but grounded, parent-friendly — never gimmicky or loud. Short elegant phrasing over dense paragraphs.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): each question must be its own <details><summary>Question text</summary><p>Answer text.</p></details> block, one after another with no other markup between them, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "Journal", audience: "Parents comparing travel strollers and researching the Wonder range", tieins: "smarTrike® Wonder™, Wonder+™, Wonder max™" },
    ],
  },
  Nanit: {
    voice: `NANIT VOICE (nanit.com.au):
- Confident, research-led, reassuring-not-alarmist. Positions Nanit as "one system, not a gadget drawer" — video, breathing motion and sleep insights combined, backed by the in-house "Nanit Lab" (sleep scientists, paediatric clinicians, engineers).
- Audience is comfortable with a premium, tech-forward purchase and wants data-backed reassurance, not just a camera.
- Value props to lead with: nothing worn on baby beyond fabric (sensor-free breathing motion), 1080p overhead view, AI nap prediction, Sleep Score, Australian warranty/support out of Melbourne.
COMPLIANCE (non-negotiable): Nanit is NOT a medical device and must never be described as one. Never claim it monitors, prevents, diagnoses or reduces the risk of SIDS or any medical condition. Describe breathing-motion tracking only as "for reassurance/insight," never as safety or medical monitoring. Always frame it alongside, never instead of, safe sleep practices.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): wrap the whole FAQ section in <div class="nau-faq"> and give each question its own <details class="nau-faq__item"><summary>Question text</summary><div class="nau-faq__a"><p>Answer text.</p></div></details> block inside it, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6, max 10) add ~400-600 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "Nanit Blog", audience: "New and expecting parents researching baby monitors and sleep tech, comfortable with a premium/tech-forward purchase", tieins: "Nanit Smart Baby Pro Monitor (Wall Mount/Floor Stand), Nanit Smart Baby Monitor + Flex Stand, Nanit Breathing Wear Band, Nanit Sound + Light Machine" },
    ],
  },
  Magic: {
    voice: `MAGIC VOICE (magicbabyproducts.com.au):
- Magic sells nappy (diaper) disposal bins and bathroom accessories, not strollers or carriers — flagship line is the Heka telescopic nappy bin (M/L) plus the Bathroom Lid accessory that converts it to a regular bin post-nappy years.
- Tone: light, practical, a little wry ("Parenting is full of little miracles, and a few smells you'd rather forget"), design-forward, sustainability-leaning. Muted colourways (Beige, Blush Pink, Concrete, Graphite, Lichen, Pigeon Blue, White) — mention colour options naturally where relevant.
- Audience: Australian parents furnishing a nursery/bathroom, price-and-design conscious.
COMPLIANCE: "100% odour control"/"odourless" is the brand's own marketing claim — you may repeat it as the brand's claim, but don't independently assert it as a guaranteed fact in all conditions; the product's own FAQ notes odour control depends on correct bag/lid use, so keep that nuance where relevant.
FAQ MARKUP (mandatory, do not use h3/p pairs for FAQs): each question as its own plain <details><summary>Question text</summary><p>Answer text.</p></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "Learning Hub", audience: "Australian parents furnishing a nursery/bathroom, comparing nappy disposal systems", tieins: "MAGIC Heka Nappy Bin (M/L), Heka Bathroom Lid accessory" },
    ],
  },
  Hannie: {
    voice: `HANNIE VOICE (hannie.com.au):
- Hannie makes one product family: a portable, chair-mounted high chair for babies/toddlers (~6 months to 5 years, up to 25kg), positioned as a space-saving, travel-friendly alternative to a full-size high chair.
- Tone: warm, plain-spoken, benefit-led with practical specifics (weights, ages, cm measurements) rather than fluffy claims — confident but not hard-sell.
- Sustainability-minded framing where natural: "fewer, better baby products," recyclable materials, transferable 2-year warranty.
- Audience: parents of infants/toddlers who are short on space or dine out/travel often.
COMPLIANCE: safety claims may reference real standards the product is tested to (e.g. EN 16120, AS/NZS 8124.3) — only restate standards Mel has confirmed elsewhere, never invent a certification or number.
FAQ MARKUP (mandatory, do not use h3/p pairs for FAQs): each question as its own plain <details><summary>Question text</summary><p>Answer text.</p></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "learning-hub", handle: "news", label: "Learning Hub", audience: "Parents of babies 6 months to 5 years choosing a portable high chair, practical and safety-conscious", tieins: "Hannie Portable High Chair (Charcoal Black, Mahogany Red, Sage Green, White Sand)" },
    ],
  },
  "Gaia Baby": {
    voice: `GAIA BABY VOICE (www.gaia-baby.com.au):
- Calm, warm, minimal, design-led nursery furniture — never baby-themed or busy. Family-business framing ("Gaia Baby is a family business. So is the team who brought it to Australia"). Mission line to draw on: "baby products should be timeless, practical and beautiful too."
- Audience: style-conscious first-time parents (25-40) and grandparents (50-65) wanting ease of mind and something that lasts beyond the baby years.
- Premium but approachable — avoid discount-led or hard-sell language, especially for the flagship Eos range.
- Product range: Eos Cot Bed, Hera Cot Bed, Serena Cot Bed (patented 8-in-1 convertible), Hera Dresser, Hera Wardrobe, Hera Rocking Chair, Changing Station.
COMPLIANCE (non-negotiable): this brand makes real, specific safety/standards claims (AS/NZS ISO 8124.3, EN 716-1/716-2, BS 8509, GECA certification, formaldehyde levels). Never invent or generalise a certification — only restate what is already confirmed, and keep any cert claim scoped to the specific range it applies to (standards can differ between Hera, Serena and the mattress).
FAQ MARKUP (mandatory, do not use h3/p pairs for FAQs): each question as its own plain <details><summary>Question text</summary><p>Answer text.</p></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "buying-guides", handle: "news", label: "Buying Guides", audience: "Parents comparing nursery furniture ranges and researching Eos/Hera/Serena", tieins: "Gaia Baby Eos Cot Bed, Hera Cot Bed, Serena Cot Bed, Hera Dresser, Hera Wardrobe" },
      { key: "materials-safety", handle: "news", label: "Materials & Safety", audience: "Safety-conscious parents and grandparents researching certifications and materials", tieins: "AS/NZS & EN safety standards, GECA certification, sustainable timber sourcing" },
    ],
  },
  WonderFold: {
    voice: `WONDERFOLD VOICE (wonderfold.com.au):
- Warm, practical, family-first: "versatility meets durability," built for "everyday adventures" and stress-free outings (beach, park, farmers' market).
- Core value props: durability/premium materials, all-terrain capability, convenience for multi-child/multi-item hauling.
- Strong inclusivity thread — explicitly known for catering to parents of multiples and families with children who have disabilities or illnesses; frame wagons as safety- and inclusion-promoting, not just gear. Supports the Starlight Children's Foundation.
- Audience: Australian parents of 2+ kids (twins/multiples), special-needs families, outing-heavy households wanting one vehicle for kids and gear.
- Product range: W2 (2-seat) and W4 (4-seat) Elite/Luxe/Luxe Pro Stroller Wagons.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): each question as its own <details class="details" is="accordion-details"><summary class="details__summary flex items-center justify-between gap-2 cursor-pointer"><span class="text-base lg:text-lg xl:text-xl font-medium leading-tight">Question text</span></summary><div class="details__content text-base rte"><p>Answer text.</p></div></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "News", audience: "Parents of multiples and families needing all-terrain, multi-child transport for outings", tieins: "WonderFold W2 (2-seat) and W4 (4-seat) Elite/Luxe/Luxe Pro Stroller Wagons" },
    ],
  },
  UPPAbaby: {
    voice: `UPPABABY VOICE (uppababy.com.au):
- Premium, design-led stroller brand for parents who see a stroller as a long-term investment, not a commodity. Confident, considered, quietly aspirational — never showy, never generic "premium quality" claims. Back every claim with a spec or real scenario.
- Speaks to detail-oriented Australian parents researching Vista vs Cruz vs Ridge vs Minu — cite real mechanisms (bassinet-to-toddler-seat conversion, adapters, one-hand fold, travel-system compatibility) tied to real parenting moments.
- Key value props: modularity/grows-with-family (multi-child configurations), safety engineering, premium materials (leather trims, melange fabrics), longevity/resale value.
- Price point is genuinely high — content should help justify the investment (worth-it framing), never apologise for it.
- Product range: Vista V3, Cruz V3, Ridge, Minu, MESA Max Infant Car Seat, Ciro Highchair.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): each question as its own <details class="details" is="accordion-details"><summary class="details__summary flex items-center justify-between gap-2 cursor-pointer"><span class="text-base lg:text-lg xl:text-xl font-medium leading-tight">Question text</span></summary><div class="details__content text-base rte"><p>Answer text.</p></div></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "Journal", audience: "Parents comparing premium strollers and researching the Vista/Cruz/Ridge/Minu range, often mid-purchase-decision", tieins: "UPPAbaby Vista V3, Cruz V3, Ridge, Minu, MESA Max Infant Car Seat" },
    ],
  },
  ZAZU: {
    voice: `ZAZU VOICE (zazu-kids.com.au):
- Warm, plain-spoken, parent-to-parent — "Made by parents who were also up at 5am." Practical and a little playful, never saccharine.
- Leans on named characters (Lou the Owl, Katie the Cat, Emmy the Elephant etc.) rather than clinical spec talk — "a face they know, a colour they understand."
- Audience: parents of toddlers/young kids navigating bedtime resistance, early waking, night fears, naps/travel disruption.
- Value props: sleep training via visual wake-time cues (colour-change clocks/nightlights), comfort/soothing (white noise, breathing light), routine and independence.
COMPLIANCE: these are sleep-comfort products, not medical or behavioural-therapy devices — avoid clinical "sleep training method" or developmental-milestone claims; use "helps with"/"designed for" framing and never guarantee a behavioural outcome.
FAQ MARKUP (mandatory, do not use h3/p pairs for FAQs): each question as its own <details><summary>Question text</summary><p class="ans">Answer text.</p></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "News", audience: "Parents of toddlers navigating bedtime resistance, early waking, and night fears", tieins: "ZAZU Nightlight/Clock range (Lou the Owl, Katie the Cat), Bedtime Projectors (Leo the Lion, Cody the Crab), Emmy the Elephant Nightlight & White Noise" },
    ],
  },
  MiaMily: {
    voice: `MIAMILY VOICE (miamily.com.au):
- MiaMily is a Swiss-designed ride-on luggage/travel brand (hard-shell suitcases with a patented built-in child seat, plus an expandable backpack) — NOT baby carriers, do not write about babywearing.
- Tone: warm, plain and practical — parent to parent, honest about trade-offs.
- Audience: parents of toddlers through teens planning air travel who want less airport friction.
- Value props: the patented built-in seat (100kg rated, doubles as a resting spot/high chair/bag hook), TSA-approved locks, 360° spinner wheels, Swiss design, Limited Lifetime Warranty.
COMPLIANCE: never guarantee a case fits every airline's cabin-baggage allowance — the brand's own language is "fits most airline overhead compartments," always keep that hedge since it varies by carrier. Never invent a minimum rider age; the brand sets none, only that the child must sit unassisted, belted, and supervised.
- Product range: Carry On, Carry On Plus, Carry On Pro, Check In, Check In Plus, Expandable Backpack.
FAQ MARKUP (mandatory, do not use h3/p pairs for FAQs): each question as its own plain <details><summary>Question text</summary><p>Answer text.</p></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "Journal", audience: "Parents researching ride-on luggage, flying with toddlers, or choosing between MiaMily models", tieins: "MiaMily Carry On, Carry On Plus, Carry On Pro, Check In, Check In Plus, Expandable Backpack" },
    ],
  },
  "Coolkidz Australia": {
    voice: `COOLKIDZ AUSTRALIA VOICE (coolkidz.com.au):
- This is the umbrella "hero" retail site — broad buying guides and category authority across brands, not any single brand's product copy. Never duplicate a brand's own "cluster" site content or intent (see HOUSE_RULES site-role rule).
- Tone: warm, practical, Australian English, genuinely helpful rather than salesy — an experienced friend who's tried everything, not any one brand's marketing voice.
- Audience: parents comparison-shopping across brands/categories rather than fans of one label.
- Value props: curated multi-brand range, honest trade-off comparisons across brands, one trusted destination instead of researching many brand sites separately.
- Stock spans Nanit, Frida, Mamave, SmarTrike, UPPAbaby, WonderFold, ZAZU, MiaMily, Matchstick Monkey, Hannie, Gaia Baby and Magic — pull in real cross-brand comparisons where relevant rather than pushing one brand.
FAQ MARKUP (mandatory, do not use h3/p pairs for FAQs): each question as its own plain <details><summary>Question text</summary><p>Answer text.</p></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "strollers", handle: "news", label: "Stroller & Travel Guides", audience: "Parents comparing strollers/travel systems across brands (smarTrike, UPPAbaby, WonderFold, ZAZU, MiaMily)", tieins: "cross-brand stroller/travel-system range" },
      { key: "nursery-sleep", handle: "news", label: "Nursery & Sleep Guides", audience: "Parents researching monitors, sleep safety, nursery setup", tieins: "Nanit monitors, Gaia Baby nursery furniture" },
      { key: "baby-care", handle: "news", label: "Baby Care & Feeding Guides", audience: "Parents comparing grooming/health/feeding essentials", tieins: "Frida Baby grooming range, Mamave skincare, Matchstick Monkey teethers" },
    ],
  },
  "Matchstick Monkey": {
    voice: `MATCHSTICK MONKEY VOICE (www.matchstickmonkey.com.au):
- Playful, sensory, design-led (award-winning, BioCote-protected silicone). Punchier and a little cheekier than Frida — confident, visually driven (colour, texture, "the iconic shape").
- Audience: parents of teething infants (roughly 3-24 months), practical and design-conscious, often gifting/multi-colour collectors.
- Value props: hygienic gel-applicator design, textured bumps that massage gums and reach back molars, fridge-coolable for extra soothing, medical-grade silicone.
COMPLIANCE (non-negotiable): never claim the product treats, cures or relieves teething as a medical/clinical fact. Safe language: "designed to soothe/massage gums," "textured bumps help massage tender gums," "cooling relief" — never "relieves teething pain" or "treats teething symptoms."
- Product range: Giraffe Teether, Fox Teether, Dancing Monkey Teether, Gigi Giraffe Teething Starter Set, Baby Sonic Toothbrush range.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): each question as its own <details><summary>Question text<span class="ind">+</span></summary><div class="ans"><p>Answer text.</p></div></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "news", handle: "news", label: "Teething Guides", audience: "Parents of teething infants (3-24 months), researching gum relief, safe silicone, and sensory teether options", tieins: "Matchstick Monkey Giraffe Teether, Fox Teether, Dancing Monkey Teether, Gigi Giraffe Teething Starter Set, Baby Sonic Toothbrush range" },
    ],
  },
  Mamave: {
    voice: `MAMAVE VOICE (mamave.com.au):
- Pregnancy-to-newborn skincare brand, two ranges: "Mumma" (pregnancy-safe body oils, moisturiser, scrub, soak) and "Bubba" (newborn/baby barrier cream, moisturiser, wash, massage oil).
- Tone: warm, reassuring, cosmetic-science-credible — "developed by a cosmetic chemist," free from retinoids/parabens/synthetic fragrance. "Natural doesn't automatically mean safe" is a brand line worth echoing where relevant.
- Audience: pregnant women and new parents of newborns, ingredient-conscious.
COMPLIANCE (non-negotiable, same pattern as Frida): never claim a product treats, cures or prevents any medical/skin condition (eczema, dermatitis, PUPPP, stretch marks forming, etc.) — use "helps with"/"supports"/"designed for." Include a nudge to check with a healthcare professional for clinical/skin questions — the brand's own FAQ already uses this exact phrasing, reuse it naturally.
FAQ MARKUP (mandatory, matches the site's native accordion — do not use h3/p pairs for FAQs): each question as its own <details class="faq"><summary>Question text<span class="fx">+</span></summary><div class="ans">Answer text.</div></details> block, one after another, directly under the FAQs H2.
Target length: ~900-1100 words excluding FAQs; FAQs (min 6) add ~300-500 words on top.`,
    blogs: [
      { key: "mamave-journal", handle: "journal", label: "The Mamave Journal", audience: "Pregnant women and new parents researching pregnancy-safe and newborn skincare", tieins: "Mumma's Oil, Mumma's Moisturiser, Mumma's Scrub, Mumma's Soak, Bubba's Barrier Cream, Bubba's Moisturiser, Bubba's Wash, Bubba's Massage Oil" },
    ],
  },
};

async function callClaude(system: string, user: string, maxTokens: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) throw new Error(`AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 300)}`);
  return text;
}

// Delimiter-based, not JSON — a full HTML article is full of quotes and
// newlines that routinely break JSON.parse on model output. Header fields
// are one per line; the body is everything between two markers, verbatim.
const FIELD_KEYS = ["TITLE", "META_TITLE", "META_DESCRIPTION", "SLUG", "TARGET_KEYWORD", "INTENT"] as const;
function extractFields(text: string): Record<string, string> {
  const bodyMatch = text.match(/===BODY_HTML===([\s\S]*?)===END===/);
  if (!bodyMatch) throw new Error("AI response was missing the body markers — try again");
  const header = text.slice(0, bodyMatch.index).trim();
  const out: Record<string, string> = { body_html: bodyMatch[1].trim() };
  for (const key of FIELD_KEYS) {
    const m = header.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    out[key.toLowerCase()] = (m?.[1] ?? "").trim();
  }
  return out;
}

// Topic suggestions are informed by the brand's own audience/tie-ins and what
// it's already covered, not by real keyword-volume data (no SEO tool is
// wired up here) — framed to the model as editorial judgement, not stats.
async function suggestTopics(req: Request, acc: Awaited<ReturnType<typeof getAccess>>) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand_id");
  const brandName = url.searchParams.get("brand_name") || "";
  const blogKey = url.searchParams.get("blog_key") || "";
  const voice = BRAND_VOICE[brandName];
  if (!voice) return NextResponse.json({ ok: false, error: `No voice guide set up yet for ${brandName || "this brand"}` }, { status: 400 });
  const blogDef = voice.blogs.find(bl => bl.key === blogKey) ?? voice.blogs[0];

  let covered: string[] = [];
  if (brandId) {
    const cRes = await fetch(`${sbUrl}/rest/v1/blog_drafts?brand_id=eq.${encodeURIComponent(brandId)}&select=title,target_keyword&order=created_at.desc&limit=40`, { headers: h(), cache: "no-store" });
    const cJson = await cRes.json().catch(() => []);
    covered = (Array.isArray(cJson) ? cJson : []).map((r: any) => [r.title, r.target_keyword].filter(Boolean).join(" — ")).filter(Boolean);
  }

  const system = `You are an SEO content strategist for ${brandName}, an Australian baby-goods brand. You have no keyword-volume tool — base suggestions on real parent search behaviour (what people actually type into Google), the site's role, and this blog's audience, not invented statistics.

${HOUSE_RULES}

${voice.voice}

This is for the "${blogDef.label}" blog. Audience: ${blogDef.audience}. Product tie-ins available: ${blogDef.tieins}.
${covered.length ? `Already covered on this brand's blog, don't repeat these or anything too close to them:\n${covered.map(t => `- ${t}`).join("\n")}` : ""}

Suggest 6 distinct blog topics. Spread them across different search intents (a direct question, a buying/worth-it decision, a comparison, an age/stage guide, a how-to, a myth/misconception) so they don't overlap each other either. Each needs a real, specific angle a parent would actually search for, not a generic category name.

Respond with ONLY a JSON array, no markdown fences, no text before or after, exactly this shape:
[{"title": "...", "target_keyword": "...", "intent": "one short phrase", "site_role": "cluster or hero", "why": "one sentence on the real search behaviour or gap this fills"}]`;

  let text: string;
  try {
    text = await callClaude(system, "Suggest the 6 topics now, as the JSON array only.", 1500);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 502 });
  }
  let suggestions: any[];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (!Array.isArray(suggestions)) throw new Error("not an array");
  } catch {
    return NextResponse.json({ ok: false, error: "AI response wasn't valid — try again" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, suggestions });
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "suggest-topics") return suggestTopics(req, acc);
  const brandId = url.searchParams.get("brand_id");
  let q = `${sbUrl}/rest/v1/blog_drafts?select=*&order=created_at.desc&limit=200`;
  if (brandId) q += `&brand_id=eq.${encodeURIComponent(brandId)}`;
  const res = await fetch(q, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [], brandVoices: BRAND_VOICE });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]"), brandVoices: BRAND_VOICE });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const brandName = String(b.brand_name || "");
  const voice = BRAND_VOICE[brandName];
  if (!voice) return NextResponse.json({ ok: false, error: `No voice guide set up yet for ${brandName || "this brand"}` }, { status: 400 });
  const blogKey = String(b.blog_key || voice.blogs[0]?.key);
  const blogDef = voice.blogs.find(bl => bl.key === blogKey) ?? voice.blogs[0];
  const brief = String(b.brief || "").trim();
  const targetKeyword = String(b.target_keyword || "").trim();
  const intent = String(b.intent || "").trim();
  const siteRole = b.site_role === "hero" ? "hero" : "cluster";
  if (!brief) return NextResponse.json({ ok: false, error: "Give it a topic/brief to write from" }, { status: 400 });

  const system = `You are the on-brand blog writer for ${brandName}, an Australian baby-goods brand. Follow the house rules and the brand voice exactly.

Respond in EXACTLY this plain-text format, nothing before or after it, no markdown fences:

TITLE: <the article title>
META_TITLE: <~50-60 characters>
META_DESCRIPTION: <~140-160 characters>
SLUG: <lowercase-hyphenated, no leading slash>
TARGET_KEYWORD: <the primary keyword>
INTENT: <the search intent this post answers, one short phrase>
===BODY_HTML===
<the full article body as clean HTML using <h2>/<p>/<ul>/<table> as appropriate, including the FAQ section as its own <h2>FAQs</h2> with each question as an <h3> or <strong> lead-in. Do not include the H1/title inside this body. Do not escape quotes or special characters — write plain HTML exactly as it should appear on the page.>
===END===

${HOUSE_RULES}

${voice.voice}

This post is for the "${blogDef.label}" blog. Audience: ${blogDef.audience}. Product tie-ins available: ${blogDef.tieins}. Site role for this post: ${siteRole}.`;

  const user = `Write the article.
Topic/brief: ${brief}
${targetKeyword ? `Target keyword: ${targetKeyword}` : ""}
${intent ? `Search intent: ${intent}` : ""}
Write it now, in the exact format specified.`;

  let draft: any;
  try {
    const text = await callClaude(system, user, 6000);
    draft = extractFields(text);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 502 });
  }

  const row = {
    brand_id: Number(b.brand_id), status: "draft", blog_key: blogKey,
    title: String(draft.title || "").slice(0, 200),
    slug: String(draft.slug || "").slice(0, 200),
    meta_title: String(draft.meta_title || "").slice(0, 100),
    meta_description: String(draft.meta_description || "").slice(0, 200),
    target_keyword: String(draft.target_keyword || targetKeyword || "").slice(0, 150),
    intent: String(draft.intent || intent || "").slice(0, 150),
    site_role: siteRole,
    body_html: String(draft.body_html || ""),
    brief, created_by: acc.user?.email ?? null,
  };
  if (!row.title || !row.body_html) return NextResponse.json({ ok: false, error: "AI response was missing a title or body — try again" }, { status: 502 });

  const res = await fetch(`${sbUrl}/rest/v1/blog_drafts`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

async function getDraft(id: string) {
  const res = await fetch(`${sbUrl}/rest/v1/blog_drafts?id=eq.${id}&limit=1`, { headers: h(), cache: "no-store" });
  return (await res.json().catch(() => []))[0] ?? null;
}

// Publish a draft live to the brand's Shopify blog (REST Admin API — stable,
// same endpoint family scripts/sync_blogs.py already reads from).
async function publishToShopify(brandId: number, blogHandle: string, draft: any) {
  const store = storeCreds().find(s => s.id === brandId);
  if (!store) return { ok: false, error: "No Shopify credentials on file for this brand" };
  const token = await mintToken(store);
  if (!token) return { ok: false, error: "Could not authenticate with Shopify" };
  const sh = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const api = `https://${store.domain}/admin/api/2024-10`;

  const blogsRes = await fetch(`${api}/blogs.json`, { headers: sh, cache: "no-store" });
  const blogsJson = await blogsRes.json().catch(() => ({}));
  let blog = (blogsJson.blogs || []).find((bl: any) => bl.handle === blogHandle);
  if (!blog) {
    const createRes = await fetch(`${api}/blogs.json`, { method: "POST", headers: sh, body: JSON.stringify({ blog: { title: blogHandle, handle: blogHandle } }) });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created.blog) return { ok: false, error: `Could not create blog "${blogHandle}": ${JSON.stringify(created).slice(0, 150)}` };
    blog = created.blog;
  }

  const articleRes = await fetch(`${api}/blogs/${blog.id}/articles.json`, {
    method: "POST", headers: sh,
    body: JSON.stringify({
      article: {
        title: draft.title, handle: draft.slug || undefined,
        body_html: draft.body_html, summary_html: draft.meta_description || undefined,
        published: true,
        ...(draft.image_url ? { image: { src: draft.image_url } } : {}),
        metafields: [
          { namespace: "global", key: "description_tag", value: draft.meta_description || "", type: "single_line_text_field" },
          { namespace: "global", key: "title_tag", value: draft.meta_title || draft.title, type: "single_line_text_field" },
        ],
      },
    }),
  });
  const articleJson = await articleRes.json().catch(() => ({}));
  if (!articleRes.ok || !articleJson.article) return { ok: false, error: JSON.stringify(articleJson.errors ?? articleJson).slice(0, 250) };

  return { ok: true, shopify_blog_id: String(blog.id), shopify_article_id: String(articleJson.article.id), shopify_handle: articleJson.article.handle, blog_handle: blog.handle, store_domain: store.domain };
}

const STOREFRONT_DOMAIN: Record<string, string> = {
  Frida: "fridaaustralia.com.au", SmarTrike: "smartrike.com.au",
  Nanit: "nanit.com.au", Magic: "magicbabyproducts.com.au", Hannie: "hannie.com.au",
  "Gaia Baby": "www.gaia-baby.com.au", WonderFold: "wonderfold.com.au", UPPAbaby: "uppababy.com.au",
  ZAZU: "zazu-kids.com.au", MiaMily: "miamily.com.au", "Coolkidz Australia": "coolkidz.com.au",
  "Matchstick Monkey": "www.matchstickmonkey.com.au", Mamave: "mamave.com.au",
};

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const action = String(b.action || "edit");

  if (action === "edit") {
    const fields: any = { updated_at: new Date().toISOString() };
    for (const f of ["title", "slug", "meta_title", "meta_description", "target_keyword", "intent", "body_html", "blog_key"]) {
      if (b[f] !== undefined) fields[f] = b[f];
    }
    const res = await fetch(`${sbUrl}/rest/v1/blog_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
    return NextResponse.json({ ok: res.ok });
  }

  if (action === "reject") {
    const res = await fetch(`${sbUrl}/rest/v1/blog_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "rejected", note: b.note ? String(b.note).slice(0, 500) : null, updated_at: new Date().toISOString() }) });
    return NextResponse.json({ ok: res.ok });
  }

  if (action === "approve") {
    // Live-publish, so admin only — Alison can write and edit drafts but not push them to a real storefront.
    if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only — publishing goes live immediately" }, { status: 403 });
    const draft = await getDraft(id);
    if (!draft) return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
    const brandRes = await fetch(`${sbUrl}/rest/v1/brands?id=eq.${draft.brand_id}&select=name&limit=1`, { headers: h(), cache: "no-store" });
    const brandName = (await brandRes.json().catch(() => []))[0]?.name ?? "";
    const voice = BRAND_VOICE[brandName];
    const blogDef = voice?.blogs.find(bl => bl.key === draft.blog_key);
    const blogHandle = blogDef?.handle || draft.blog_key || "news";

    const pub = await publishToShopify(draft.brand_id, blogHandle, draft);
    if (!pub.ok) return NextResponse.json({ ok: false, error: pub.error }, { status: 502 });

    // Prefer the brand's real storefront domain; the store's own
    // myshopify.com domain always resolves too, so it's a safe fallback
    // rather than leaving published_url empty when a brand isn't mapped yet.
    const domain = STOREFRONT_DOMAIN[brandName] || pub.store_domain;
    const publishedUrl = `https://${domain}/blogs/${pub.blog_handle}/${pub.shopify_handle}`;
    const fields = {
      status: "published", shopify_blog_id: pub.shopify_blog_id, shopify_article_id: pub.shopify_article_id,
      shopify_handle: pub.shopify_handle, published_url: publishedUrl, approved_by: acc.user?.email ?? null,
      published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${sbUrl}/rest/v1/blog_drafts?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/blog_drafts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
