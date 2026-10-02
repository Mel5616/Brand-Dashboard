#!/usr/bin/env python3
"""Build src/data/coolkidz-help-knowledge.json for the assistant on help.coolkidz.com.au.

The help centre assistant answers set-up, care, troubleshooting and warranty questions,
so unlike Ask Coolkidz (coolkidz.com.au) it keeps each brand's full support material:
FAQs, guides, manuals, videos, care and safety rules, specs and warranty policy.
Shop-only material (offers, stockists, retail, programs, awards) is dropped.
Email addresses and phone numbers are stripped: the help centre sends people to
"Lodge a request", never to an inbox or a phone line.

UPPAbaby is left out: it has its own help centre at help.uppababy.com.au.

It also reads every published article on help.coolkidz.com.au (public pages, no key).

  python3 scripts/build_coolkidz_help_knowledge.py
"""
import html
import json
import os
import re
import urllib.request

from build_coolkidz_knowledge import BRANDS, flat, absolute

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "src", "data")
HELP = "https://help.coolkidz.com.au"

DROP = {"store", "offers", "stockists", "retail", "programs", "awards", "colours", "wraps", "travel_minis"}
LIMIT = 16000  # per brand
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
PHONE = re.compile(r"(\+?61\s?|\b0)[2-478](\s?\d){8}\b|\b1[38]00(\s?\d){6}\b|\b13\s?\d{2}\s?\d{2}\b")


def scrub(text):
    text = EMAIL.sub("(lodge a request instead)", text)
    return PHONE.sub("(lodge a request instead)", text)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (help-knowledge-build)"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


def text_of(fragment):
    fragment = re.sub(r"<(script|style|iframe)[^>]*>.*?</\1>", " ", fragment, flags=re.S | re.I)
    fragment = re.sub(r"</(p|li|h[1-6]|div|tr)>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return "\n".join(line.strip() for line in re.sub(r"[ \t]+", " ", text).splitlines() if line.strip())


def articles():
    """Every published article on the help centre, as plain text."""
    home = get(f"{HELP}/support/solutions")
    folders = sorted(set(re.findall(r'href="(/support/solutions/folders/\d+)', home)))
    seen, out = set(), []
    for f in folders:
        page = get(HELP + f)
        for path in re.findall(r'href="(/support/solutions/articles/\d+[^"#?]*)"', page):
            aid = re.search(r"articles/(\d+)", path).group(1)
            if aid in seen:
                continue
            seen.add(aid)
            doc = get(HELP + path)
            title = html.unescape(re.search(r'<h1 class="fw-page-title">(.*?)</h1>', doc, re.S).group(1)).strip()
            # the article body element (the class name also appears in the theme's CSS in <head>)
            m = re.search(r'<div class="fw-content fw-content--single-article[^"]*">(.*)', doc, re.S)
            chunk = m.group(1) if m else ""
            chunk = re.split(r'class="[^"]*(fw-article-feedback|fw-feedback|fw-sidebar)', chunk)[0]
            chunk = re.sub(r"<[^>]*$", "", chunk)  # the split leaves half a tag at the end
            out.append({"title": title, "url": HELP + path, "text": scrub(text_of(chunk))[:6000]})
    return out


def main():
    out = {"brands": {}, "articles": []}
    for stem, (name, site) in BRANDS.items():
        if stem == "uppababy":
            continue
        k = json.load(open(os.path.join(DATA, f"{stem}-knowledge.json")))
        parts = [f"{key.upper().replace('_', ' ')}\n{absolute(flat(val), site)}" for key, val in k.items() if key not in DROP]
        text = scrub("\n\n".join(parts))
        if len(text) > LIMIT:
            text = text[:LIMIT].rsplit("\n", 1)[0] + "\n(more detail on the brand's own site)"
        out["brands"][name] = {"site": site, "facts": text}
    out["articles"] = articles()
    path = os.path.join(DATA, "coolkidz-help-knowledge.json")
    json.dump(out, open(path, "w"), indent=1, ensure_ascii=False)
    total = sum(len(b["facts"]) for b in out["brands"].values())
    print(f"wrote {path}: {total:,} chars across {len(out['brands'])} brands, {len(out['articles'])} help articles")


if __name__ == "__main__":
    main()
