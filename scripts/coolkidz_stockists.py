#!/usr/bin/env python3
"""Build the coolkidz.com.au "Find a stockist" data from Cin7.

A stockist is a retail account that has placed a wholesale order (Cin7
source Backend or API) in the last DAYS days. Brands come from the order
lines (Cin7 product brand), and the location from the ACCOUNT's own address,
never the delivery address (retailers drop-ship to customers' homes).

Only suburb, state and postcode are published, never a street address.

Output: assets/ck-stockists.json on the given Coolkidz theme(s), shaped
  {"updated": "...", "stores": [...], "online": [...], "national": [...]}

Accounts are sorted into:
  stores    physical shops (Cin7 group Wholesale, Baby Bunting, Pharmacy, or a
            shop-like name), mapped by postcode (Nominatim, cached)
  online    Cin7 group "Online Store"
  national  chains supplied through a head office (Baby Bunting, Harvey Norman...)
Anything matching EXCLUDE (internal, hire, closed, samples) is left out, as is
anything listed in data/coolkidz_stockist_hide.txt (one name per line).

  python3 scripts/coolkidz_stockists.py --theme 189044785441 [--dry-run]
"""
import argparse, base64, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYS = 365
GEOCACHE = os.path.join(BASE, "data", "coolkidz_stockist_geocache.json")
HIDE = os.path.join(BASE, "data", "coolkidz_stockist_hide.txt")

BRANDS = {"uppababy": "UPPAbaby", "uppababy australia": "UPPAbaby", "gaia baby": "Gaia Baby", "gaia": "Gaia Baby", "smartrike": "smarTrike",
          "wonderfold": "WonderFold", "matchstick monkey": "Matchstick Monkey", "zazu": "ZAZU", "magic": "Magic", "nanit": "Nanit",
          "miamily": "MiaMily", "frida": "Frida", "mamave": "Mamave", "hannie": "Hannie"}
EXCLUDE = re.compile(r"coolkidz|sample|marketing|display|warranty|\btest\b|staff|expo|ebay|kogan|the memo|transport|holding|zazu limited|- ?cs\b|"
                     r"don'?t use|dont use|closed|no longer|^billing$|- customer|\bhire\b|tjx|tradeshow|one fine baby|college|health network|"
                     r"automobile|medicar|cell care|awards|travel|aced all|services|^\d|nguyen", re.I)
NATIONAL = [("Baby Bunting", re.compile(r"baby.?bunting", re.I), "https://www.babybunting.com.au/stores"),
            ("Harvey Norman", re.compile(r"harvey norman", re.I), "https://www.harveynorman.com.au/store-finder"),
            ("JB Hi-Fi", re.compile(r"jb hi-?fi", re.I), "https://www.jbhifi.com.au/pages/store-finder"),
            ("Freedom", re.compile(r"freedom furniture", re.I), "https://www.freedom.com.au/stores"),
            ("Costco", re.compile(r"costco", re.I), "https://www.costco.com.au/store-finder"),
            ("Amazon Australia", re.compile(r"amazon commercial", re.I), "https://www.amazon.com.au")]
SHOPLIKE = re.compile(r"baby|bub|kid|chemist|pharmac|toy|nursery|boutique|cot|stork|goose|lullab|babe|collective|bump", re.I)
STATES = {"new south wales": "NSW", "nsw": "NSW", "new": "NSW", "victoria": "VIC", "vic": "VIC", "queensland": "QLD", "qld": "QLD",
          "south australia": "SA", "sa": "SA", "western australia": "WA", "wa": "WA", "tasmania": "TAS", "tas": "TAS",
          "act": "ACT", "australian capital territory": "ACT", "nt": "NT", "northern territory": "NT"}


def env_local():
    try:
        for line in open(os.path.join(BASE, ".env.local")):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))
    except FileNotFoundError:
        pass


def cin7(path):
    auth = "Basic " + base64.b64encode(f"{os.environ['CIN7_USERNAME']}:{os.environ['CIN7_API_KEY']}".encode()).decode()
    for i in range(5):
        try:
            r = urllib.request.Request("https://api.cin7.com/api/v1/" + path, headers={"Authorization": auth})
            return json.load(urllib.request.urlopen(r, timeout=120))
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("Cin7 failed: " + path[:80])


def cin7_all(resource, params):
    page, out = 1, []
    while True:
        d = cin7(resource + "?" + urllib.parse.urlencode(dict(params, rows=250, page=page)))
        out += d
        if len(d) < 250: return out
        page += 1; time.sleep(0.4)


