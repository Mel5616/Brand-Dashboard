#!/usr/bin/env python3
"""Write a real restock ETA (month precision) onto out-of-stock Shopify variants from the Asana
'Stock Report' board's 'ORDERING FOR' custom field, across every brand store where the OOS row's
Code field matches a real Shopify variant SKU.

This is a *fallback* alongside scripts/sync_cin7_restock_eta.py: that script has day-precision
data from Cin7 PO dates, but most open POs don't have an Estimated Arrival Date filled in (e.g.
UPM3JM, UPV3AD — both have approved Cin7 POs with no date set). Staff already track a month-level
ETA by hand on the Asana Stock Report board ("Ordering For"), so this mirrors that onto a second
metafield, custom.restock_eta_month (text, e.g. "December 2026"), read by the storefront only
when the day-precision custom.restock_eta is absent — Cin7's exact date always wins when it
exists.

Skips: rows without a Code (no reliable SKU match — printed at the end so Asana can be given
one), rows whose "ORDERING FOR" says Discontinued (leave blank, no note), rows whose "ORDERING
FOR" isn't a real month name (e.g. "Awaiting supplier confirmation"), and any SKU that's actually
back in stock in Shopify right now (Asana can go stale — Shopify's own quantity decides whether
to show anything at all).

Needs stores.config.json + NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (env or .env.local).

  python3 scripts/sync_asana_restock_eta.py [--dry-run] [--brand "UPPAbaby"]
"""
import argparse, json, os, sys, urllib.parse, urllib.request
from datetime import date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]


def env_local():
    try:
        for line in open(os.path.join(BASE_DIR, ".env.local")):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))
    except FileNotFoundError:
        pass


def sb_get(path):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url + path, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def parse_month(text):
    if not text:
        return None
    t = text.strip().lower()
    if "discontin" in t:
        return "DISCONTINUED"
    for i, m in enumerate(MONTHS):
        if m in t:
            today = date.today()
            month_num = i + 1
            year = today.year if month_num >= today.month else today.year + 1
            return f"{m.capitalize()} {year}"
    return None  # e.g. "Awaiting supplier confirmation" — nothing usable yet


def load_ordering_for():
    """brand (Asana section) -> {sku_lower: month_text | 'DISCONTINUED' | None}, plus a list of
    OOS rows per brand that have no Code field at all (can't be matched to a SKU)."""
    tasks = sb_get("/rest/v1/asana_tasks?select=name,section,custom_fields"
                    "&project_label=eq.Stock%20Report&completed=eq.false&limit=1000")
    by_brand, unmatched = {}, {}
    for t in tasks:
        cf = t.get("custom_fields") or {}
        if not cf:
            continue
        brand = (t.get("section") or "General").strip()
        code = (cf.get("Code") or "").strip()
        ordering_for = cf.get("ORDERING FOR") or cf.get("Ordering For") or cf.get("Ordering for")
        month = parse_month(ordering_for)
        if not code:
            unmatched.setdefault(brand, []).append(t["name"].strip())
            continue
        by_brand.setdefault(brand, {})[code.lower()] = month
    return by_brand, unmatched


