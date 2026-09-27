"""Writes every JSON template + section group for the Coolkidz 2026 theme."""
import json, os, datetime

D = os.path.dirname(os.path.abspath(__file__))
FEED = json.load(open(os.path.join(D, "_feed.json")))
CFG = json.load(open("/Users/melaniekingsford/brand-dashboard/stores.config.json"))
T = os.path.join(D, "templates"); S = os.path.join(D, "sections")
os.makedirs(T, exist_ok=True)

def sec(type_, settings=None, blocks=None):
    d = {"type": type_, "settings": settings or {}}
    if blocks is not None:
        d["blocks"] = {f"b{i}": b for i, b in enumerate(blocks)}
        d["block_order"] = [f"b{i}" for i in range(len(blocks))]
    return d

def blk(type_, **settings): return {"type": type_, "settings": settings}

def tpl(name, sections, layout="ck"):
    d = {"layout": layout, "sections": {f"s{i}": s for i, s in enumerate(sections)}, "order": [f"s{i}" for i in range(len(sections))]}
    open(os.path.join(T, name), "w").write(json.dumps(d, indent=2))

# ---------- shared content ----------
BRANDS = [
  ("UPPAbaby", "uppababy", "Prams, capsules and nursery", "Designed in the USA", "Prams, capsules and nursery pieces designed around how families actually live. Distributed, warranted and serviced in Australia by Coolkidz.", "https://uppababy.com.au", "ck-m-out.jpg", "sky"),
  ("Nanit", "nanit", "Smart baby monitors", "Designed in the USA", "Overhead HD baby monitors with sleep tracking, plus breathing motion monitoring through the night, all in the Nanit app.", "https://nanit.com.au", "ck-t2.jpg", "sky"),
  ("Gaia Baby", "gaia baby", "Nursery furniture", "Nursery furniture", "Cots, dressers and nursing chairs like the Eos range, made to grow with your child from the first night.", "https://www.gaia-baby.com.au", "ck-rocker.jpg", "mint"),
  ("WonderFold", "wonderfold", "Stroller wagons", "Designed in California", "Stroller wagons that seat two to six children, from the W2 to the W6, with room for everything else too.", "https://wonderfold.com.au", "ck-wf.jpg", "sky"),
  ("Magic", "magic", "Nappy bins", "Designed in the Netherlands", "Odour-free nappy bins with a twist-and-seal system and no refill cartridges.", "https://magicbabyproducts.com.au", "ck-p-heka.jpg", "mint"),
  ("Frida", "frida", "Baby and postpartum care", "Frida Baby and Frida Mom", "Practical care for babies and new mums, from the NoseFrida to the hospital birth kit.", "https://fridaaustralia.com.au", "ck-t3.jpg", "blush"),
  ("ZAZU", "zazu", "Sleep helpers", "Designed in the Netherlands", "Sleep trainer clocks, nightlights, projectors and white noise for babies and toddlers.", "https://zazu-kids.com.au", "ck-zazu.jpg", "coral"),
  ("MiaMily", "miamily", "Family luggage", "Designed in Switzerland", "Carry-on and check-in suitcases with a built-in seat, so little ones can ride through the airport.", "https://miamily.com.au", "ck-m-travel.jpg", "sky"),
  ("smarTrike", "smartrike", "Stroller-trikes and scooters", "Designed smart since 2006", "The Wonder range of folding stroller-trikes, plus scooters that grow with your child.", "https://smartrike.com.au", "ck-t1.jpg", "coral"),
  ("Mamave", "mamave", "Skincare for mum and baby", "Skincare", "Gentle skincare for mum and baby, from Mumma's Oil to Bubba's Wash.", "https://mamave.com.au", "ck-mamave.jpg", "blush"),
  ("Matchstick Monkey", "matchstick monkey", "Teething and first brushes", "Trusted in over 60 countries", "Teething toys and first toothbrushes shaped for small hands and sore gums.", "https://www.matchstickmonkey.com.au", "ck-p-mm.jpg", "mint"),
  ("Hannie", "hannie", "Portable high chairs", "Eating out, made easy", "A portable high chair that packs down to go wherever you eat.", "https://hannie.com.au", "ck-hannie.jpg", "coral"),
]
def brand_blocks(style="list"):
    return [blk("brand", name=n, vendor=v, category=c, origin=o, story=st, site=u, asset=a) for n, v, c, o, st, u, a, t in BRANDS]
def brand_story_blocks():
    return [blk("brand", name=n, vendor=v, origin=o, story=st, site=u, tint=t) for n, v, c, o, st, u, a, t in BRANDS]

