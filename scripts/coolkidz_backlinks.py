#!/usr/bin/env python3
"""Add Coolkidz backlinks to every brand site's LIVE theme.

1. Footer: the existing "distributed by Coolkidz" credit becomes a link to
   https://coolkidz.com.au.
2. Blog articles: a short note after the article body linking to the
   Coolkidz Journal (https://coolkidz.com.au/blogs/news), via a new snippet
   snippets/coolkidz-journal.liquid.

Brand sites must never promote the OTHER brands; linking to Coolkidz as the
distributor is approved (Mel, 27 Sep 2026). The note names only the brand
itself and Coolkidz.

Each edit is an exact string replacement against the current live file. If
the expected text isn't there (or the link is already present) the file is
left alone and reported, so re-running is safe.

Usage: python3 scripts/coolkidz_backlinks.py [--dry-run] [--brand Magic]
"""
import argparse
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

API = "2025-01"
CONFIG = os.path.join(os.path.dirname(__file__), "..", "stores.config.json")
CK = "https://coolkidz.com.au"
A = f'<a href="{CK}" style="color:inherit;text-decoration:underline">'
RENDER = "{% render 'coolkidz-journal' %}"

SNIPPET = """{%- comment -%}
  Backlink to the Coolkidz Journal after every article. Names only this
  brand and Coolkidz (the distributor), never the other brands.
{%- endcomment -%}
<aside class="ck-journal" style="margin:48px 0 0;padding:20px 0 0;border-top:1px solid rgba(128,128,128,.28);font-size:15px;line-height:1.6">
  <p style="margin:0">{{ shop.name }} is distributed in Australia by <a href="https://coolkidz.com.au" style="color:inherit;text-decoration:underline">Coolkidz</a>. Find more guides for Australian parents in the <a href="https://coolkidz.com.au/blogs/news" style="color:inherit;text-decoration:underline">Coolkidz Journal</a>.</p>
</aside>
"""


def after(s):
    return (s, s + "\n" + RENDER)


EDITS = {
    "Frida": {
        "sections/main-article.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("{{ settings.distributor_line }}",
            "{{ settings.distributor_line | replace: 'Coolkidz', '" + A + "Coolkidz</a>' }}")],
    },
    "Gaia Baby": {
        "sections/main-article.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("Distributed by Coolkidz Australia Pty Ltd (ACN",
            f"Distributed by {A}Coolkidz Australia Pty Ltd</a> (ACN")],
    },
    "Hannie": {
        "templates/article.liquid": [after("{{ article.content }}")],
        "layout/theme.liquid": [("Coolkidz Australia Pty Ltd<br>1 Beyer Road",
            f"{A}Coolkidz Australia Pty Ltd</a><br>1 Beyer Road")],
    },
    "Magic": {
        "sections/article-body.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("distributed by Coolkidz Australia.</span>",
            f"distributed by {A}Coolkidz Australia</a>.</span>")],
    },
    "Mamave": {
        "templates/article.liquid": [after("{{ article.content }}")],
        "layout/theme.liquid": [("Distributed by Coolkidz Australia<br>",
            f"Distributed by {A}Coolkidz Australia</a><br>")],
    },
    "Matchstick Monkey": {
        "templates/article.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("<span>&copy; {{ 'now' | date: '%Y' }} {{ section.settings.company }} &middot;",
            "<span>&copy; {{ 'now' | date: '%Y' }} " + A + "{{ section.settings.company }}</a> &middot;")],
    },
    "MiaMily": {
        "templates/article.liquid": [after("{{ article.content }}")],
        "layout/theme.liquid": [("margin-top:14px\">Coolkidz Australia Pty Ltd<br>",
            f"margin-top:14px\">{A}Coolkidz Australia Pty Ltd</a><br>")],
    },
    "Nanit": {
        "sections/nanit-article-body.liquid": [(
            "<div class=\"nau-articlebody__main\" data-rv>{{ article.content }}</div>",
            "<div class=\"nau-articlebody__main\" data-rv>{{ article.content }}\n" + RENDER + "</div>")],
        "sections/main-article-overlay.liquid": [after("{{- article.content -}}")],
        "sections/main-article.liquid": [after("{{- article.content -}}")],
        "sections/nanit-footer.liquid": [(
            "Sold and supported in Australia by {{ s.distributor_name | default: 'Coolkidz Australia Pty Ltd' }}.",
            "Sold and supported in Australia by " + A + "{{ s.distributor_name | default: 'Coolkidz Australia Pty Ltd' }}</a>.")],
    },
    "SmarTrike": {
        "sections/main-article.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("Distributed in Australia by Coolkidz Australia Pty Ltd,",
            f"Distributed in Australia by {A}Coolkidz Australia Pty Ltd</a>,")],
    },
    "UPPAbaby": {
        "templates/article.liquid": [after("{{ art_body }}")],
        "sections/footer.liquid": [("<p>&copy; {{ 'now' | date: '%Y' }} {{ section.settings.legal_name | escape }}</p>",
            "<p>&copy; {{ 'now' | date: '%Y' }} " + A + "{{ section.settings.legal_name | escape }}</a></p>")],
    },
    "WonderFold": {
        "sections/main-article.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("distributed by Coolkidz Australia Pty Ltd</span>",
            f"distributed by {A}Coolkidz Australia Pty Ltd</a></span>")],
    },
    "ZAZU": {
        "sections/main-article.liquid": [after("{{ article.content }}")],
        "sections/footer.liquid": [("{{ settings.distributor_name }}, {{ settings.distributor_address }}",
            A + "{{ settings.distributor_name }}</a>, {{ settings.distributor_address }}")],
    },
}