def clean_name(n):
    n = re.sub(r"\s+", " ", n).strip()
    m = re.search(r"\((?:T/A )?([^)]+)\)", n, re.I)
    if m:  # "RMAND (Babyland WA)" -> the trading name; "Pragon (Alver Associates)" -> Pragon
        inner = m.group(1).strip()
        n = n.replace(m.group(0), "").strip() if re.search(r"associates|pty|ltd|limited", inner, re.I) else inner
    n = re.sub(r"\b(Pty\.? ?(Ltd|Limited)|PTY LTD)\b\.?", "", n, flags=re.I)
    n = re.sub(r"\(\s*\)|\s\d{3,}$", "", n)
    n = re.sub(r"\s*-\s*$", "", n).strip(" -")
    return re.sub(r"\s{2,}", " ", n)


def geocode(cache, postcode, city, state):
    key = f"{postcode}|{city}|{state}".lower()
    if key in cache: return cache[key]
    q = {"country": "Australia", "format": "json", "limit": 1}
    if postcode: q["postalcode"] = postcode
    if city: q["city"] = city
    if state: q["state"] = state
    pt = None
    for attempt in (q, {k: v for k, v in q.items() if k != "city"}):
        r = urllib.request.Request("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(attempt),
                                   headers={"User-Agent": "coolkidz-stockists/1.0 (mel@coolkidz.com.au)"})
        d = json.load(urllib.request.urlopen(r, timeout=30)); time.sleep(1.1)
        if d: pt = [round(float(d[0]["lat"]), 4), round(float(d[0]["lon"]), 4)]; break
    cache[key] = pt
    return pt


RETIRED = re.compile(r"head ?office|don'?t use|dont use|closed|- old\b", re.I)