SETS = [
  ("The nursery", "Cot, mattress, monitor and nappy bin for the first room.", ["eos-cot-bed-natural-ash-natural", "gaia-eos-cot-mattress-140x70x10", "pro-camera-floor-stand", "heka-xl-telescopic-nappy-bin-lichen"]),
  ("Hospital bag and home", "The capsule for the drive home and the first-weeks kit for mum and baby.", ["uppababy-mesa-car-seat-capsule-charcoal-melange-greyson-1", "frida-mom-hospital-labor-delivery-kit", "frida-baby-nosefrida", "bubbas-wash", "mummas-oil"]),
  ("Sleep, sorted", "A monitor you can trust, a sleep clock for later, and the sound and light to wind down.", ["pro-camera-floor-stand", "sound-light-machine", "zazu-sleeptrainer-sam-camel", "zazu-rest-nest-privacy-sleep-pod"]),
  ("Bath and care", "The small things you'll use every day: clear noses, soft skin, sore gums.", ["frida-baby-nosefrida", "bubbas-wash", "mummas-oil", "matchstick-monkey-matchstick-monkey-giraffe-teether-gigi-starter-set"]),
  ("Out the door", "A light stroller, the capsule, and a high chair that packs down for cafés.", ["uppababy-minu-v3-stroller-evelyn-meadow-green", "uppababy-mesa-car-seat-capsule-charcoal-melange-greyson-1", "hannie-portable-high-chair-sage-green", "miamily-carry-on-mist-grey"]),
]
TWO = ("Baby number two", ["w2-luxe-stroller-wagon-charcoal-grey", "smartrike-wonder-max-stone-beige", "hannie-portable-high-chair-sage-green", "zazu-sleeptrainer-sam-camel"])
def set_block(title, text, handles):
    s = {"title": title, "text": text}
    for i, h in enumerate(handles[:5]): s[f"product_{i+1}"] = h
    return blk("set", **s)

today = datetime.date.today().isoformat()
seen, EVENTS = set(), []
for e in sorted(CFG.get("tradeshows", []), key=lambda x: x["dateStart"]):
    if e["dateEnd"] < today: continue
    k = (e["name"], e["dateStart"])
    if k in seen: continue
    seen.add(k)
    EVENTS.append(blk("event", name=e["name"], start=e["dateStart"], end=e["dateEnd"], location=e.get("location", ""), state=e.get("state", "")))

STATS = [blk("stat", number="25+", label="years distributing premium baby brands"), blk("stat", number="12", label="brands in the Coolkidz family"),
         blk("stat", number="7,000 m²", label="warehouse and fulfilment centre"), blk("stat", number="12", label="in-house marketing specialists")]
feed = FEED["blocks"]; feed_blocks = [feed[k] for k in FEED["order"]]
REVIEWS = [
  ("Have had my pram for 6yrs and used for all 3 of my children. I have many accessories that have made my life so much easier on many occasions. This is the only pram anybody needs!!", "Eva J.", "UPPAbaby", "Vista"),
  ("Great bin, no smell and love that you can use it one handed unlike other brands we\u2019ve tried", "Hayley B.", "Magic", "Heka L nappy bin"),
  ("Second Gaia mattress I\u2019ve purchased and am pleased with how it fits the bed, and the low-toxin materials.", "Alyssa H.", "Gaia Baby", "Eos cot mattress"),
  ("Best investment for travel. Everyone we saw waiting in the huge airport line asked me where I got the suitcases from.", "EC", "MiaMily", "Check In"),
  ("Love this high chair, the way it compacts is ideal to take everywhere with you. If we go on holidays it fits in our carry on luggage and it\u2019s perfect for growing bubs!", "Bree", "Hannie", "Portable high chair"),
  ("Our son used to get distracted when room sharing. Now it's like his own little tent. He sleeps so much better!", "Benjamin", "ZAZU", "Rest Nest sleep pod"),
  ("Great capsule. Easy to use, reasonably light weight. Clips on easy to the vista and minu (minu needs adaptors). Baby enjoys riding in it.", "Luca", "UPPAbaby", "Mesa capsule"),
  ("Love the cover it makes it so much easier to travel with and compact especially inside the back of the tray as we don\u2019t have a boot", "Chloe M.", "WonderFold", "W2 travel cover"),
]
REV_BLOCKS = [blk("review", quote=q, name=n, brand=b, product=p) for q, n, b, p in REVIEWS]
TRUST = [blk("item", title="Official Australian stock", text="Every brand, straight from the distributor"),
         blk("item", title="Full Australian warranty", text="One help desk for every brand"),
         blk("item", title="Same price as the brand sites", text="On every single product"),
         blk("item", title="Mix brands, save up to 15%", text="Two or more brands in one order")]


