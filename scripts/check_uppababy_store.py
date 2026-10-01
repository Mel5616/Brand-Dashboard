#!/usr/bin/env python3
"""
Daily health check for uppababy.com.au.

Written after 1 October 2026, when three revenue-affecting faults ran for
hours or days and every one was found by eye rather than by anything
watching:

  * Spend & Save silently stopped stacking with every gift, twice, because
    another app reset combinesWith.productDiscounts on the tiers.
  * The "Mesa capsule $60 off with a pram" offer expired and sat dead for ten
    days while the pram pages went on advertising it.
  * A promo change emptied a config the cart script read, the script threw,
    and for about a day every add-to-bag added the product twice.

So this checks the things that actually broke, not a generic checklist.

  FAIL  something is costing money right now
  WARN  worth a look today
  INFO  what changed in the last day, and who changed it

Exits non-zero on any FAIL, and emails when RESEND_API_KEY and ALERT_EMAIL
are set. Read-only against Shopify apart from the optional canary cart,
which cleans up after itself.

Usage:
  python3 -u scripts/check_uppababy_store.py
  python3 -u scripts/check_uppababy_store.py --no-canary
"""

import os, sys, json, ssl, datetime, urllib.request, urllib.error, http.cookiejar

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
CTX         = ssl.create_default_context()
STOREFRONT  = "https://uppababy.com.au"
CANARY      = "--no-canary" not in sys.argv

# A pram that earns the free Nappy Bag Pro. If this variant is ever retired
# the canary says so rather than failing silently.
CANARY_VARIANT = "48727947215103"   # Vista V3 With Bassinet, James

FAILS, WARNS, NOTES = [], [], []


def load_env():
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
CONFIG = json.load(open(CONFIG_PATH))
sys.path.insert(0, os.path.join(BASE_DIR, "scripts"))
from shopify_auth import store_token  # noqa: E402

BRAND = next(b for b in CONFIG["brands"] if b["name"] == "UPPAbaby")
TOKEN = store_token(BRAND)


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        f"https://{BRAND['domain']}/admin/api/2026-07/graphql.json", data=body,
        headers={"X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=CTX, timeout=90) as r:
        out = json.loads(r.read().decode())
    if out.get("errors"):
        raise SystemExit("Shopify error: " + json.dumps(out["errors"])[:400])
    return out["data"]


def check_discounts():
    """Every fault we have had with discounts, in one query."""
    data = gql("""{automaticDiscountNodes(first:100){nodes{ id automaticDiscount{
      __typename
      ... on DiscountAutomaticBasic{ title status startsAt endsAt
        combinesWith{orderDiscounts productDiscounts shippingDiscounts}
        minimumRequirement{ ... on DiscountMinimumSubtotal{greaterThanOrEqualToSubtotal{amount}} }
        customerGets{ value{ ... on DiscountPercentage{percentage} } } }
      ... on DiscountAutomaticBxgy{ title status startsAt endsAt
        combinesWith{orderDiscounts productDiscounts shippingDiscounts}
        customerGets{ value{ ... on DiscountOnQuantity{ effect{ ... on DiscountPercentage{percentage} } } }
          items{ ... on DiscountProducts{products(first:20){nodes{id title status}}} } } }
    }}}}""")
    now = datetime.datetime.now(datetime.timezone.utc)
    gift_products = set()
    active = 0
    for node in data["automaticDiscountNodes"]["nodes"]:
        d = node["automaticDiscount"] or {}
        title = d.get("title") or "(untitled)"
        combines = d.get("combinesWith") or {}
        ends = d.get("endsAt")
        if d.get("status") == "ACTIVE":
            active += 1
            # A tiered spend offer is order class. If it will not combine with
            # product discounts it quietly cancels every gift in the cart.
            mr = (d.get("minimumRequirement") or {}).get("greaterThanOrEqualToSubtotal")
            if mr and not combines.get("productDiscounts"):
                FAILS.append(f"{title}: minimum-spend discount that will NOT combine with product "
                             f"discounts. Every gift in a qualifying cart is being cancelled.")
            if d["__typename"] == "DiscountAutomaticBxgy":
                eff = ((d.get("customerGets") or {}).get("value") or {}).get("effect") or {}
                if eff.get("percentage") == 1.0:
                    for p in (((d.get("customerGets") or {}).get("items") or {})
                              .get("products", {}) or {}).get("nodes", []):
                        gift_products.add((p["id"], p["title"], p["status"]))
                    if not combines.get("productDiscounts"):
                        WARNS.append(f"{title}: gift does not combine with other product discounts.")
            if ends:
                left = datetime.datetime.fromisoformat(ends.replace("Z", "+00:00")) - now
                if left.days < 2:
                    WARNS.append(f"{title}: ends in {left.days}d {left.seconds // 3600}h ({ends[:16]}).")
        elif d.get("status") == "EXPIRED" and ends:
            # The Mesa offer died unnoticed because nothing reported it.
            gone = now - datetime.datetime.fromisoformat(ends.replace("Z", "+00:00"))
            if 0 <= gone.days <= 7:
                WARNS.append(f"{title}: expired {gone.days}d ago. Is the site still advertising it?")
    NOTES.append(f"{active} automatic discounts active.")

    # A gift the theme cannot resolve is a gift that arrives at full price.
    if gift_products:
        col = gql("""{collections(first:5, query:"handle:gwp-gifts"){nodes{
          products(first:50){nodes{id}}}}}""")
        nodes = col["collections"]["nodes"]
        in_col = {p["id"] for p in nodes[0]["products"]["nodes"]} if nodes else set()
        for pid, ptitle, pstatus in gift_products:
            if pstatus != "ACTIVE":
                FAILS.append(f"Gift product is {pstatus}, so the gift cannot be given: {ptitle}")
            elif pid not in in_col:
                # Only a gift the THEME adds needs to be in that collection.
                # Discount-only gifts, like the travel system adapters the
                # customer adds themselves, are fine outside it.
                WARNS.append(f"Gift product not in gwp-gifts. Fine if the customer adds it "
                             f"themselves; broken if the theme is meant to: {ptitle}")


def check_canary():
    """Buy nothing, but prove a pram still brings its free bag and its tier."""
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),
                                     urllib.request.HTTPSHandler(context=CTX))
    op.addheaders = [("User-Agent", "UPPAbaby store health check")]

    def call(path, payload=None):
        url = STOREFRONT + path
        if payload is None:
            return json.loads(op.open(url, timeout=40).read().decode())
        req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        return json.loads(op.open(req, timeout=40).read().decode())

    try:
        call("/cart/clear.js", {})
        call("/cart/add.js", {"items": [{"id": int(CANARY_VARIANT), "quantity": 1}]})
        cart = call("/cart.js")
    except urllib.error.HTTPError as e:
        WARNS.append(f"Canary cart could not run (HTTP {e.code}). Checked nothing end to end.")
        return
    except Exception as e:
        WARNS.append(f"Canary cart could not run ({type(e).__name__}). Checked nothing end to end.")
        return

    pram = [i for i in cart["items"] if str(i["variant_id"]) == CANARY_VARIANT]
    if not pram:
        WARNS.append("Canary pram would not add to the cart. Check the variant is still for sale.")
    else:
        titles = ", ".join(f"{i['title'][:38]} ${i['final_line_price']/100:.2f}" for i in cart["items"])
        NOTES.append(f"Canary cart: {titles}")
        gifts = [i for i in cart["items"] if (i.get("properties") or {}).get("_ub_gift")]
        if not gifts:
            WARNS.append("Canary: no gift was added with the pram. The theme may not be adding it.")
        for g in gifts:
            if g["final_line_price"] != 0:
                FAILS.append(f"Canary: gift is being CHARGED at ${g['final_line_price']/100:.2f} "
                             f"instead of free: {g['title'][:50]}")
    try:
        call("/cart/clear.js", {})
    except Exception:
        pass