class Shop:
    def __init__(self, c):
        self.dom = c["domain"]
        self.c = c
        self._tok = None

    def tok(self):
        if self._tok:
            return self._tok
        for cid, sec in ((self.c.get("shopifyClientId"), self.c.get("shopifyClientSecret")),
                          (self.c.get("clientId"), self.c.get("clientSecret"))):
            if not cid or not sec:
                continue
            try:
                d = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": cid, "client_secret": sec}).encode()
                r = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://{self.dom}/admin/oauth/access_token", data=d, headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=30).read())
                self._tok = r["access_token"]
                return self._tok
            except Exception as e:
                sys.stderr.write("client credentials failed: %s\n" % e)
        self._tok = self.c.get("token")
        return self._tok

    def gql(self, q, v=None):
        req = urllib.request.Request(f"https://{self.dom}/admin/api/2025-01/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(), headers={"X-Shopify-Access-Token": self.tok(), "Content-Type": "application/json"})
        r = json.loads(urllib.request.urlopen(req, timeout=120).read())
        if r.get("errors"):
            raise RuntimeError(r["errors"])
        return r["data"]


VARIANTS_Q = """query($c:String){
  productVariants(first:100, after:$c) {
    pageInfo{hasNextPage endCursor}
    nodes{
      id sku inventoryQuantity
      dayEta: metafield(namespace:"custom", key:"restock_eta"){ value }
      monthEta: metafield(namespace:"custom", key:"restock_eta_month"){ id value }
    }
  }
}"""


def sync_brand(name, c, ordering_for, dry_run):
    shop = Shop(c)
    variants, cur = [], None
    while True:
        d = shop.gql(VARIANTS_Q, {"c": cur})["productVariants"]
        variants += d["nodes"]
        if not d["pageInfo"]["hasNextPage"]:
            break
        cur = d["pageInfo"]["endCursor"]

    set_batch, delete_ids = [], []
    for v in variants:
        sku = (v.get("sku") or "").strip().lower()
        qty = v.get("inventoryQuantity")
        out_of_stock = qty is not None and qty <= 0
        existing = v.get("monthEta")
        month = ordering_for.get(sku) if sku else None
        has_day_eta = bool(v.get("dayEta"))  # Cin7's exact PO date always wins — this is a fallback only

        should_set = out_of_stock and month and month != "DISCONTINUED" and not has_day_eta
        if should_set:
            if not existing or existing["value"] != month:
                set_batch.append({"ownerId": v["id"], "namespace": "custom", "key": "restock_eta_month", "type": "single_line_text_field", "value": month})
        elif existing:
            delete_ids.append({"ownerId": v["id"], "namespace": "custom", "key": "restock_eta_month"})

    if dry_run:
        print(f"{name}: would set {len(set_batch)}, clear {len(delete_ids)} (dry-run)")
        for s in set_batch:
            print("   set:", s["ownerId"], "->", s["value"])
        for d2 in delete_ids:
            print("   clear:", d2["ownerId"])
        return

    for i in range(0, len(set_batch), 25):
        r = shop.gql("mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{field message}}}", {"m": set_batch[i:i + 25]})
        errs = r["metafieldsSet"]["userErrors"]
        if errs:
            print(name, "set errors:", errs)
    for i in range(0, len(delete_ids), 25):
        r = shop.gql("mutation($m:[MetafieldIdentifierInput!]!){metafieldsDelete(metafields:$m){userErrors{field message}}}", {"m": delete_ids[i:i + 25]})
        errs = r["metafieldsDelete"]["userErrors"]
        if errs:
            print(name, "delete errors:", errs)
    print(f"{name}: {len(set_batch)} set, {len(delete_ids)} cleared")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--brand", help="Only sync one brand (matches name/brand/domain, case-insensitive)")
    args = ap.parse_args()
    env_local()
    if not os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        sys.exit("Supabase env missing")

    by_brand, unmatched = load_ordering_for()

    cfg = json.load(open(os.path.join(BASE_DIR, "stores.config.json")))
    for b in cfg.get("brands", []):
        name = b.get("name") or b.get("brand") or b.get("domain")
        if args.brand and args.brand.lower() not in json.dumps({k: b.get(k) for k in ("name", "brand", "domain")}).lower():
            continue
        ordering_for = None
        for sec, m in by_brand.items():
            if sec.lower() == (name or "").lower():
                ordering_for = m
                break
        if not ordering_for:
            continue
        try:
            sync_brand(name, b, ordering_for, args.dry_run)
        except Exception as e:
            print(name, "FAILED:", e)

    for brand, names in unmatched.items():
        print(f"{brand}: {len(names)} OOS row(s) with no Code field, skipped — add a Code in Asana to sync these: {', '.join(names)}")


if __name__ == "__main__":
    main()