# ---------- home ----------
tpl("index.json", [
  sec("ck-hero", {}, [
    blk("photo", asset="ck-t1.jpg", alt="A parent walking with a child in a smarTrike Wonder max", brand="smarTrike", product="Wonder max", moment="Out and about", url="/collections/out-and-about"),
    blk("photo", asset="ck-t2.jpg", alt="A mother holding her baby in a nursery with a Nanit monitor", brand="Nanit", product="Pro camera", moment="The nursery", url="/collections/nursery-and-sleep"),
    blk("photo", asset="ck-t3.jpg", alt="A baby resting on a parent's shoulder", brand="Frida", product="Baby care", moment="The first weeks", url="/collections/first-weeks")]),
  sec("ck-trust", {}, TRUST),
  sec("ck-mix"),
  sec("ck-moments", {}, [
    blk("moment", title="The nursery", brands="Gaia · Nanit · Magic", url="/collections/nursery-and-sleep", asset="ck-m-nursery.jpg"),
    blk("moment", title="Out and about", brands="UPPAbaby · WonderFold", url="/collections/out-and-about", asset="ck-m-out.jpg"),
    blk("moment", title="Travel", brands="MiaMily · smarTrike", url="/collections/out-and-about", asset="ck-m-travel.jpg"),
    blk("moment", title="The first weeks", brands="Frida · Mamave · ZAZU", url="/collections/first-weeks", asset="ck-m-sleep.jpg")]),
  sec("ck-products", {"heading": "The edit"}, [blk("tab", collection="nursery-and-sleep", label="Nursery and sleep"), blk("tab", collection="out-and-about", label="Out and about"), blk("tab", collection="first-weeks", label="The first weeks")]),
  sec("ck-feature-set", dict({"heading": TWO[0], "asset": "ck-wf.jpg", "tint": "sky"}, **{f"product_{i+1}": h for i, h in enumerate(TWO[1])})),
  sec("ck-sets", {"more_label": "See all sets", "more_url": "/pages/sets"}, [set_block(*s) for s in SETS[:3]]),
  sec("ck-reviews", {}, REV_BLOCKS),
  sec("ck-band", {"asset": "ck-reg.jpg", "tint": "blush"}, [blk("step", text="Add anything from all twelve brands to one list."), blk("step", text="Share one link. Bought gifts come off the list on their own."), blk("step", text="Finish the list yourself, mixing brands to save.")]),
  sec("ck-who", {"tint": "sky"}, STATS),
  sec("ck-brands", {"more_label": "Meet the brands", "more_url": "/pages/our-brands"}, brand_blocks()),
  sec("ck-journal", {}, feed_blocks),
  sec("ck-tiles", {"tight": True}, [
    blk("tile", title="25 years", text="The Australian distributor for these brands, supplying baby stores nationwide."),
    blk("tile", title="One warehouse", text="Every brand ships from our 7,000 sqm warehouse, so a mixed order is packed by one team."),
    blk("tile", title="One help desk", text="Warranty, returns and product questions for every brand, in one place.", link_label="help.coolkidz.com.au", link_url="https://help.coolkidz.com.au"),
    blk("tile", title="Same price", text="Single products match the brand's own site. The mixed-brand saving is only here.")]),
])

# ---------- shop pages ----------
tpl("page.our-brands.json", [
  sec("ck-page-hero", {"eyebrow": "The Coolkidz family", "heading": "<p>Twelve brands <em>we'd give our own kids</em></p>", "text": "Every brand here is distributed in Australia by Coolkidz, with local stock, Australian warranty and one support team. Shop them together here, or visit each brand's own site.", "tint": "sky"}),
  sec("ck-brands", {"heading": "Meet the brands", "text": "Shop a brand's range here, or head to its own Australian website.", "style": "cards"}, brand_blocks()),
  sec("ck-reviews", {"tint": "white"}, REV_BLOCKS),
  sec("ck-mix", {"heading": "<p>Mix brands, <em>save more</em></p>"}),
])
tpl("page.sets.json", [
  sec("ck-page-hero", {"eyebrow": "Curated sets", "heading": "<p>Sets that <em>just work together</em></p>", "text": "Put together by the Coolkidz team from things parents usually buy in the same few weeks. Every set mixes brands, so the saving is built in.", "tint": "mint"}),
  sec("ck-feature-set", dict({"heading": TWO[0], "asset": "ck-wf.jpg", "tint": "sky"}, **{f"product_{i+1}": h for i, h in enumerate(TWO[1])})),
  sec("ck-sets", {"heading": "All sets", "text": "Add a set to your bag, then swap or remove anything you like."}, [set_block(*s) for s in SETS]),
  sec("ck-reviews", {}, REV_BLOCKS[:4]),
  sec("ck-band", {"asset": "ck-reg.jpg", "tint": "blush"}),
])
tpl("page.help.json", [
  sec("ck-page-hero", {"eyebrow": "Help", "heading": "<p>How can we <em>help?</em></p>", "text": "Answers to the questions we hear most. For anything about a product, warranty or return, our help desk covers every brand.", "btn1_label": "Open the help desk", "btn1_url": "https://help.coolkidz.com.au", "btn2_label": "Contact us", "btn2_url": "/pages/contact", "tint": "sky"}),
  sec("ck-faq", {"heading": "Shopping with Coolkidz", "anchor": "faq"}, [
    blk("qa", q="How does mix-and-save work?", a="<p>The discount depends on how many different brands are in your order: 5% for two brands, 10% for three and 15% for four or more. It's applied at checkout.</p>"),
    blk("qa", q="Are the prices the same as the brand websites?", a="<p>Yes. Single products are the same price here as on each brand's own Australian site. The mixed-brand saving only happens here.</p>"),
    blk("qa", q="How much is delivery?", a="<p>Standard delivery is free on every order Australia-wide. Everything ships from the Coolkidz warehouse, and large items may arrive separately. <a href=\"/pages/delivery\">Delivery details</a>.</p>"),
    blk("qa", q="How do returns and refunds work?", a="<p>See our <a href=\"/policies/refund-policy\">refund policy</a>. For a faulty product, open a ticket at <a href=\"https://help.coolkidz.com.au\">help.coolkidz.com.au</a> and our team will sort it out.</p>"),
    blk("qa", q="Do products come with an Australian warranty?", a="<p>Yes. Everything is official Australian stock, and warranty claims for every brand go through <a href=\"https://help.coolkidz.com.au\">help.coolkidz.com.au</a>.</p>"),
    blk("qa", q="How does the gift registry work?", a="<p>Create a registry, add products from any of our brands, and share one link. Bought gifts come off the list on their own. <a href=\"/pages/gift-registry\">Start a registry</a>.</p>"),
    blk("qa", q="Is there a product recall I should know about?", a="<p>Current notices are on our <a href=\"/pages/refunds-recalls\">refunds and recalls page</a>.</p>")]),
  sec("ck-tiles", {"tight": True}, [
    blk("tile", title="Help desk", text="Warranty, returns and product questions for every brand.", link_label="help.coolkidz.com.au", link_url="https://help.coolkidz.com.au"),
    blk("tile", title="Call us", text="1300 722 302, Monday to Friday."),
    blk("tile", title="Showroom", text="1 Beyer Road, Braeside VIC 3195. Please call ahead."),
    blk("tile", title="Refunds and recalls", text="Our refund policy and current product notices.", link_label="Read more", link_url="/pages/refunds-recalls")]),
])
tpl("page.json", [sec("ck-main-page")])
tpl("page.contact.json", [
  sec("ck-page-hero", {"eyebrow": "Contact", "heading": "<p>Say <em>hello</em></p>", "text": "Parents, retailers and global brands: one form, and it reaches the right person on our team.", "tint": "sky"}),
  sec("ck-form", {"kind": "general", "heading": "Send us a message", "tint": "mint"}),
  sec("ck-tiles", {"tight": True}, [
    blk("tile", title="Product help and warranty", text="The quickest way to get help with any product.", link_label="help.coolkidz.com.au", link_url="https://help.coolkidz.com.au"),
    blk("tile", title="Retailers", text="Stock our brands in your store.", link_label="For retailers", link_url="/pages/for-retailers"),
    blk("tile", title="Global brands", text="Launch and grow in Australia with us.", link_label="Partner with us", link_url="/pages/partner-with-us"),
    blk("tile", title="Showroom", text="1 Beyer Road, Braeside VIC 3195. Please call ahead on 1300 722 302.")]),
])

