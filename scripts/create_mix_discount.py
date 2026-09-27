#!/usr/bin/env python3
"""Switch on the Coolkidz mix-and-save automatic discount.

Run after the "Mix and save" function has been deployed to the Coolkidz store
(shopify-apps/coolkidz-mix-and-save, `npx @shopify/cli@latest app deploy`).
Creates, or updates, one automatic discount "Mix and save" that uses the
function, with the tiers in its metafield. Safe to re-run.

  python3 scripts/create_mix_discount.py [--tiers 5,10,15] [--dry-run]
"""
import argparse, json, os, sys, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

CONFIG = os.path.join(os.path.dirname(__file__), "..", "stores.config.json")
TITLE = "Mix and save"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--tiers", default="5,10,15"); ap.add_argument("--dry-run", action="store_true"); a = ap.parse_args()
    t2, t3, t4 = [int(x) for x in a.tiers.split(",")]
    tiers = json.dumps({"2": t2, "3": t3, "4": t4})
    cfg = json.load(open(CONFIG))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); tok = store_token(ck)

    def gql(q, v=None):
        r = urllib.request.Request(f"https://{ck['domain']}/admin/api/2025-07/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                                   headers={"X-Shopify-Access-Token": tok, "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(r, timeout=120))
        if d.get("errors"): raise SystemExit(str(d["errors"])[:400])
        return d["data"]

    fns = [f for f in gql("{shopifyFunctions(first:50){nodes{id title apiType}}}")["shopifyFunctions"]["nodes"] if f["title"] == TITLE]
    if not fns:
        raise SystemExit('The "Mix and save" function isn\'t deployed yet. Deploy shopify-apps/coolkidz-mix-and-save first.')
    fn = fns[0]; print("function:", fn)

    existing = [n for n in gql('{discountNodes(first:50,query:"title:\'Mix and save\'"){nodes{id discount{__typename ... on DiscountAutomaticApp{title status}}}}}')["discountNodes"]["nodes"]
                if n["discount"].get("title") == TITLE]
    body = {"title": TITLE, "functionId": fn["id"], "discountClasses": ["ORDER"],
            "startsAt": datetime.now(timezone.utc).isoformat(),
            "combinesWith": {"orderDiscounts": False, "productDiscounts": False, "shippingDiscounts": True},
            "metafields": [{"namespace": "$app:mix-and-save", "key": "tiers", "type": "json", "value": tiers}]}
    if a.dry_run: print("would", "update" if existing else "create", body); return
    if existing:
        body.pop("functionId")
        r = gql("mutation($id:ID!,$d:DiscountAutomaticAppInput!){discountAutomaticAppUpdate(id:$id,automaticAppDiscount:$d){userErrors{field message}}}",
                {"id": existing[0]["id"], "d": body})["discountAutomaticAppUpdate"]
    else:
        r = gql("mutation($d:DiscountAutomaticAppInput!){discountAutomaticAppCreate(automaticAppDiscount:$d){automaticAppDiscount{discountId status} userErrors{field message}}}",
                {"d": body})["discountAutomaticAppCreate"]
    print(r)


if __name__ == "__main__":
    main()
