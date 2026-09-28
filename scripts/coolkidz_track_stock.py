#!/usr/bin/env python3
"""Switch on stock tracking for coolkidz.com.au products that Cin7 manages.

Cin7 is connected to the Coolkidz Shopify store and pushes stock levels, but
Shopify ignores them for any variant with "Track quantity" off, so those sell
without limit. For every online-store variant whose SKU is a Cin7 product code:

  - turn tracking on
  - set the Shopify quantity to Cin7's available stock at the Coolkidz
    Australia, VIC branch minus the buffer Cin7 already applies (5), so the
    product doesn't show sold out while waiting for Cin7's next push
  - stop selling when out of stock (inventory policy DENY)

Variants without a Cin7 code (Gaia Baby's multi-box furniture, a few codes
that differ) are listed, not changed. Needs the app's write_inventory and
read_locations scopes.

  python3 scripts/coolkidz_track_stock.py [--dry-run]
"""
import argparse, base64, json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRANCH = "Coolkidz Australia, VIC"
BUFFER = 5  # matches the buffer Cin7 applies to the variants it already syncs


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
            return json.load(urllib.request.urlopen(urllib.request.Request("https://api.cin7.com/api/v1/" + path, headers={"Authorization": auth}), timeout=120))
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("Cin7 failed")


def cin7_all(resource, params):
    page, out = 1, []
    while True:
        d = cin7(resource + "?" + urllib.parse.urlencode(dict(params, rows=250, page=page)))
        out += d
        if len(d) < 250: return out
        page += 1; time.sleep(0.4)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); a = ap.parse_args()
    env_local()
    cfg = json.load(open(os.path.join(BASE, "stores.config.json")))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); tok = store_token(ck)

    def gql(q, v=None):
        for i in range(6):
            r = urllib.request.Request(f"https://{ck['domain']}/admin/api/2025-07/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                                       headers={"X-Shopify-Access-Token": tok, "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(r, timeout=120))
            if any(e.get("extensions", {}).get("code") == "THROTTLED" for e in d.get("errors", [])):
                time.sleep(3); continue
            if d.get("errors"): raise RuntimeError(str(d["errors"])[:400])
            return d["data"]

    codes = set()
    for p in cin7_all("Products", {"fields": "id,productOptions"}):
        for o in p.get("productOptions") or []:
            if o.get("code"): codes.add(o["code"].strip().lower())
    avail = {}
    for r in cin7_all("Stock", {"fields": "code,branchName,available", "where": f"branchName='{BRANCH}'"}):
        avail[r["code"].strip().lower()] = int(r.get("available") or 0)
    print(f"Cin7: {len(codes)} product codes, {len(avail)} with stock records at {BRANCH}")

    # the location Cin7 already writes to: where the tracked variants' stock sits
    loc = None
    rows, cur = [], None
    while True:
        d = gql("""query($c:String){productVariants(first:200,after:$c,query:"product_publication_status:published"){pageInfo{hasNextPage endCursor}
            nodes{id sku inventoryPolicy product{id title vendor onlineStoreUrl} inventoryItem{id tracked inventoryLevels(first:5){nodes{location{id name} quantities(names:["available"]){quantity}}}}}}}""", {"c": cur})["productVariants"]
        rows += [v for v in d["nodes"] if v["product"]["onlineStoreUrl"]]
        if not d["pageInfo"]["hasNextPage"]: break
        cur = d["pageInfo"]["endCursor"]
    for v in rows:
        if v["inventoryItem"]["tracked"] and v["inventoryItem"]["inventoryLevels"]["nodes"]:
            loc = v["inventoryItem"]["inventoryLevels"]["nodes"][0]["location"]; break
    print("stock location:", loc)

    todo, skipped = [], []
    for v in rows:
        k = (v["sku"] or "").strip().lower()
        if not k or k not in codes:
            if not v["inventoryItem"]["tracked"]: skipped.append((v["product"]["vendor"], v["product"]["title"], v["sku"]))
            continue
        if v["inventoryItem"]["tracked"] and v["inventoryPolicy"] == "DENY": continue
        todo.append((v, max(0, avail.get(k, 0) - BUFFER)))
    print(f"{len(todo)} variant(s) to switch to tracked stock; {len(skipped)} left untracked (no Cin7 code)")
    for vendor, title, sku in skipped: print(f"   leave: {vendor} | {title[:60]} | sku={sku}")
    if a.dry_run:
        for v, q in todo[:15]: print(f"   {v['sku']:14} {v['product']['title'][:50]:50} -> {q}")
        return

    for i, (v, q) in enumerate(todo):
        item = v["inventoryItem"]["id"]
        if not v["inventoryItem"]["tracked"]:
            r = gql("mutation($id:ID!){inventoryItemUpdate(id:$id,input:{tracked:true}){userErrors{message}}}", {"id": item})["inventoryItemUpdate"]
            if r["userErrors"]: print("  ! track", v["sku"], r["userErrors"]); continue
            levels = v["inventoryItem"]["inventoryLevels"]["nodes"]
            if not any(l["location"]["id"] == loc["id"] for l in levels):
                gql("mutation($i:ID!,$l:ID!){inventoryActivate(inventoryItemId:$i,locationId:$l){userErrors{message}}}", {"i": item, "l": loc["id"]})
            r = gql("""mutation($in:InventorySetQuantitiesInput!){inventorySetQuantities(input:$in){userErrors{message}}}""",
                    {"in": {"name": "available", "reason": "correction", "ignoreCompareQuantity": True,
                            "quantities": [{"inventoryItemId": item, "locationId": loc["id"], "quantity": q}]}})["inventorySetQuantities"]
            if r["userErrors"]: print("  ! qty", v["sku"], r["userErrors"])
        if v["inventoryPolicy"] != "DENY":
            r = gql("mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$p,variants:$v){userErrors{message}}}",
                    {"p": v["product"]["id"], "v": [{"id": v["id"], "inventoryPolicy": "DENY"}]})["productVariantsBulkUpdate"]
            if r["userErrors"]: print("  ! policy", v["sku"], r["userErrors"])
        if i % 25 == 0: print(f"  {i}/{len(todo)}")
    print("done")


if __name__ == "__main__":
    main()