# ---------- business pages ----------
WHAT_WE_DO = [
  blk("tile", eyebrow="Logistics", title="Distribution and warehousing", text="A 7,000 sqm warehouse built for stock management, fast order processing and reliable delivery to retailers and parents nationwide."),
  blk("tile", eyebrow="Growth", title="Marketing and go-to-market", text="A 12-person in-house team for launches, paid social and search, email, content, partnerships and retail activations."),
  blk("tile", eyebrow="Retail", title="Sales and training", text="A national sales team that supports every stockist with product education, training and merchandising."),
  blk("tile", eyebrow="Care", title="Customer service", text="Product help, orders, warranty and returns for every brand, by phone, email and our online help desk.")]
tpl("page.business.json", [
  sec("ck-page-hero", {"eyebrow": "Coolkidz for business", "heading": "<p>We bring the world's best baby brands <em>to Australia</em></p>", "text": "For over 25 years Coolkidz has partnered with international baby brands to build their retail presence, distribute them nationwide and grow their name with Australian families.", "btn1_label": "Stock our brands", "btn1_url": "/pages/for-retailers", "btn2_label": "Launch your brand", "btn2_url": "/pages/partner-with-us", "tint": "sky"}),
  sec("ck-logos"),
  sec("ck-stats", {}, STATS),
  sec("ck-doors", {}, [
    blk("door", eyebrow="For retailers", title="Stock the brands parents ask for", text="Independent baby stores, national chains and online retailers stock our brands across Australia. We keep shelves full and help your team sell with confidence.", list="Dedicated sales team and account management\nIn-store product training and merchandising advice\nReliable stock and fast national delivery\nMarketing that sends parents to your store\nWarranty and after-sales support for your customers", btn_label="Become a stockist", btn_url="/pages/become-a-stockist", tint="mint"),
    blk("door", eyebrow="For global brands", title="Launch and grow in Australia", text="We take international brands from first shipment to national presence, with distribution, retail relationships and local marketing under one roof.", list="National distribution and warehousing\nAn established retail network, independent to national\nGo-to-market strategy and brand launches\nYour own Australian brand website, run by us\nDirect-to-parent sales through the Coolkidz shop", btn_label="Partner with Coolkidz", btn_url="/pages/partner-with-us", tint="sky")]),
  sec("ck-tiles", {"heading": "<p>What we do</p>", "text": "Everything a baby brand needs in a new market, from the warehouse floor to the parent's front door."}, WHAT_WE_DO),
  sec("ck-band", {"eyebrow": "New for brand partners", "heading": "<p>Your brand, <em>in more baskets</em></p>", "text": "The Coolkidz shop sells every brand we distribute in one cart, with a saving for parents who mix brands. Partners get another direct channel that reaches parents already buying from the family, plus curated sets and a gift registry.", "btn_label": "See the shop", "btn_url": "/", "asset": "ck-t2.jpg", "anchor": "dtc", "tint": "blush"}),
  sec("ck-events", {"heading": "Meet us at the expos", "limit": 4, "btn_label": "All events", "btn_url": "/pages/events", "tint": "white"}, EVENTS),
  sec("ck-form", {"kind": "general", "eyebrow": "Get in touch", "heading": "Let's talk", "tint": "mint"}),
])
tpl("page.partner-with-us.json", [
  sec("ck-page-hero", {"eyebrow": "For global brands", "heading": "<p>Launch and grow <em>in Australia</em></p>", "text": "Coolkidz takes international baby brands from first shipment to national presence: distribution, retail, marketing and your own Australian website, under one roof, for over 25 years.", "btn1_label": "Start a conversation", "btn1_url": "#enquire", "btn2_label": "How a launch works", "btn2_url": "#launch", "asset": "ck-m-out.jpg", "tint": "white"}),
  sec("ck-logos"),
  sec("ck-stats", {"heading": "The family you'd be joining"}, STATS),
  sec("ck-tiles", {"heading": "<p>Why brands <em>choose Coolkidz</em></p>", "text": "Everything a baby brand needs to win in Australia, run by one team that already does it for twelve brands."}, [
    blk("tile", eyebrow="Logistics", title="National distribution", text="A 7,000 sqm warehouse with stock management and fast dispatch to retailers and parents."),
    blk("tile", eyebrow="Retail", title="An established retail network", text="Independent baby stores, national chains and online retailers across Australia, with a sales team to support them."),
    blk("tile", eyebrow="Direct", title="Your own Australian website", text="We build and run a Shopify website for your brand, with Australian pricing, warranty registration and local support."),
    blk("tile", eyebrow="Marketing", title="A 12-person marketing team", text="Launch campaigns, paid social and search, email, content, influencers and retail activations, localised for Australian families."),
    blk("tile", eyebrow="Care", title="Customer service and warranty", text="Product questions, warranty claims and returns handled by our team, through one help desk for every brand."),
    blk("tile", eyebrow="Events", title="Face to face with parents", text="Stands at baby expos in Brisbane, Sydney, Melbourne, Perth and Adelaide, where parents try before they buy.")]),
  sec("ck-steps", {"heading": "<p>How a launch <em>works</em></p>", "text": "Every brand is different, but most launches follow the same five steps.", "tint": "paper"}, [
    blk("step", title="Conversation", text="Tell us about your brand, range and plans. We'll share how we'd position it in Australia."),
    blk("step", title="Range and pricing", text="We agree the launch range and Australian pricing across retail, online and direct."),
    blk("step", title="Ready to land", text="Product data, local labelling, warranty terms and support content, ready before stock arrives."),
    blk("step", title="Launch", text="Your Australian website, retailer sell-in and launch campaign go live together."),
    blk("step", title="Grow", text="Weekly reporting, new channels, events and range expansion as the brand builds.")]),
  sec("ck-tiles", {"heading": "<p>Where your brand sells</p>", "text": "One partner, every channel that matters in Australia.", "anchor": "channels"}, [
    blk("tile", title="Your brand website", text="An Australian Shopify site for your brand, run by our team."),
    blk("tile", title="Retail partners", text="Independent baby stores and national chains, in store and online."),
    blk("tile", title="The Coolkidz shop", text="Mix-and-save, curated sets and a gift registry across the family."),
    blk("tile", title="Baby expos", text="Our stands at the major baby expos around the country."),
    blk("tile", title="Online marketplaces", text="Selected online retailers and marketplaces, managed for you."),
    blk("tile", title="Sale events", text="Click Frenzy and seasonal promotions, planned with you.")]),
  sec("ck-report"),
  sec("ck-band", {"eyebrow": "The Coolkidz shop", "heading": "<p>Your brand, <em>in more baskets</em></p>", "text": "Parents who come for one brand find the rest of the family here, with a saving for mixing brands. It's an extra direct channel for every partner, and it never undercuts your own site on price.", "btn_label": "See the shop", "btn_url": "/", "asset": "ck-t2.jpg", "anchor": "dtc", "tint": "blush"}),
  sec("ck-quotes"),
  sec("ck-faq", {"heading": "Questions from brands", "text": "Anything else, just ask."}, [
    blk("qa", q="Do you distribute exclusively?", a="<p>Many of our brands are exclusively distributed in Australia by Coolkidz. We'll talk through the right model for yours.</p>"),
    blk("qa", q="Do you sell direct to parents?", a="<p>Yes: through each brand's own Australian website and the Coolkidz shop, alongside our retail partners.</p>"),
    blk("qa", q="What reporting do partners get?", a="<p>A regular view of sales across channels, stock, marketing performance and reviews, from our own reporting platform.</p>"),
    blk("qa", q="Who handles warranty and after-sales?", a="<p>We do. Our customer service team handles product questions, warranty claims and returns for every brand through one help desk.</p>"),
    blk("qa", q="Which categories do you work in?", a="<p>Prams and travel, nursery and furniture, sleep and monitors, feeding, health and care, and toys and play.</p>"),
    blk("qa", q="How do we start?", a="<p>Send the form below with a little about your brand. We'll come back to you to set up a first conversation.</p>")]),
  sec("ck-form", {"kind": "brand", "eyebrow": "Partner with us", "heading": "Tell us about your brand", "text": "A few details and we'll set up a first conversation with the right people on our team.", "anchor": "enquire", "tint": "sky"}),
])
tpl("page.for-retailers.json", [
  sec("ck-page-hero", {"eyebrow": "For retailers", "heading": "<p>Stock the brands <em>parents ask for</em></p>", "text": "Coolkidz supplies independent baby stores, national chains and online retailers across Australia, with the stock, training and marketing to help you sell.", "btn1_label": "Become a stockist", "btn1_url": "/pages/become-a-stockist", "btn2_label": "View catalogues", "btn2_url": "/pages/catalogues", "asset": "ck-m-nursery.jpg", "tint": "white"}),
  sec("ck-logos"),
  sec("ck-tiles", {"heading": "<p>What retailers can expect</p>", "text": "A partner that helps you sell, not just a supplier."}, [
    blk("tile", title="A dedicated sales team", text="Account management from people who know the brands and your store."),
    blk("tile", title="Product training", text="In-store training and product education, so your team sells with confidence."),
    blk("tile", title="Merchandising advice", text="Help getting the range and the floor right for your customers."),
    blk("tile", title="Reliable stock", text="A 7,000 sqm warehouse and national logistics to keep shelves full."),
    blk("tile", title="Marketing support", text="Campaigns, social and events that send parents looking for our brands."),
    blk("tile", title="After-sales care", text="Warranty and product support for your customers through our help desk.")]),
  sec("ck-brands", {"heading": "The range", "text": "Twelve brands across prams, nursery, sleep, feeding and care.", "style": "cards"}, brand_blocks()),
  sec("ck-steps", {"heading": "<p>How to open an account</p>", "text": "Four steps from enquiry to first order.", "tint": "paper"}, [
    blk("step", title="Apply", text="Tell us about your store with the stockist form."),
    blk("step", title="We call", text="A member of our sales team gets in touch to talk range and terms."),
    blk("step", title="Account set up", text="We open your trade account and share catalogues and pricing."),
    blk("step", title="First order", text="Stock ships from our warehouse, with training and point of sale to follow.")]),
  sec("ck-form", {"kind": "retailer", "eyebrow": "Become a stockist", "heading": "Apply to stock our brands", "text": "Tell us about your store and a member of our sales team will be in touch.", "anchor": "apply", "tint": "mint"}),
])
tpl("page.become-a-stockist.json", [
  sec("ck-page-hero", {"eyebrow": "Become a stockist", "heading": "<p>Bring our brands <em>into your store</em></p>", "text": "Apply below and a member of our sales team will be in touch to talk range, terms and training.", "tint": "mint"}),
  sec("ck-form", {"kind": "retailer", "eyebrow": "Stockist application", "heading": "Tell us about your store", "tint": "sky"}),
  sec("ck-logos"),
])
tpl("page.about-us.json", [
  sec("ck-page-hero", {"eyebrow": "About Coolkidz", "heading": "<p>More than distribution. <em>We build brands.</em></p>", "text": "Coolkidz Australia partners with global baby brands to deliver growth in Australia through established retail networks, strong logistics and a deep understanding of the local market.", "asset": "ck-t2.jpg", "tint": "white"}),
  sec("ck-who", {"eyebrow": "Our story", "heading": "<p>Over 25 years of bringing <em>great baby brands</em> to Australia</p>", "text": "<p>We focus on long-term partnerships that combine strategic insight with reliable execution, so every brand reaches Australian families with impact and consistency. Today that means national distribution, a 12-person marketing team, a website for each of our brands, and a shop where parents can buy them together.</p>", "link_label": "Coolkidz for business", "link_url": "/pages/business", "tint": "sky"}, STATS),
  sec("ck-tiles", {"heading": "<p>What we do</p>"}, WHAT_WE_DO),
  sec("ck-logos"),
  sec("ck-band", {"eyebrow": "Say hello", "heading": "<p>Come and see us</p>", "text": "Our showroom is at 1 Beyer Road, Braeside VIC 3195. Please call ahead on 1300 722 302.", "btn_label": "Contact us", "btn_url": "/pages/contact", "asset": "ck-m-nursery.jpg", "anchor": "visit", "tint": "mint"}),
])
tpl("page.events.json", [
  sec("ck-page-hero", {"eyebrow": "Events", "heading": "<p>Try before <em>you buy</em></p>", "text": "Find Coolkidz and our brands at baby expos around Australia. Push the prams, fold the wagons and talk to people who know every product.", "tint": "coral"}),
  sec("ck-events", {"heading": "Upcoming expos", "text": "Dates and venues for the shows we're at.", "limit": 20}, EVENTS),
  sec("ck-tiles", {"tight": True}, [
    blk("tile", title="For parents", text="See the range in person, and ask anything."),
    blk("tile", title="For retailers", text="Meet our sales team at the show.", link_label="For retailers", link_url="/pages/for-retailers"),
    blk("tile", title="For brands", text="See how we present our partners' ranges.", link_label="Partner with us", link_url="/pages/partner-with-us")]),
])

