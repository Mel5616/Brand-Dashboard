#!/usr/bin/env python3
"""
Sync Klaviyo email marketing metrics to Supabase.

Setup:
  1. In stores.config.json, add at the top level:
       "klaviyoApiKey": "pk_xxxxxxxxxxxxxxxx"
     For each brand that has Klaviyo, add:
       "klaviyoListId": "ABC123"  (from Klaviyo → Audience → Lists)

  2. Run SQL in Supabase:
       CREATE TABLE IF NOT EXISTS klaviyo_metrics (
         brand_id INT NOT NULL, month_key TEXT NOT NULL,
         list_size INT DEFAULT 0, emails_sent INT DEFAULT 0,
         open_rate NUMERIC DEFAULT 0, click_rate NUMERIC DEFAULT 0,
         revenue NUMERIC DEFAULT 0, unsubscribes INT DEFAULT 0,
         PRIMARY KEY (brand_id, month_key)
       );
       ALTER TABLE klaviyo_metrics DISABLE ROW LEVEL SECURITY;

  3. pip3 install requests supabase python-dotenv
  4. python3 scripts/sync_klaviyo.py
"""

import sys, os, json, time, re
from datetime import datetime, date, timedelta
from calendar import monthrange

try:
    import requests
except ImportError:
    print("Missing requests. Run: pip3 install requests"); sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env.local"))
    load_dotenv()
except ImportError:
    pass
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

# Current Australian financial year (Jul–Jun), rolling automatically, up to the
# current month — so email metrics keep landing in the new FY instead of stopping
# at a hardcoded June.
try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("Australia/Melbourne")
except Exception:
    _TZ = None
_TODAY = datetime.now(_TZ) if _TZ else datetime.now()
_FY_START = _TODAY.year if _TODAY.month >= 7 else _TODAY.year - 1
def _fy_months(start_year):
    return [f"{start_year + (7 + i - 1) // 12}-{(7 + i - 1) % 12 + 1:02d}" for i in range(12)]
_CUR_MK = _TODAY.strftime("%Y-%m")
MONTH_KEYS = [mk for mk in _fy_months(_FY_START) if mk <= _CUR_MK]

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def _request(method, api_key, path, params=None, payload=None, _tries=6):
    """Klaviyo request with 429 back-off. Metric-aggregates have a tight burst limit,
    so honour Retry-After (capped) and retry before giving up."""
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "revision": "2024-10-15",
        "Accept": "application/json",
    }
    if method == "POST":
        headers["Content-Type"] = "application/json"
    url = f"https://a.klaviyo.com/api/{path}"
    for attempt in range(_tries):
        r = requests.request(method, url, headers=headers, params=params, json=payload, timeout=30)
        if r.status_code == 429 and attempt < _tries - 1:
            wait = float(r.headers.get("Retry-After", 0)) or (2 ** attempt)
            time.sleep(min(wait, 30))
            continue
        r.raise_for_status()
        return r.json()

def klaviyo_get(api_key, path, params=None):
    return _request("GET", api_key, path, params=params)

def klaviyo_post(api_key, path, payload):
    return _request("POST", api_key, path, payload=payload)

def get_list_size(api_key, list_id):
    try:
        data = klaviyo_get(api_key, f"lists/{list_id}/", {"fields[list]": "profile_count"})
        return data.get("data", {}).get("attributes", {}).get("profile_count", 0)
    except Exception as e:
        print(f"    Warning: could not fetch list size — {e}")
        return 0

# True email subscriber base = profile_count of each brand's "Active Subscribers"
# segment in Klaviyo (named e.g. "NT - Active Subscribers", "GB - Active Subscribers").
# Matched by name (tolerant of the "XX - " brand prefix); read-only.
SUBSCRIBER_SEGMENT_NAMES = {
    "email subscribers", "subscribers", "all subscribers", "email marketing subscribers",
    "newsletter subscribers", "dashboard - email subscribers", "dashboard – email subscribers",
}

def _is_active_subscribers(name):
    """True for an 'Active Subscribers' segment, ignoring a brand prefix, and NOT
    matching 'Non-active' / 'Inactive' / 'Non-email' segments."""
    n = (name or "").strip().lower()
    bad = ("inactive", "non-active", "non active", "non-email", "non email")
    return "active subscribers" in n and not any(b in n for b in bad)

