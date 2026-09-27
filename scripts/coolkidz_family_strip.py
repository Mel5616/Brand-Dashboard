#!/usr/bin/env python3
"""Add "Part of the Coolkidz family" to the footer of every brand site.

One snippet (snippets/coolkidz-family.liquid) links to the other eleven
brands and to coolkidz.com.au; the current site is left out automatically.
It is rendered just before </footer>. Gaia Baby and Magic already had their
own brand rows, which are replaced so the family shows once.

Cross-brand links on brand sites were approved by Mel on 27 Sep 2026.

  python3 scripts/coolkidz_family_strip.py [--dry-run] [--brand Magic]
"""
import argparse, json, os, re, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

CONFIG = os.path.join(os.path.dirname(__file__), "..", "stores.config.json")
RENDER = "{% render 'coolkidz-family' %}"
FILES = {"Frida": "sections/footer.liquid", "Gaia Baby": "sections/footer.liquid", "Hannie": "layout/theme.liquid",
         "Magic": "sections/footer.liquid", "Mamave": "layout/theme.liquid", "Matchstick Monkey": "sections/footer.liquid",
         "MiaMily": "layout/theme.liquid", "Nanit": "sections/nanit-footer.liquid", "SmarTrike": "sections/footer.liquid",
         "UPPAbaby": "sections/footer.liquid", "WonderFold": "sections/footer.liquid", "ZAZU": "sections/footer.liquid"}
OLD_ROWS = {"Gaia Baby": r'\s*<div class="brandrow">.*?</div>', "Magic": r'\s*<div class="brands-row">.*?</div>'}

SNIPPET = """{%- comment -%}
  The Coolkidz family: links to every other brand Coolkidz distributes and to
  coolkidz.com.au, where they can be bought together. The current site is
  skipped automatically. Managed by brand-dashboard/scripts/coolkidz_family_strip.py.
{%- endcomment -%}
{%- assign ckf_self = shop.url | remove: 'www.' | remove: 'https://' | remove: 'http://' -%}
{%- capture ckf_brands -%}UPPAbaby|https://uppababy.com.au
Nanit|https://nanit.com.au
Gaia Baby|https://www.gaia-baby.com.au
WonderFold|https://wonderfold.com.au
Magic|https://magicbabyproducts.com.au
Frida|https://fridaaustralia.com.au
ZAZU|https://zazu-kids.com.au
MiaMily|https://miamily.com.au
smarTrike|https://smartrike.com.au
Mamave|https://mamave.com.au
Matchstick Monkey|https://www.matchstickmonkey.com.au
Hannie|https://hannie.com.au{%- endcapture -%}
<div class="coolkidz-family" style="clear:both;max-width:1240px;margin:0 auto;padding:22px 20px 26px;border-top:1px solid rgba(128,128,128,.25);text-align:center;font-size:13px;line-height:1.9;color:inherit;position:relative;z-index:1">
  <p style="margin:0 0 4px;opacity:.8">Part of the <a href="https://coolkidz.com.au" style="color:inherit;font-weight:600;text-decoration:underline">Coolkidz family</a> of baby brands</p>
  <p style="margin:0">
    {%- assign ckf_lines = ckf_brands | newline_to_br | split: '<br />' -%}
    {%- assign ckf_first = true -%}
    {%- for l in ckf_lines -%}
      {%- assign p = l | strip | split: '|' -%}
      {%- assign host = p[1] | remove: 'www.' | remove: 'https://' -%}
      {%- unless ckf_self contains host -%}
        {%- unless ckf_first %} <span aria-hidden="true" style="opacity:.45">&middot;</span> {% endunless -%}
        <a href="{{ p[1] }}" style="color:inherit;text-decoration:none;white-space:nowrap">{{ p[0] }}</a>
        {%- assign ckf_first = false -%}
      {%- endunless -%}
    {%- endfor -%}
  </p>
  <p style="margin:6px 0 0"><a href="https://coolkidz.com.au" style="color:inherit;font-weight:600;text-decoration:underline">Shop all 12 brands together at coolkidz.com.au</a></p>
</div>
"""


def gql(b, t, q, v=None):
    r = urllib.request.Request(f"https://{b['domain']}/admin/api/2025-07/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                               headers={"X-Shopify-Access-Token": t, "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(r, timeout=120))
    if d.get("errors"): raise RuntimeError(str(d["errors"])[:300])
    return d["data"]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--brand"); a = ap.parse_args()
    cfg = json.load(open(CONFIG))
    for b in cfg["brands"]:
        if b["name"] not in FILES or (a.brand and b["name"] != a.brand): continue
        t = store_token(b); fn = FILES[b["name"]]
        th = gql(b, t, "{themes(first:1,roles:[MAIN]){nodes{id name}}}")["themes"]["nodes"][0]
        src = gql(b, t, 'query($id:ID!,$f:[String!]){theme(id:$id){files(first:1,filenames:$f){nodes{body{... on OnlineStoreThemeFileBodyText{content}}}}}}',
                  {"id": th["id"], "f": [fn]})["theme"]["files"]["nodes"][0]["body"]["content"]
        new, notes = src, []
        if b["name"] in OLD_ROWS:
            new2 = re.sub(OLD_ROWS[b["name"]], "", new, count=1, flags=re.S)
            notes.append("replaced old brand row" if new2 != new else "old brand row not found")
            new = new2
        if RENDER not in new:
            i = new.rfind("</footer>")
            if i < 0:
                print(f"{b['name']}: no </footer> in {fn}, skipped"); continue
            new = new[:i] + RENDER + "\n" + new[i:]
        else:
            notes.append("strip already there")
        print(f"{b['name']} [{th['name']}] {fn}: {'; '.join(notes) or 'strip added'}")
        if a.dry_run: continue
        files = [{"filename": "snippets/coolkidz-family.liquid", "body": {"type": "TEXT", "value": SNIPPET}}]
        if new != src: files.append({"filename": fn, "body": {"type": "TEXT", "value": new}})
        r = gql(b, t, "mutation($id:ID!,$f:[OnlineStoreThemeFilesUpsertFileInput!]!){themeFilesUpsert(themeId:$id,files:$f){upsertedThemeFiles{filename} userErrors{filename message}}}",
                {"id": th["id"], "f": files})["themeFilesUpsert"]
        print("   wrote", [x["filename"] for x in r["upsertedThemeFiles"] or []], r["userErrors"] or "")


if __name__ == "__main__":
    main()