# ---------- commerce ----------
tpl("collection.json", [sec("ck-collection", {}, brand_story_blocks()), sec("ck-band", {"asset": "ck-reg.jpg", "tint": "blush"})])
tpl("product.json", [sec("ck-product"), sec("ck-cross-brand")])
tpl("cart.json", [sec("ck-cart"), sec("ck-cross-brand-cart", {})]) if False else tpl("cart.json", [sec("ck-cart")])
tpl("search.json", [sec("ck-search")])
tpl("blog.json", [sec("ck-blog"), sec("ck-journal", {"show_own": False}, feed_blocks)])
tpl("article.json", [sec("ck-article")])
tpl("page.gift-registry.json", [sec("ck-gift-registry")])

# ---------- section groups ----------
open(os.path.join(S, "ck-header-group.json"), "w").write(json.dumps({"type": "header", "name": "Coolkidz header", "sections": {"header": {"type": "ck-header", "settings": {}}}, "order": ["header"]}, indent=2))
open(os.path.join(S, "ck-footer-group.json"), "w").write(json.dumps({"type": "footer", "name": "Coolkidz footer", "sections": {"footer": {"type": "ck-footer", "settings": {}}}, "order": ["footer"]}, indent=2))
print("events", len(EVENTS), "templates", len(os.listdir(T)))