def family(name):
    """One key per retail group: "Sydney's Baby Kingdom Pty Ltd - Head Office" and
    "Sydney's Baby Kingdom - Alexandria" -> sydneysbabykingdom."""
    n = re.sub(r"\([^)]*(use|old|closed)[^)]*\)", "", name, flags=re.I)
    n = re.sub(r"^\s*(don'?t use|dont use)\s*", "", n, flags=re.I)
    n = clean_name(n).split(" - ")[0]
    return re.sub(r"[^a-z0-9]", "", n.lower())


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--theme", action="append", default=[]); ap.add_argument("--dry-run", action="store_true"); a = ap.parse_args()
    env_local()
    since = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%dT00:00:00Z")
    orders = [o for o in cin7_all("SalesOrders", {"fields": "id,memberId,createdDate,isVoid,lineItems,deliveryCompany,deliveryCity,deliveryState,deliveryPostalCode",
                                                  "where": f"createdDate>'{since}' AND (source='Backend' OR source='API')"}) if not o.get("isVoid")]
    code_brand = {}
    for p in cin7_all("Products", {"fields": "id,brand,productOptions"}):
        for op in p.get("productOptions") or []:
            if op.get("code"): code_brand[op["code"].strip().lower()] = BRANDS.get((p.get("brand") or "").strip().lower())
    ids = sorted({o["memberId"] for o in orders if o.get("memberId")})
    contacts = {}
    for i in range(0, len(ids), 60):
        for c in cin7("Contacts?" + urllib.parse.urlencode({"fields": "id,company,group,city,state,postCode,website", "rows": 250,
                                                            "where": "id IN (" + ",".join(map(str, ids[i:i + 60])) + ")"})):
            contacts[c["id"]] = c
        time.sleep(0.4)
    print(f"{len(orders)} wholesale orders, {len(contacts)} accounts")

    hide = set()
    if os.path.exists(HIDE): hide = {l.strip().lower() for l in open(HIDE) if l.strip() and not l.startswith("#")}
    acc, national = {}, {n: set() for n, _, _ in NATIONAL}
    fam_brands, fam_drops = {}, {}  # a group's brands, and head-office deliveries to its own shops
    for o in orders:
        c = contacts.get(o["memberId"])
        if not c or not (c.get("company") or "").strip(): continue
        brands = {code_brand.get((l.get("code") or "").strip().lower()) for l in o.get("lineItems") or [] if (l.get("qty") or 0) > 0} - {None}
        if not brands: continue
        name = c["company"].strip()
        for n, rx, _ in NATIONAL:
            if rx.search(name): national[n] |= brands
        if c.get("group") in ("Website Sales", "Marketplace", "Amazon") or re.search(r"harvey norman|jb hi-?fi|freedom furniture|costco|amazon|baby.?bunting.*head ?office", name, re.I):
            continue
        if RETIRED.search(name):  # head office / old accounts: their brands count for the whole group
            f = family(name); fam_brands.setdefault(f, set()).update(brands)
            dc = o.get("deliveryCompany") or ""
            if dc and family(dc) == f and re.fullmatch(r"\d{4}", (o.get("deliveryPostalCode") or "").strip()):
                k = ((o.get("deliveryCity") or "").strip().title(), (o.get("deliveryState") or "").strip(), o["deliveryPostalCode"].strip())
                fam_drops.setdefault(f, {}).setdefault(k, [clean_name(re.sub(r"\([^)]*(use|old|closed)[^)]*\)", "", dc, flags=re.I)).split(" - ")[0], 0])[1] += 1
            continue
        if EXCLUDE.search(name): continue
        nm = clean_name(name)
        if nm.lower() in hide: continue
        pc = (c.get("postCode") or "").strip()
        k = (re.sub(r"[^a-z0-9]", "", nm.lower()), pc)
        s = acc.setdefault(k, {"name": nm, "city": (c.get("city") or "").strip().title().split(",")[0], "state": STATES.get((c.get("state") or "").strip().lower().rstrip(","), (c.get("state") or "").strip().upper()),
                               "postcode": pc, "group": c.get("group") or "", "web": (c.get("website") or "").strip(), "brands": set()})
        s["brands"] |= brands
        fam_brands.setdefault(family(name), set()).update(brands)

    # shops a group's head office has stock delivered to (2+ times), when that shop has no account of its own
    for f, drops in fam_drops.items():
        have = {k[1] for k in acc if family(acc[k]["name"]) == f}
        for (city, st, pc), (nm, n) in drops.items():
            if n >= 2 and pc not in have and nm.lower() not in hide:
                acc[(f, pc)] = {"name": nm, "city": city.split(",")[0], "state": STATES.get(st.lower(), st.upper()), "postcode": pc, "group": "Wholesale", "web": "", "brands": set()}
    for s in acc.values():
        if not NATIONAL[0][1].search(s["name"]):  # Baby Bunting ranges vary by store: keep each store's own brands
            s["brands"] |= fam_brands.get(family(s["name"]), set())
    # one entry per shop: "Kiddie Country" and "Kiddie Country Armadale" at the same postcode
    for k in sorted(acc, key=lambda k: -len(acc[k]["name"])):
        if k not in acc: continue
        for k2 in [x for x in acc if x != k and acc[x]["postcode"] == acc[k]["postcode"]]:
            f1, f2 = family(acc[k]["name"]), family(acc[k2]["name"])
            if f1.startswith(f2) or f2.startswith(f1):
                acc[k]["brands"] |= acc.pop(k2)["brands"]

    cache = json.load(open(GEOCACHE)) if os.path.exists(GEOCACHE) else {}
    stores, online = [], []
    for s in acc.values():
        s["brands"] = sorted(s["brands"])
        if s["group"] == "Online Store":
            online.append({k: s[k] for k in ("name", "brands", "web")}); continue
        if not (s["group"] in ("Wholesale", "Baby Bunting", "Pharmacy", "Specialty") or SHOPLIKE.search(s["name"])): continue
        if s["state"] not in ("NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT") or not re.fullmatch(r"\d{4}", s["postcode"]): continue
        pt = geocode(cache, s["postcode"], s["city"], s["state"])
        if not pt: print("  no location:", s["name"], s["city"], s["postcode"]); continue
        stores.append({"wide": len(s["brands"]) >= 6, "name": s["name"], "city": s["city"], "state": s["state"], "postcode": s["postcode"], "brands": s["brands"], "ll": pt,
                       "pharmacy": bool(re.search(r"chemist|pharmac", s["name"], re.I) or s["group"] == "Pharmacy")})
    os.makedirs(os.path.dirname(GEOCACHE), exist_ok=True)
    json.dump(cache, open(GEOCACHE, "w"), indent=0, sort_keys=True)
    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "stores": sorted(stores, key=lambda s: (s["state"], s["city"], s["name"])),
           "online": sorted(online, key=lambda s: s["name"].lower()),
           "national": [{"name": n, "brands": sorted(national[n]), "url": u} for n, _, u in NATIONAL if national[n]]}
    print(f"{len(out['stores'])} stores, {len(out['online'])} online, {len(out['national'])} national")
    json.dump(out, open(os.path.join(BASE, "data", "coolkidz_stockists.json"), "w"), indent=1)
    if a.dry_run: return

    cfg = json.load(open(os.path.join(BASE, "stores.config.json")))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); tok = store_token(ck)
    for tid in a.theme:
        r = urllib.request.Request(f"https://{ck['domain']}/admin/api/2025-07/themes/{tid}/assets.json", method="PUT",
                                   data=json.dumps({"asset": {"key": "assets/ck-stockists.json", "value": json.dumps(out, separators=(",", ":"))}}).encode(),
                                   headers={"X-Shopify-Access-Token": tok, "Content-Type": "application/json"})
        urllib.request.urlopen(r, timeout=60); print("uploaded to theme", tid)


if __name__ == "__main__":
    main()
