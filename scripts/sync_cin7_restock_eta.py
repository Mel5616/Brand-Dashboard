#!/usr/bin/env python3
"""Write a real restock ETA onto each out-of-stock Shopify variant, across every brand store, sourced
from Cin7's own open Purchase Orders — same data the dashboard's Stock Report "Cin7 ETA" column reads
(src/lib/cin7PurchaseOrders.ts), matched by SKU (Cin7 ProductOptions.code, same join used by
scripts/coolkidz_track_stock.py and review_metafields.py).

Sets custom.restock_eta (type: date) on any variant with zero (or negative) inventory quantity AND a
matching open PO with an estimated arrival date. Clears it once the variant is back in stock or no
longer has a matching open PO, so a stale date never lingers. Physical stock, not availableForSale —
some brands (e.g. UPPAbaby) keep selling on backorder past zero stock, so availableForSale alone would
miss them. Brand themes read the metafield: MiaMily shows "Back in stock ~mid October" on a genuinely
sold-out product; UPPAbaby shows "Ships from our next shipment, arriving ~mid October" on a still-
purchasable backorder item — same metafield, different copy for a different real situation.

Needs stores.config.json + CIN7_USERNAME/CIN7_API_KEY.

  python3 scripts/sync_cin7_restock_eta.py [--dry-run] [--brand "Coolkidz Australia"]
"""
import argparse, base64, json, os, sys, time, urllib.parse, urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env_local():
    try:
        for line in open(os.path.join(BASE_DIR, ".env.local")):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))
    except FileNotFoundError:
        pass


def cin7(path):
    auth = "Basic " + base64.b64encode(f"{os.environ['CIN7_USERNAME']}:{os.environ['CIN7_API_KEY']}".encode()).decode()
    for i in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request("https://api.cin7.com/api" + path, headers={"Authorization": auth}), timeout=120))
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("Cin7 failed: " + path)


def load_restock_etas():
    """Mirrors loadCin7RestockEtas() in src/lib/cin7PurchaseOrders.ts exactly — same query, same
    soonest-ETA-wins and multi-SKU-code-split logic, so the website and the dashboard never disagree."""
    where = urllib.parse.quote("FullyReceivedDate IS NULL AND EstimatedArrivalDate IS NOT NULL")
    etas = {}
    page = 1
    while page <= 10:
        batch = cin7(f"/v1/PurchaseOrders?where={where}&limit=50&page={page}")
        if not batch:
            break
        for po in batch:
            eta = po.get("estimatedArrivalDate")
            if not eta:
                continue
            for li in po.get("lineItems") or []:
                for raw in str(li.get("code") or "").split("/"):
                    code = raw.strip().lower()
                    if not code:
                        continue
                    existing = etas.get(code)
                    if not existing or eta < existing["eta"]:
                        etas[code] = {"eta": eta, "poRef": po.get("reference") or str(po.get("id"))}
        if len(batch) < 50:
            break
        page += 1
    return etas


class Shop:
    def __init__(self, c):
        self.dom = c["domain"]
        self.c = c
        self._tok = None

    def tok(self):
        if self._tok:
            return self._tok
        for cid, sec in ((self.c.get("shopifyClientId"), self.c.get("shopifyClientSecret")), (self.c.get("clientId"), self.c.get("clientSecret"))):
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
    nodes{ id sku inventoryQuantity metafield(namespace:"custom", key:"restock_eta"){id value} }
  }
}"""


def sync_brand(name, c, etas, dry_run):
    shop = Shop(c)
    variants, cur = [], None
    while True:
        d = shop.gql(VARIANTS_Q, {"c": cur})["productVariants"]
        variants += d["nodes"]
        if not d["pageInfo"]["hasNextPage"]:
            break
        cur = d["pageInfo"]["endCursor"]

    # Physical stock (inventoryQuantity), not availableForSale — some brands
    # (e.g. UPPAbaby prams) keep selling on backorder once stock hits zero,
    # so availableForSale stays true even when genuinely out of stock. Real
    # inventory count is the one signal that means the same thing everywhere.
    set_batch, delete_ids = [], []
    for v in variants:
        sku = (v.get("sku") or "").strip().lower()
        match = etas.get(sku) if sku else None
        existing = v.get("metafield")
        qty = v.get("inventoryQuantity")
        out_of_stock = qty is not None and qty <= 0
        if out_of_stock and match:
            if not existing or existing["value"] != match["eta"]:
                set_batch.append({"ownerId": v["id"], "namespace": "custom", "key": "restock_eta", "type": "date", "value": match["eta"]})
        elif existing:
            delete_ids.append({"ownerId": v["id"], "namespace": "custom", "key": "restock_eta"})

    if dry_run:
        print(f"{name}: would set {len(set_batch)}, clear {len(delete_ids)} (dry-run)")
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
    if not os.environ.get("CIN7_USERNAME") or not os.environ.get("CIN7_API_KEY"):
        sys.exit("Cin7 env missing")

    etas = load_restock_etas()
    print(f"{len(etas)} SKUs with an open, ETA'd Cin7 PO")

    cfg = json.load(open(os.path.join(BASE_DIR, "stores.config.json")))
    for b in cfg.get("brands", []):
        name = b.get("name") or b.get("brand") or b.get("domain")
        if args.brand and args.brand.lower() not in json.dumps({k: b.get(k) for k in ("name", "brand", "domain")}).lower():
            continue
        try:
            sync_brand(name, b, etas, args.dry_run)
        except Exception as e:
            print(name, "FAILED:", e)


if __name__ == "__main__":
    main()