# ---------- legacy pages moved into the new design ----------
CATS = [("UPPAbaby Australia","Prams catalogue 2026","https://coolkidz.aflip.in/13dc0ed4ef.html"),("UPPAbaby Australia","In-home catalogue 2025","https://heyzine.com/flip-book/6f2c666c37.html"),
        ("Frida Australia","Catalogue 2026","https://coolkidz.aflip.in/b0a1a11b46.html"),("WonderFold Australia","Catalogue 2026","https://coolkidz.aflip.in/f03eb0cddd.html"),
        ("Nanit Australia","Catalogue 2026","https://coolkidz.aflip.in/1f7cff9a8b.html"),("Nanit Australia","Catalogue 2026 (flipbook)","https://heyzine.com/flip-book/156318b8dd.html"),
        ("Magic","Catalogue 2026","https://coolkidz.aflip.in/f433d4df95.html"),("Matchstick Monkey","Catalogue 2026","https://coolkidz.aflip.in/ae6269453f.html"),
        ("MiaMily Australia","Catalogue 2026","https://coolkidz.aflip.in/f33c8ed8b1.html"),("Gaia Baby Australia","Catalogue 2026","https://coolkidz.aflip.in/57854200e2.html"),
        ("Mamave","Catalogue 2026","https://coolkidz.aflip.in/e39a910d48.html")]