def get_subscriber_count(api_key):
    """profile_count of the brand's 'Active Subscribers' segment (matched by name).
    Falls back to a generic subscribers segment, else 0. Read-only."""
    seg_id = fallback_id = None
    try:
        data = klaviyo_get(api_key, "segments/", {"fields[segment]": "name"})
        while True:
            for s in data.get("data", []):
                name = (s.get("attributes", {}).get("name") or "").strip().lower()
                if _is_active_subscribers(name):
                    seg_id = s["id"]; break
                if fallback_id is None and name in SUBSCRIBER_SEGMENT_NAMES:
                    fallback_id = s["id"]
            nxt = (data.get("links") or {}).get("next")
            if seg_id or not nxt:
                break
            headers = {"Authorization": f"Klaviyo-API-Key {api_key}", "revision": "2024-10-15", "Accept": "application/json"}
            r = requests.get(nxt, headers=headers, timeout=20); r.raise_for_status(); data = r.json()
    except Exception:
        return 0
    seg_id = seg_id or fallback_id
    if not seg_id:
        return 0
    try:
        d = klaviyo_get(api_key, f"segments/{seg_id}/", {"additional-fields[segment]": "profile_count"})
        return int(d.get("data", {}).get("attributes", {}).get("profile_count") or 0)
    except Exception:
        return 0

