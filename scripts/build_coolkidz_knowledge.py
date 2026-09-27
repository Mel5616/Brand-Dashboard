#!/usr/bin/env python3
"""Build src/data/coolkidz-knowledge.json for "Ask Coolkidz" on coolkidz.com.au.

Condenses every brand's assistant fact sheet (src/data/<brand>-knowledge.json)
into one: product facts, choosing guides, safety rules and FAQs per brand.
Brand-site-only material (page links, stockists, videos, manuals, offers,
brand-site policies) is dropped, because those belong to the brand's own site;
the Coolkidz assistant links to coolkidz.com.au products and, for deep dives,
to the brand's own website.

  python3 scripts/build_coolkidz_knowledge.py
"""
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "src", "data")

BRANDS = {  # file stem -> (display name, public site)
    "uppababy": ("UPPAbaby", "https://uppababy.com.au"), "nanit": ("Nanit", "https://nanit.com.au"),
    "gaia": ("Gaia Baby", "https://www.gaia-baby.com.au"), "wonderfold": ("WonderFold", "https://wonderfold.com.au"),
    "magic": ("Magic", "https://magicbabyproducts.com.au"), "frida": ("Frida", "https://fridaaustralia.com.au"),
    "zazu": ("ZAZU", "https://zazu-kids.com.au"), "miamily": ("MiaMily", "https://miamily.com.au"),
    "smartrike": ("smarTrike", "https://smartrike.com.au"), "mamave": ("Mamave", "https://mamave.com.au"),
    "matchstick": ("Matchstick Monkey", "https://www.matchstickmonkey.com.au"), "hannie": ("Hannie", "https://hannie.com.au"),
}
DROP = {"pages", "stockists", "videos", "manuals", "offers", "policies", "retail", "collections", "store",
        "programs", "awards", "colours", "guides", "teething_map", "development", "travel_minis", "ingredients", "wraps"}
LIMIT = {"uppababy": 26000, "zazu": 9000, "mamave": 8000, "miamily": 8000}
DEFAULT_LIMIT = 7000


def flat(v, depth=0):
    """Render nested JSON as compact plain text."""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        if all(isinstance(x, dict) and "q" in x and "a" in x for x in v):
            return "\n".join(f"Q: {x['q']}\nA: {x['a']}" for x in v)
        return "\n".join("- " + flat(x, depth + 1) for x in v)
    if isinstance(v, dict):
        return "\n".join(f"{k}: {flat(x, depth + 1)}" for k, x in v.items())
    return ""


def absolute(text, site):
    # markdown links and bare /paths from the brand fact sheets point at the brand site
    text = re.sub(r"\]\((/[^)]*)\)", lambda m: f"]({site}{m.group(1)})", text)
    return text


def main():
    out = {"brands": {}}
    for stem, (name, site) in BRANDS.items():
        k = json.load(open(os.path.join(DATA, f"{stem}-knowledge.json")))
        parts = []
        for key, val in k.items():
            if key in DROP:
                continue
            parts.append(f"{key.upper().replace('_', ' ')}\n{absolute(flat(val), site)}")
        text = "\n\n".join(parts)
        cap = LIMIT.get(stem, DEFAULT_LIMIT)
        if len(text) > cap:
            text = text[:cap].rsplit("\n", 1)[0] + "\n(more detail on the brand's own site)"
        out["brands"][name] = {"site": site, "facts": text}
    path = os.path.join(DATA, "coolkidz-knowledge.json")
    json.dump(out, open(path, "w"), indent=1, ensure_ascii=False)
    total = sum(len(b["facts"]) for b in out["brands"].values())
    print(f"wrote {path}: {total:,} chars across {len(out['brands'])} brands")


if __name__ == "__main__":
    main()