tpl("page.lookbook.json", [
  sec("ck-page-hero", {"eyebrow": "For retailers", "heading": "<p>Brand <em>catalogues</em></p>", "text": "The current catalogue for every brand in the Coolkidz family. Open any catalogue to browse the full range, specs and colours.", "btn1_label": "Become a stockist", "btn1_url": "/pages/become-a-stockist", "tint": "sky"}),
  sec("ck-tiles", {"tight": True}, [blk("tile", eyebrow=d, title=n, text="", link_label="View catalogue", link_url=u) for n, d, u in CATS]),
  sec("ck-form", {"kind": "retailer", "eyebrow": "Trade enquiries", "heading": "Want to stock these brands?", "tint": "mint"}),
])
BLOGS = [("UPPAbaby","Pram buying guides, comparisons and practical parenting advice","https://uppababy.com.au/blogs/news"),("Nanit","Smart nursery advice, sleep guidance and set-up tips","https://nanit.com.au/blogs/news"),
         ("Gaia Baby","Nursery furniture guides, inspiration and expert advice","https://www.gaia-baby.com.au/blogs/news"),("WonderFold","Stroller wagon guides, comparisons and family adventure tips","https://wonderfold.com.au/blogs/news"),
         ("Magic","Nappy bin advice, comparisons and nursery tips","https://magicbabyproducts.com.au/blogs/news"),("ZAZU","Baby sleep guidance, routines and product advice","https://zazu-kids.com.au/blogs/news"),
         ("MiaMily","Family travel tips, luggage guides and product advice","https://miamily.com.au/blogs/news"),("Frida Baby","Baby care guidance","https://fridaaustralia.com.au/blogs/baby-care-guides"),
         ("Frida Mom","Pregnancy and postpartum guides for mums","https://fridaaustralia.com.au/blogs/postpartum-guides"),("Mamave","Pregnancy, postpartum and baby skincare guidance","https://mamave.com.au/blogs/blog"),
         ("Matchstick Monkey","Teething tips, oral care guidance and product advice","https://www.matchstickmonkey.com.au/blogs/news"),("Hannie","High chair guidance, mealtime tips and family advice","https://hannie.com.au/blogs/news")]