def check_changes():
    """Who changed what since yesterday. Orders and customers are noise here."""
    since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1))
    data = gql("""{events(first:100, sortKey:CREATED_AT, reverse:true){nodes{
      createdAt message appTitle attributeToApp attributeToUser
      ... on BasicEvent{ subjectType } }}}""")
    watch = {"PRODUCT", "PAGE", "COLLECTION", "PRICE_RULE", "DISCOUNT",
             "DISCOUNT_AUTOMATIC_NODE", "DISCOUNT_CODE_NODE", "ARTICLE", "BLOG", "THEME"}
    rows = []
    for e in data["events"]["nodes"]:
        when = datetime.datetime.fromisoformat(e["createdAt"].replace("Z", "+00:00"))
        if when < since:
            continue
        if (e.get("subjectType") or "") not in watch:
            continue
        who = e.get("appTitle") or ("a person in the Shopify admin" if e.get("attributeToUser") else "unattributed")
        msg = (e.get("message") or "").split("<")[0].strip()
        rows.append(f"   {e['createdAt'][11:16]}  {who[:26]:26} {msg[:90]}")
    if rows:
        NOTES.append(f"{len(rows)} change(s) in the last 24h:")
        NOTES.extend(rows)
    else:
        NOTES.append("No product, page, collection or discount changes in the last 24h.")


def email(subject, body):
    key, to = os.environ.get("RESEND_API_KEY"), os.environ.get("ALERT_EMAIL")
    if not (key and to):
        return
    payload = {"from": "UPPAbaby site check <noreply@uppababy.com.au>",
               "to": [to], "subject": subject,
               "text": body}
    req = urllib.request.Request("https://api.resend.com/emails",
                                 data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, context=CTX, timeout=30)
        print("   alert emailed to", to)
    except Exception as e:
        print("   alert email failed:", e)


def main():
    print("UPPAbaby store check -", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
    check_discounts()
    if CANARY:
        check_canary()
    check_changes()

    out = []
    for label, items in (("FAIL", FAILS), ("WARN", WARNS)):
        for i in items:
            out.append(f"{label}  {i}")
    print()
    print("\n".join(out) if out else "All clear.")
    print()
    for n in NOTES:
        print(("INFO  " + n) if not n.startswith("   ") else n)

    if FAILS:
        email(f"UPPAbaby site check: {len(FAILS)} problem(s)",
              "\n".join(out) + "\n\n" + "\n".join(NOTES))
        sys.exit(1)


if __name__ == "__main__":
    main()