def gql(brand, token, query, variables=None):
    req = urllib.request.Request(
        f"https://{brand['domain']}/admin/api/{API}/graphql.json",
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.load(r)
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"])[:400])
    return d["data"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--brand")
    a = ap.parse_args()
    cfg = json.load(open(CONFIG))
    for brand in cfg["brands"]:
        name = brand["name"]
        if name not in EDITS or (a.brand and name != a.brand):
            continue
        tok = store_token(brand)
        theme = gql(brand, tok, "{themes(first:1,roles:[MAIN]){nodes{id name}}}")["themes"]["nodes"][0]
        names = list(EDITS[name])
        files = gql(brand, tok, """query($id:ID!,$f:[String!]){theme(id:$id){files(filenames:$f,first:20){nodes{
            filename body{... on OnlineStoreThemeFileBodyText{content}}}}}}""",
                    {"id": theme["id"], "f": names + ["snippets/coolkidz-journal.liquid"]})["theme"]["files"]["nodes"]
        cur = {f["filename"]: f["body"]["content"] for f in files if f["body"]}
        out, notes = [], []
        if cur.get("snippets/coolkidz-journal.liquid") != SNIPPET:
            out.append({"filename": "snippets/coolkidz-journal.liquid", "body": {"type": "TEXT", "value": SNIPPET}})
        for fn, reps in EDITS[name].items():
            src = cur.get(fn)
            if src is None:
                notes.append(f"{fn}: missing")
                continue
            new = src
            for old, rep in reps:
                if rep in new:
                    notes.append(f"{fn}: already done")
                elif new.count(old) != 1:
                    notes.append(f"{fn}: expected text found {new.count(old)}x, skipped")
                else:
                    new = new.replace(old, rep)
            if new != src:
                out.append({"filename": fn, "body": {"type": "TEXT", "value": new}})
        print(f"{name} [{theme['name']}]: {len(out)} file(s) to write; " + "; ".join(notes))
        if out and not a.dry_run:
            r = gql(brand, tok, """mutation($id:ID!,$f:[OnlineStoreThemeFilesUpsertFileInput!]!){
                themeFilesUpsert(themeId:$id,files:$f){upsertedThemeFiles{filename} userErrors{filename message}}}""",
                    {"id": theme["id"], "f": out})["themeFilesUpsert"]
            print("   wrote:", [x["filename"] for x in r["upsertedThemeFiles"] or []], "errors:", r["userErrors"])


if __name__ == "__main__":
    main()