def get_metric_map(api_key):
    """Return {metric_name: id} for the whole account (name isn't a filterable field,
    so we list all metrics and match client-side). Follows pagination."""
    out = {}
    data = klaviyo_get(api_key, "metrics/")
    while True:
        for m in data.get("data", []):
            out[m["attributes"]["name"]] = m["id"]
        nxt = (data.get("links") or {}).get("next")
        if not nxt:
            break
        headers = {
            "Authorization": f"Klaviyo-API-Key {api_key}",
            "revision": "2024-10-15",
            "Accept": "application/json",
        }
        r = requests.get(nxt, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
    return out

def month_bounds(year, month):
    first = date(year, month, 1)
    nxt   = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return first, nxt

def metric_aggregate(api_key, metric_id, year, month, measurement, by=None):
    """Monthly aggregate. Returns the list of data rows ({dimensions, measurements})."""
    first, nxt = month_bounds(year, month)
    attrs = {
        "metric_id": metric_id,
        "measurements": [measurement],
        "interval": "month",
        "timezone": "UTC",
        "filter": [
            f"greater-or-equal(datetime,{first.isoformat()}T00:00:00+00:00)",
            f"less-than(datetime,{nxt.isoformat()}T00:00:00+00:00)",
        ],
    }
    if by:
        attrs["by"] = by
    payload = {"data": {"type": "metric-aggregate", "attributes": attrs}}
    try:
        data = klaviyo_post(api_key, "metric-aggregates/", payload)
        return data.get("data", {}).get("attributes", {}).get("data", []) or []
    except Exception as e:
        print(f"    Warning: metric aggregate failed — {e}")
        return []

def agg_total(api_key, metric_id, year, month, measurement):
    """Single scalar for a count/sum metric (no grouping)."""
    rows = metric_aggregate(api_key, metric_id, year, month, measurement)
    if rows:
        vals = rows[0].get("measurements", {}).get(measurement, [])
        return vals[0] if vals else 0
    return 0

def agg_email_revenue(api_key, metric_id, year, month):
    """Email-attributed Placed Order revenue, grouped by $attributed_channel."""
    rows = metric_aggregate(api_key, metric_id, year, month, "sum_value", by=["$attributed_channel"])
    for r in rows:
        if "$email_channel" in (r.get("dimensions") or []):
            vals = r.get("measurements", {}).get("sum_value", [])
            return vals[0] if vals else 0
    return 0

def agg_email_orders(api_key, metric_id, year, month):
    """Email-attributed Placed Order count (unique orders), grouped by $attributed_channel."""
    rows = metric_aggregate(api_key, metric_id, year, month, "unique", by=["$attributed_channel"])
    for r in rows:
        if "$email_channel" in (r.get("dimensions") or []):
            vals = r.get("measurements", {}).get("unique", [])
            return int(vals[0]) if vals else 0
    return 0

def agg_email_flow_campaign(api_key, metric_id, year, month):
    """Split email-attributed revenue into flow vs campaign by grouping Placed Order on
    [$attributed_channel, $attributed_flow]: within email, a flow id => flow, blank => campaign."""
    rows = metric_aggregate(api_key, metric_id, year, month, "sum_value", by=["$attributed_channel", "$attributed_flow"])
    flow_rev = campaign_rev = 0.0
    for r in rows:
        dims = r.get("dimensions") or []
        if len(dims) < 2 or dims[0] != "$email_channel":
            continue
        vals = r.get("measurements", {}).get("sum_value", [])
        amt = vals[0] if vals else 0
        if dims[1]:          # non-empty flow id => flow-attributed
            flow_rev += amt
        else:                # email-attributed with no flow => campaign
            campaign_rev += amt
    return flow_rev, campaign_rev

def sync_brand(db, api_key, brand, brand_id):
    list_id = brand.get("klaviyoListId")
    if not api_key:
        print(f"  ↷ {brand['name']}: no klaviyoApiKey, skipping")
        return

    print(f"  → {brand['name']}" + (f" (list {list_id})" if list_id else " (no list — subscriber count skipped)"))

    # Look up metric IDs once (name isn't filterable, so fetch all + match)
    try:
        metrics     = get_metric_map(api_key)
    except Exception as e:
        print(f"    Error fetching metrics: {e}")
        return
    received_id = metrics.get("Received Email")   # Klaviyo has no "Sent Email"; delivered = Received
    opened_id   = metrics.get("Opened Email")
    clicked_id  = metrics.get("Clicked Email")
    revenue_id  = metrics.get("Placed Order")
    unsub_id    = metrics.get("Unsubscribed from Email Marketing")
    bounce_id   = metrics.get("Bounced Email")
    spam_id     = metrics.get("Marked Email as Spam")

    list_size = get_subscriber_count(api_key)
    print(f"    Active subscribers: {list_size:,}" + ("" if list_size else "  (no 'Active Subscribers' segment found — create one in Klaviyo)"))

    for mk in MONTH_KEYS:
        year, month = int(mk[:4]), int(mk[5:])

        # "unique" = distinct profiles, so open/click rates match Klaviyo's own
        # reporting and don't exceed 100% (Apple MPP inflates total-open counts).
        # "unique" = distinct profiles, so open/click rates match Klaviyo's own
        # reporting and don't exceed 100% (Apple MPP inflates total-open counts).
        sent    = agg_total(api_key, received_id, year, month, "unique") if received_id else 0
        opened  = agg_total(api_key, opened_id,   year, month, "unique") if opened_id   else 0
        clicked = agg_total(api_key, clicked_id,  year, month, "unique") if clicked_id  else 0
        revenue = agg_email_revenue(api_key, revenue_id, year, month)    if revenue_id  else 0
        # Deliverability / list health (raw counts → rates computed in the UI).
        # Bounces are "unique" like `sent` above (not "count") — a profile
        # re-bounced across several sends in the same month was inflating the
        # rate on top of the emails_sent/emails_received mismatch (Mel, 24
        # Sep 2026; see the bounce-rate calc in today.ts for the other half).
        unsubs  = agg_total(api_key, unsub_id,  year, month, "count") if unsub_id  else 0
        bounces = agg_total(api_key, bounce_id, year, month, "unique") if bounce_id else 0
        spam    = agg_total(api_key, spam_id,   year, month, "count") if spam_id   else 0
        # Conversions + flow/campaign revenue split (email-attributed)
        orders  = agg_email_orders(api_key, revenue_id, year, month) if revenue_id else 0
        flow_rev, campaign_rev = agg_email_flow_campaign(api_key, revenue_id, year, month) if revenue_id else (0, 0)

        # Cap at 100%: in low-volume months, opens/clicks of emails delivered in a
        # prior month can exceed that month's deliveries, pushing the ratio over 100%.
        open_rate  = min(100.0, opened  / sent * 100) if sent > 0 else 0
        click_rate = min(100.0, clicked / sent * 100) if sent > 0 else 0

        row = {
            "brand_id": brand_id,
            "month_key": mk,
            "list_size": list_size,
            "emails_sent": int(sent),
            "open_rate": round(open_rate, 2),
            "click_rate": round(click_rate, 2),
            "revenue": round(float(revenue), 2),
            "unsubscribes": int(unsubs),
            "bounces": int(bounces),
            "spam_complaints": int(spam),
            "orders": int(orders),
            "flow_revenue": round(float(flow_rev), 2),
            "campaign_revenue": round(float(campaign_rev), 2),
        }
        db.table("klaviyo_metrics").upsert(row, on_conflict="brand_id,month_key").execute()
        print(f"    {mk}: delivered={int(sent):,} open={open_rate:.1f}% click={click_rate:.1f}% rev=${revenue:,.0f} orders={int(orders)} unsub={int(unsubs)} flow/camp=${flow_rev:,.0f}/${campaign_rev:,.0f}")
        time.sleep(0.2)

    # Per-campaign results for the weekly brief's "sent this week" panel
    sync_campaigns(db, api_key, brand, brand_id, revenue_id)
    # Lifecycle flow grid + per-flow performance, and the portfolio send calendar
    sync_flows(db, api_key, brand, brand_id, metrics)
    sync_campaign_calendar(db, api_key, brand_id)
    sync_list_growth(db, api_key, brand_id, metrics)


# ── Lifecycle flows: status grid + per-flow performance ─────────────────────
# One row per flow in lifecycle_flows (the Email Marketing > Lifecycle Flows
# grid, matched by name to the grid's fixed flow keys) and one row per flow
# per month in klaviyo_flow_metrics (recipients/opens/clicks/orders/revenue).
FLOW_KEY_RULES = [
    ("welcome",        r"welcome"),
    ("browse_abandon", r"browse"),
    ("cart_abandon",   r"abandon(ed)? (cart|checkout)|checkout"),
    ("post_purchase",  r"post[- ]purchase|thank you|unboxing|tips|bounce back|installation"),
    ("replenishment",  r"replenish|reorder|refill|filters|running low|time to restock"),
    ("winback",        r"win ?back|lapsed"),
    ("birthday",       r"birthday|anniversary|\bdob\b"),
    ("review_request", r"review"),
    ("back_in_stock",  r"back in stock"),
]
GRID_STATUS = {"live": "live", "manual": "paused", "paused": "paused", "draft": "planned"}

def list_flows(api_key):
    out = []
    data = klaviyo_get(api_key, "flows/", {"fields[flow]": "name,status,trigger_type", "page[size]": 50})
    while True:
        out.extend(data.get("data", []))
        nxt = (data.get("links") or {}).get("next")
        if not nxt:
            break
        headers = {"Authorization": f"Klaviyo-API-Key {api_key}", "revision": "2024-10-15", "Accept": "application/json"}
        r = requests.get(nxt, headers=headers, timeout=20); r.raise_for_status(); data = r.json()
    return out

def agg_by_flow(api_key, metric_id, year, month, measurement, dim):
    """{flow_id: value} for a metric grouped by $flow (email events) or $attributed_flow (orders)."""
    out = {}
    for row in metric_aggregate(api_key, metric_id, year, month, measurement, by=[dim]):
        dims = row.get("dimensions") or []
        fid = dims[0] if dims else None
        vals = row.get("measurements", {}).get(measurement, [])
        if fid and vals:
            out[str(fid)] = out.get(str(fid), 0) + (vals[0] or 0)
    return out

def sync_flows(db, api_key, brand, brand_id, metrics):
    try:
        flows = list_flows(api_key)
    except Exception as e:
        print(f"    Warning: flow list failed — {e}")
        return
    # 0. Every flow, whatever its status, into klaviyo_flows — the Flows tab's
    #    go-live checklist reads drafts from here (klaviyo_flow_metrics only
    #    holds flows that actually sent something).
    try:
        frows = [{"brand_id": brand_id, "flow_id": f["id"], "name": (f["attributes"].get("name") or "")[:200], "status": f["attributes"].get("status"),
                  "trigger_type": f["attributes"].get("trigger_type"), "synced_at": datetime.utcnow().isoformat() + "Z"} for f in flows]
        if frows:
            db.table("klaviyo_flows").upsert(frows, on_conflict="brand_id,flow_id").execute()
            # drop flows deleted in Klaviyo since last sync
            db.table("klaviyo_flows").delete().eq("brand_id", brand_id).not_.in_("flow_id", [f["id"] for f in flows]).execute()
    except Exception as e:
        print(f"    Warning: klaviyo_flows upsert failed (run add_reviews_email_upgrade.sql?) — {e}")
    # 1. Coverage grid: best-status flow per grid key (live beats paused beats planned)
    rank = {"live": 3, "paused": 2, "planned": 1}
    found = {}
    for f in flows:
        name = f["attributes"].get("name") or ""
        st = GRID_STATUS.get(f["attributes"].get("status"), "planned")
        for key, rx in FLOW_KEY_RULES:
            if re.search(rx, name, re.I):
                if key not in found or rank[st] > rank[found[key][0]]:
                    found[key] = (st, name, f["id"])
                break
    rows = []
    for key, _ in FLOW_KEY_RULES:
        st, name, fid = found.get(key, ("not_built", "", ""))
        rows.append({"brand_id": brand_id, "flow_key": key, "status": st, "klaviyo_url": f"https://www.klaviyo.com/flow/{fid}/edit" if fid else None,
                     "note": name or None, "updated_by": "klaviyo-sync", "updated_at": datetime.utcnow().isoformat() + "Z"})
    try:
        db.table("lifecycle_flows").upsert(rows, on_conflict="brand_id,flow_key").execute()
        live = sum(1 for r in rows if r["status"] == "live")
        print(f"    Flows: {len(flows)} in Klaviyo, {live}/{len(rows)} grid flows live")
    except Exception as e:
        print(f"    Warning: lifecycle_flows upsert failed — {e}")
    # 2. Per-flow performance, current + previous month
    received_id, opened_id, clicked_id, revenue_id = metrics.get("Received Email"), metrics.get("Opened Email"), metrics.get("Clicked Email"), metrics.get("Placed Order")
    today = date.today()
    months = [(today.year, today.month)]
    prev = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    months.append(prev)
    by_id = {f["id"]: f["attributes"] for f in flows}
    for (y, m) in months:
        mk = f"{y:04d}-{m:02d}"
        rec = agg_by_flow(api_key, received_id, y, m, "unique", "$flow") if received_id else {}
        opn = agg_by_flow(api_key, opened_id, y, m, "unique", "$flow") if opened_id else {}
        clk = agg_by_flow(api_key, clicked_id, y, m, "unique", "$flow") if clicked_id else {}
        orders = agg_by_flow(api_key, revenue_id, y, m, "unique", "$attributed_flow") if revenue_id else {}
        rev = agg_by_flow(api_key, revenue_id, y, m, "sum_value", "$attributed_flow") if revenue_id else {}
        mrows = []
        for fid, att in by_id.items():
            if not (rec.get(fid) or rev.get(fid)):
                continue
            mrows.append({"brand_id": brand_id, "flow_id": fid, "month_key": mk, "flow_name": (att.get("name") or "")[:200], "status": att.get("status"),
                          "trigger_type": att.get("trigger_type"), "recipients": int(rec.get(fid, 0)), "opens": int(opn.get(fid, 0)), "clicks": int(clk.get(fid, 0)),
                          "orders": int(orders.get(fid, 0)), "revenue": round(float(rev.get(fid, 0)), 2), "synced_at": datetime.utcnow().isoformat() + "Z"})
        if mrows:
            try:
                db.table("klaviyo_flow_metrics").upsert(mrows, on_conflict="brand_id,flow_id,month_key").execute()
                print(f"    Flow performance {mk}: {len(mrows)} flows, ${sum(r['revenue'] for r in mrows):,.0f} attributed")
            except Exception as e:
                print(f"    Warning: klaviyo_flow_metrics upsert failed (run add_klaviyo_flow_metrics_and_campaigns.sql?) — {e}")
        time.sleep(0.3)

def sync_list_growth(db, api_key, brand_id, metrics):
    """Weekly 'Subscribed to List' / 'Unsubscribed from List' counts per list for
    the last 12 weeks — which lists (checklist gate, popup, giveaway, checkout…)
    are actually growing the database. One row per brand/week/list."""
    sub_id, unsub_id = metrics.get("Subscribed to List"), metrics.get("Unsubscribed from List")
    if not sub_id:
        return
    start = (date.today() - timedelta(days=date.today().weekday() + 7 * 11))  # Monday, 12 weeks back
    def weekly(metric_id):
        out = {}
        if not metric_id:
            return out
        payload = {"data": {"type": "metric-aggregate", "attributes": {
            "metric_id": metric_id, "measurements": ["count"], "interval": "week", "by": ["List"], "timezone": "Australia/Melbourne",
            "filter": [f"greater-or-equal(datetime,{start.isoformat()}T00:00:00+10:00)", f"less-than(datetime,{(date.today() + timedelta(days=1)).isoformat()}T00:00:00+10:00)"]}}}
        try:
            d = klaviyo_post(api_key, "metric-aggregates/", payload).get("data", {}).get("attributes", {})
        except Exception as e:
            print(f"    Warning: list growth aggregate failed — {e}"); return out
        dates = [x[:10] for x in d.get("dates", [])]
        for row in d.get("data", []) or []:
            lst = (row.get("dimensions") or [""])[0] or "(no list)"
            for wk, v in zip(dates, row.get("measurements", {}).get("count", [])):
                if v:
                    out[(wk, lst)] = out.get((wk, lst), 0) + int(v)
        return out
    subs, unsubs = weekly(sub_id), weekly(unsub_id)
    keys = set(subs) | set(unsubs)
    rows = [{"brand_id": brand_id, "week_start": wk, "list_name": lst[:200], "subscribes": subs.get((wk, lst), 0), "unsubscribes": unsubs.get((wk, lst), 0),
             "synced_at": datetime.utcnow().isoformat() + "Z"} for (wk, lst) in keys]
    if rows:
        try:
            db.table("klaviyo_list_growth").upsert(rows, on_conflict="brand_id,week_start,list_name").execute()
            print(f"    List growth: {sum(r['subscribes'] for r in rows):,} subscribes across {len({r['list_name'] for r in rows})} lists, 12 weeks")
        except Exception as e:
            print(f"    Warning: klaviyo_list_growth upsert failed (run add_reviews_email_upgrade.sql?) — {e}")

def sync_campaign_calendar(db, api_key, brand_id):
    """Every email campaign scheduled in the last 30 or next 90 days, with status,
    send time, subject and audience names — the portfolio send calendar."""
    since = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        names = {}
        for kind in ("lists", "segments"):
            data = klaviyo_get(api_key, f"{kind}/", {f"fields[{kind[:-1]}]": "name"})
            while True:
                for x in data.get("data", []):
                    names[x["id"]] = x["attributes"].get("name")
                nxt = (data.get("links") or {}).get("next")
                if not nxt:
                    break
                r = requests.get(nxt, headers={"Authorization": f"Klaviyo-API-Key {api_key}", "revision": "2024-10-15", "Accept": "application/json"}, timeout=20); r.raise_for_status(); data = r.json()
        data = klaviyo_get(api_key, "campaigns/", {
            "filter": f"and(equals(messages.channel,'email'),greater-than(scheduled_at,{since}))",
            "fields[campaign]": "name,status,send_time,scheduled_at,audiences",
            "include": "campaign-messages", "fields[campaign-message]": "definition",
        })
    except Exception as e:
        print(f"    Warning: campaign calendar failed — {e}")
        return
    subjects = {}
    for inc in data.get("included", []) or []:
        if inc.get("type") == "campaign-message":
            content = ((inc.get("attributes") or {}).get("definition") or {}).get("content") or {}
            subjects[inc["id"]] = content.get("subject")
    rows = []
    for c in data.get("data", []):
        att = c.get("attributes", {})
        msg_ids = [m["id"] for m in ((c.get("relationships") or {}).get("campaign-messages") or {}).get("data", [])]
        subject = next((subjects[m] for m in msg_ids if subjects.get(m)), None)
        aud = att.get("audiences") or {}
        inc_names = [names.get(i, i) for i in (aud.get("included") or [])]
        rows.append({"brand_id": brand_id, "campaign_id": c["id"], "name": (att.get("name") or "Campaign")[:200],
                     "status": att.get("status"), "send_time": att.get("send_time") or att.get("scheduled_at"),
                     "subject": (subject or "")[:300] or None, "audiences": ", ".join(inc_names)[:500] or None,
                     "synced_at": datetime.utcnow().isoformat() + "Z"})
    if rows:
        try:
            db.table("klaviyo_campaigns").upsert(rows, on_conflict="brand_id,campaign_id").execute()
            sched = sum(1 for r in rows if (r["status"] or "").lower() == "scheduled")
            print(f"    Calendar: {len(rows)} campaigns (last 30d + upcoming), {sched} scheduled")
        except Exception as e:
            print(f"    Warning: campaign calendar upsert failed (run add_klaviyo_flow_metrics_and_campaigns.sql?) — {e}")

def sync_campaigns(db, api_key, brand, brand_id, revenue_id):
    """Recent email campaigns (last 21 days) with per-campaign results."""
    since = (datetime.utcnow() - timedelta(days=21)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        data = klaviyo_get(api_key, "campaigns/", {
            "filter": f"and(equals(messages.channel,'email'),greater-than(scheduled_at,{since}))",
            "fields[campaign]": "name,status,send_time",
        })
    except Exception as e:
        print(f"    Warning: campaign list failed — {e}")
        return
    camps = [c for c in data.get("data", []) if (c.get("attributes", {}).get("status") or "").lower() in ("sent", "sending")]
    camps = camps[:10]  # cap per brand — the reports API is slow + rate-limited
    for c in camps:
        cid = c["id"]
        att = c.get("attributes", {})
        stats = {}
        if revenue_id:
            try:
                rep = klaviyo_post(api_key, "campaign-values-reports/", {
                    "data": {"type": "campaign-values-report", "attributes": {
                        "timeframe": {"key": "last_30_days"},
                        "statistics": ["recipients", "open_rate", "click_rate", "conversion_value"],
                        "conversion_metric_id": revenue_id,
                        "filter": f'equals(campaign_id,"{cid}")',
                    }}})
                results = rep.get("data", {}).get("attributes", {}).get("results", [])
                if results:
                    stats = results[0].get("statistics", {})
            except Exception as e:
                print(f"    Warning: stats for '{att.get('name')}' failed — {e}")
        row = {
            "brand_id": brand_id, "campaign_id": cid,
            "name": (att.get("name") or "Campaign")[:200],
            "sent_at": att.get("send_time"),
            "recipients": int(stats.get("recipients") or 0),
            "open_rate": round(float(stats.get("open_rate") or 0) * 100, 2),
            "click_rate": round(float(stats.get("click_rate") or 0) * 100, 2),
            "revenue": round(float(stats.get("conversion_value") or 0), 2),
        }
        try:
            db.table("klaviyo_campaigns").upsert(row, on_conflict="brand_id,campaign_id").execute()
            print(f"    📤 {row['name'][:50]}: {row['recipients']:,} recipients · {row['open_rate']:.0f}% open · ${row['revenue']:,.0f}")
        except Exception as e:
            print(f"    Warning: campaign upsert failed (run add_klaviyo_campaigns.sql?) — {e}")
        time.sleep(0.3)

def main():
    config = load_config()

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    brands = config.get("brands", [])
    for i, brand in enumerate(brands):
        # Per-brand key takes priority; fall back to global key if set
        api_key = brand.get("klaviyoApiKey") or config.get("klaviyoApiKey")
        if not api_key:
            print(f"  ↷ {brand.get('name')}: missing klaviyoApiKey, skipping")
            continue
        try:
            sync_brand(db, api_key, brand, i)
        except Exception as e:
            print(f"  ERROR {brand.get('name')}: {e}")

    print("\nDone.")

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Klaviyo", True)
    except Exception as e:
        record("Klaviyo", False, str(e)); raise
