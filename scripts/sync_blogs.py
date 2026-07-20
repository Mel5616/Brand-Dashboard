#!/usr/bin/env python3
"""Blog hub sync — three feeds into one place:

1. blog_articles     — every published blog article per brand, from Shopify
                       (the full back-catalogue imports automatically).
2. blog_page_metrics — GA4 monthly pageviews/sessions per /blogs/ page.
3. blog_gsc_pages    — Search Console monthly clicks/impressions/CTR/position
                       per /blogs/ URL (brands with gscProperty configured).

Last 12 months refreshed each run. Needs credentials.json (same service
account as GA4/GSC syncs) and stores.config.json.
"""
import json, os, ssl, sys, urllib.request, urllib.parse, urllib.error
from datetime import date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
CTX = ssl.create_default_context()

def load_env():
    p = os.path.join(BASE_DIR, ".env.local")
    if not os.path.exists(p):
        return
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def sb_upsert(table, rows, on_conflict):
    if not rows:
        return
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(f"{URL}/rest/v1/{table}?on_conflict={on_conflict}",
            data=json.dumps(rows[i:i+500]).encode(), method="POST",
            headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                     "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
        try:
            urllib.request.urlopen(req, context=CTX, timeout=60)
        except urllib.error.HTTPError as e:
            print(f"    Supabase {table}: {e.code} {e.read().decode()[:200]}"); raise

def months_back(n=12):
    out = []
    d = date.today().replace(day=1)
    for _ in range(n):
        out.append(d)
        d = (d.replace(day=1) - __import__("datetime").timedelta(days=1)).replace(day=1)
    return list(reversed(out))

def month_bounds(m):
    import calendar
    return m.isoformat(), m.replace(day=calendar.monthrange(m.year, m.month)[1]).isoformat()

# ── Shopify articles ─────────────────────────────────────────────────────────
def shopify_get(domain, token, path):
    req = urllib.request.Request(f"https://{domain}/admin/api/2024-07/{path}",
        headers={"X-Shopify-Access-Token": token})
    with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
        return json.loads(r.read().decode())

def public_base(brand):
    p = brand.get("gscProperty") or ""
    if p.startswith("http"):
        return p.rstrip("/")
    if p.startswith("sc-domain:"):
        return "https://" + p.split(":", 1)[1]
    return "https://" + brand.get("domain", "")

UA = {"User-Agent": "Mozilla/5.0 (Macintosh) CoolkidzDashboard/1.0"}

def http_get(url, tries=3):
    import time
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
                return r.read().decode(errors="replace")
        except urllib.error.HTTPError as e:
            if e.code in (430, 429, 503) and i < tries - 1:
                time.sleep(15 * (i + 1)); continue
            raise
    raise RuntimeError("unreachable")

def sync_articles_public(bid, brand):
    """Fallback when the Admin token lacks read_content: the storefront's public
    blog sitemaps list every article; new pages are fetched once for their title
    and publish date, then cached in blog_articles."""
    import re
    base = public_base(brand)
    try:
        idx = http_get(base + "/sitemap.xml")
    except Exception as e:
        print(f"  ✗ {brand['name']} sitemap: {e}"); return 0
    blog_maps = re.findall(r"<loc>([^<]*sitemap_blogs[^<]*)</loc>", idx)
    urls = []
    for bm in blog_maps:
        try:
            xml = http_get(bm.replace("&amp;", "&"))
        except Exception:
            continue
        urls += re.findall(r"<loc>([^<]+/blogs/[^<]+)</loc>", xml)
    # already imported → skip re-fetching pages
    st, body = 200, b"[]"
    try:
        req = urllib.request.Request(f"{URL}/rest/v1/blog_articles?brand_id=eq.{bid}&select=path&limit=3000",
            headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            body = r.read()
    except Exception:
        pass
    known = {r["path"] for r in json.loads(body.decode() or "[]")}
    rows = []
    fetched = 0
    for u in urls:
        u = u.split("?")[0].rstrip("/")
        m = re.search(r"/blogs/([^/]+)/([^/]+)$", u)
        if not m:
            continue
        path = f"/blogs/{m.group(1)}/{m.group(2)}"
        if path in known:
            continue
        if fetched >= 150:   # first-run safety cap; the rest import next sync
            break
        title, published = None, None
        try:
            import html as _html
            __import__("time").sleep(0.4)
            page = http_get(u); fetched += 1
            tm = re.search(r"<title[^>]*>(.*?)</title>", page, re.S)
            if tm:
                title = _html.unescape(re.sub(r"\s+", " ", tm.group(1)).strip())
                # drop trailing "– Brand Name" style suffixes
                title = re.sub(r"\s+[–|—-]\s+[^–|—-]{2,40}$", "", title).strip() or title
            pm = re.search(r'property="article:published_time"\s+content="([^"]+)"', page) or \
                 re.search(r'content="([^"]+)"\s+property="article:published_time"', page) or \
                 re.search(r'"datePublished"\s*:\s*"([^"]+)"', page)
            if pm:
                published = pm.group(1)
        except Exception:
            continue
        rows.append({
            "brand_id": bid, "article_id": "path:" + path, "blog_handle": m.group(1),
            "title": title or m.group(2).replace("-", " ").title(), "handle": m.group(2),
            "path": path, "url": base + path, "author": None, "tags": None,
            "published_at": published,
        })
    sb_upsert("blog_articles", rows, "brand_id,article_id")
    return len(rows) if rows else (len(known) and 0)

def sync_articles(bid, brand):
    rows = []
    base = public_base(brand)
    try:
        blogs = shopify_get(brand["domain"], brand["token"], "blogs.json").get("blogs", [])
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return sync_articles_public(bid, brand)
        print(f"  ✗ {brand['name']} blogs: {e}"); return 0
    except Exception as e:
        print(f"  ✗ {brand['name']} blogs: {e}"); return 0
    for bl in blogs:
        since = 0
        while True:
            try:
                arts = shopify_get(brand["domain"], brand["token"],
                    f"blogs/{bl['id']}/articles.json?limit=250&since_id={since}&published_status=published").get("articles", [])
            except Exception as e:
                print(f"  ✗ {brand['name']} articles: {e}"); break
            if not arts:
                break
            for a in arts:
                path = f"/blogs/{bl['handle']}/{a['handle']}"
                rows.append({
                    "brand_id": bid, "article_id": str(a["id"]), "blog_handle": bl["handle"],
                    "title": a.get("title"), "handle": a.get("handle"), "path": path,
                    "url": base + path, "author": a.get("author"),
                    "tags": a.get("tags"), "published_at": a.get("published_at"),
                })
            since = arts[-1]["id"]
            if len(arts) < 250:
                break
    sb_upsert("blog_articles", rows, "brand_id,article_id")
    return len(rows)

# ── GA4 blog page metrics ────────────────────────────────────────────────────
def sync_ga4_pages(bid, brand, months):
    prop = brand.get("ga4PropertyId")
    if not prop:
        return 0
    from google.oauth2 import service_account
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (RunReportRequest, DateRange, Dimension, Metric,
                                                    FilterExpression, Filter)
    creds = service_account.Credentials.from_service_account_file(
        os.path.join(BASE_DIR, "credentials.json"),
        scopes=["https://www.googleapis.com/auth/analytics.readonly"])
    client = BetaAnalyticsDataClient(credentials=creds)
    total = 0
    for m in months:
        start, end = month_bounds(m)
        mk = m.strftime("%Y-%m")
        try:
            resp = client.run_report(RunReportRequest(
                property=f"properties/{prop}",
                date_ranges=[DateRange(start_date=start, end_date=end)],
                dimensions=[Dimension(name="pagePath")],
                metrics=[Metric(name="screenPageViews"), Metric(name="sessions")],
                dimension_filter=FilterExpression(filter=Filter(
                    field_name="pagePath",
                    string_filter=Filter.StringFilter(match_type=Filter.StringFilter.MatchType.CONTAINS, value="/blogs/"))),
                limit=300,
            ))
        except Exception as e:
            print(f"  ✗ {brand['name']} GA4 {mk}: {e}"); continue
        rows = []
        for r in resp.rows:
            path = r.dimension_values[0].value.split("?")[0].rstrip("/")
            if not path.startswith("/blogs/"):
                continue
            rows.append({"brand_id": bid, "month_key": mk, "path": path,
                         "pageviews": int(float(r.metric_values[0].value or 0)),
                         "sessions": int(float(r.metric_values[1].value or 0))})
        # collapse dupes after query-string stripping
        agg = {}
        for r in rows:
            k = (r["path"])
            a = agg.setdefault(k, dict(r))
            if a is not r:
                a["pageviews"] += r["pageviews"]; a["sessions"] += r["sessions"]
        sb_upsert("blog_page_metrics", list(agg.values()), "brand_id,month_key,path")
        total += len(agg)
    return total

# ── Search Console blog pages ────────────────────────────────────────────────
def gsc_token():
    from google.oauth2 import service_account
    import google.auth.transport.requests
    creds = service_account.Credentials.from_service_account_file(
        os.path.join(BASE_DIR, "credentials.json"),
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def sync_gsc_pages(token, bid, brand, months):
    site = brand.get("gscProperty")
    if not site:
        return 0
    enc = urllib.parse.quote(site, safe="")
    total = 0
    for m in months:
        start, end = month_bounds(m)
        mk = m.strftime("%Y-%m")
        body = {"startDate": start, "endDate": end, "dimensions": ["page"], "rowLimit": 500,
                "dimensionFilterGroups": [{"filters": [{"dimension": "page", "operator": "contains", "expression": "/blogs/"}]}]}
        req = urllib.request.Request(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{enc}/searchAnalytics/query",
            data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
                data = json.loads(r.read().decode())
        except Exception as e:
            print(f"  ✗ {brand['name']} GSC {mk}: {e}"); continue
        rows = [{"brand_id": bid, "month_key": mk, "page": row["keys"][0].split("?")[0].rstrip("/"),
                 "clicks": int(row.get("clicks", 0)), "impressions": int(row.get("impressions", 0)),
                 "ctr": round(float(row.get("ctr", 0)) * 100, 2), "position": round(float(row.get("position", 0)), 1)}
                for row in data.get("rows", [])]
        sb_upsert("blog_gsc_pages", rows, "brand_id,month_key,page")
        total += len(rows)
    return total

def main():
    if not URL or not KEY:
        print("Missing Supabase env"); sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = config.get("brands", [])
    months = [m for m in months_back(12)]
    have_creds = os.path.exists(os.path.join(BASE_DIR, "credentials.json"))
    token = gsc_token() if have_creds else None

    for bid, b in enumerate(brands):
        if not b.get("domain") or not b.get("token"):
            continue
        n_art = sync_articles(bid, b)
        n_ga4 = sync_ga4_pages(bid, b, months) if have_creds else 0
        n_gsc = sync_gsc_pages(token, bid, b, months) if token else 0
        print(f"  {b['name']}: {n_art} articles · {n_ga4} GA4 rows · {n_gsc} GSC rows", flush=True)

if __name__ == "__main__":
    try:
        from sync_status_util import record
    except ImportError:
        record = lambda *a, **k: None
    try:
        main(); record("Blog hub", True)
    except Exception as e:
        record("Blog hub", False, str(e)[:300]); raise
