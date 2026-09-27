import subprocess, re, json, html, sys
prod, art = open('seo_targets.txt').read().split()
paths = ["/", "/pages/our-brands", "/pages/sets", "/pages/gift-registry", "/pages/help", "/pages/contact", "/pages/delivery", "/pages/stockists", "/pages/saved",
 "/pages/pharmacies", "/pages/dental", "/pages/childcare", "/pages/business", "/pages/partner-with-us", "/pages/for-retailers", "/pages/become-a-stockist",
 "/pages/about", "/pages/events", "/pages/catalogues", "/pages/learning-hub", "/collections/all", "/collections/best-sellers", "/collections/prams-and-strollers",
 "/collections/sleep", "/collections/nursery-and-sleep", "/collections/vendors?q=UPPAbaby", "/products/" + prod, "/blogs/news", "/blogs/" + art, "/cart", "/search?q=pram", "/pages/no-such-page"]
def get(p):
    out = subprocess.run(["curl", "-s", "-b", "jar", "-c", "jar", "-w", "\n%{http_code}", "https://coolkidz.com.au" + p], capture_output=True, text=True).stdout
    body, code = out.rsplit("\n", 1); return body, code
rows = []
titles = {}
for p in paths:
    h, code = get(p)
    t = re.search(r"<title>(.*?)</title>", h, re.S); t = html.unescape(re.sub(r"\s+", " ", t.group(1)).strip()) if t else ""
    d = re.search(r'<meta name="description" content="([^"]*)"', h); d = html.unescape(d.group(1)) if d else ""
    canon = re.search(r'<link rel="canonical" href="([^"]*)"', h)
    ogi = re.search(r'<meta property="og:image" content="([^"]*)"', h)
    ogt = re.search(r'<meta property="og:title" content="([^"]*)"', h)
    robots = re.search(r'<meta name="robots" content="([^"]*)"', h)
    h1 = len(re.findall(r"<h1[\s>]", h))
    ld_ok, ld_types = True, []
    for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try:
            j = json.loads(m); ld_types += [x.get("@type") for x in (j if isinstance(j, list) else j.get("@graph", [j]))]
        except Exception: ld_ok = False
    imgs = re.findall(r"<img\b[^>]*>", h)
    noalt = [i for i in imgs if not re.search(r'\balt=', i)]
    issues = []
    if code not in ("200",) and p != "/pages/no-such-page": issues.append("HTTP " + code)
    if p == "/pages/no-such-page" and code != "404": issues.append("404 page returns " + code)
    if "Liquid error" in h: issues.append("Liquid error")
    if "ck-base.css" not in h: issues.append("not new theme")
    if not t: issues.append("no title")
    elif len(t) > 65: issues.append(f"title {len(t)} chars")
    if not d: issues.append("no description")
    elif len(d) > 160 or len(d) < 70: issues.append(f"desc {len(d)} chars")
    if not canon: issues.append("no canonical")
    if not ogt or not ogi: issues.append("og missing")
    if h1 != 1 and p != "/cart": issues.append(f"{h1} h1")
    if not ld_ok: issues.append("bad JSON-LD")
    if noalt: issues.append(f"{len(noalt)} img no alt")
    if robots and "noindex" in robots.group(1) and p not in ("/cart", "/search?q=pram", "/pages/saved"): issues.append("NOINDEX")
    titles.setdefault(t, []).append(p)
    rows.append((p, code, t, len(d), h1, ",".join(sorted(set(filter(None, ld_types))))[:60], issues))
for p, code, t, dl, h1, ld, iss in rows:
    print(f"{p[:44]:44} {code} | {t[:58]:58} | d{dl:3} h1:{h1} | {ld[:40]:40} | {'; '.join(iss) or 'OK'}")
dups = {t: ps for t, ps in titles.items() if len(ps) > 1}
print("duplicate titles:", dups)