tpl("page.learning-hub.json", [
  sec("ck-page-hero", {"eyebrow": "Coolkidz Australia", "heading": "<p>Learning <em>hub</em></p>", "text": "Expert insights, parenting advice and practical guides from across the Coolkidz family of brands.", "btn1_label": "Read the journal", "btn1_url": "/blogs/news", "tint": "mint"}),
  sec("ck-journal", {"heading": "Latest from Coolkidz", "text": "Guides for the first years from the Coolkidz team."}, feed_blocks),
  sec("ck-tiles", {"heading": "<p>Explore by <em>brand</em></p>", "text": "Every brand's own Australian journal, full of guides and advice.", "tint": "paper"}, [blk("tile", title=n, text=t, link_label="Explore articles", link_url=u) for n, t, u in BLOGS]),
])
SD = json.load(open(os.path.join(D, "_sameday.json")))
sd_blocks = []
for k, items in SD.items():
    d = dict(items)
    if "content" in d:
        sd_blocks.append(blk("text", heading=d.get("heading", ""), text=d["content"], chips=True))
    else:
        sd_blocks.append(blk("text", text=d["text"]))
tpl("page.same-day-delivery.json", [
  sec("ck-page-hero", {"eyebrow": "Delivery", "heading": "<p>Same-day delivery <em>terms</em></p>", "text": "How same-day delivery works in Melbourne, and the postcodes it covers.", "tint": "sky"}),
  sec("ck-main-page", {"show_title": False}),
  sec("ck-richtext", {}, [sd_blocks[0], sd_blocks[1], sd_blocks[2]] if len(sd_blocks) == 3 else sd_blocks),
])
art = [sec("ck-article")]
for f in os.listdir("/private/tmp/claude-501/-Users-melaniekingsford-brand-dashboard/2658e5a0-4cc5-47c9-94ee-d3b6d31bc8be/scratchpad/ck/cktheme/templates"):
    if f.startswith("article.") and f != "article.json":
        tpl(f, art)
tpl("collection.landing-page-collection.json", [sec("ck-collection", {}, brand_story_blocks())])
tpl("404.json", [
  sec("ck-page-hero", {"eyebrow": "404", "heading": "<p>We can't find <em>that page</em></p>", "text": "It may have moved when we refreshed the site. Try one of these instead.", "btn1_label": "Shop everything", "btn1_url": "/collections/all", "btn2_label": "Meet the brands", "btn2_url": "/pages/our-brands", "tint": "coral"}),
  sec("ck-moments", {"heading": "", "tight": True}, [
    blk("moment", title="The nursery", brands="Gaia · Nanit · Magic", url="/collections/nursery-and-sleep", asset="ck-m-nursery.jpg"),
    blk("moment", title="Out and about", brands="UPPAbaby · WonderFold", url="/collections/out-and-about", asset="ck-m-out.jpg"),
    blk("moment", title="Travel", brands="MiaMily · smarTrike", url="/collections/vendors?q=MiaMily", asset="ck-m-travel.jpg"),
    blk("moment", title="The first weeks", brands="Frida · Mamave", url="/collections/first-weeks", asset="ck-m-sleep.jpg")]),
])
tpl("list-collections.json", [
  sec("ck-page-hero", {"eyebrow": "Shop", "heading": "<p>Shop by moment <em>or by brand</em></p>", "text": "Every product from the Coolkidz family, in one place.", "tint": "sky"}),
  sec("ck-moments", {"heading": "", "tight": True}, [
    blk("moment", title="The nursery", brands="Gaia · Nanit · Magic", url="/collections/nursery-and-sleep", asset="ck-m-nursery.jpg"),
    blk("moment", title="Out and about", brands="UPPAbaby · WonderFold", url="/collections/out-and-about", asset="ck-m-out.jpg"),
    blk("moment", title="Travel", brands="MiaMily · smarTrike", url="/collections/vendors?q=MiaMily", asset="ck-m-travel.jpg"),
    blk("moment", title="The first weeks", brands="Frida · Mamave", url="/collections/first-weeks", asset="ck-m-sleep.jpg")]),
  sec("ck-brands", {"heading": "The brands", "style": "cards"}, brand_blocks()),
])
print("legacy templates written")

# ---------- retired pages: new layout so the theme's redirect list catches them ----------
for f in ["page.giveaway.json", "page.offer.json", "page.mothers-day-gift-guide.json", "page.warehouse-sale.json", "page.good-baby-expo.json", "page.click-frenzy-travel.json"]:
    tpl(f, [sec("ck-main-page")])
tpl("collection.starlight-donations.json", [sec("ck-collection", {}, brand_story_blocks())])
print("retired templates written")
