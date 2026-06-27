#!/usr/bin/env python3
"""
Eventbrite events sync — pulls your organisation's events plus ticket/attendee data
into Supabase for the Events tab.

Setup:
  1. Table — run supabase/add_eventbrite_events.sql once.
  2. Get a private token: Eventbrite → Account Settings → Developer → API Keys →
     "Your private token". Add it in stores.config.json at the top level:
       "eventbriteToken": "XXXXXXXXXXXXXXXX"
     (optional) pin an org: "eventbriteOrgId": "1234567890"
  3. python3 scripts/sync_eventbrite.py

Tickets sold and gross revenue are summed from each event's ticket classes
(quantity_sold and cost). Free tickets count toward tickets sold at $0.
"""

import os, sys, json, ssl, urllib.request, urllib.parse

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
API         = "https://www.eventbriteapi.com/v3"
CTX         = ssl.create_default_context()

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

def sb(method, path, data=None, extra=None):
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}"); r.add_header("apikey", ANON or KEY)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (extra or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=40) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def eb_get(path, token, params=None):
    url = f"{API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    with urllib.request.urlopen(r, context=CTX, timeout=30) as resp:
        return json.loads(resp.read().decode())

def get_org_ids(token, pinned):
    if pinned:
        return [pinned]
    data = eb_get("users/me/organizations/", token)
    return [o["id"] for o in data.get("organizations", [])]

def brand_for(name, brands):
    low = (name or "").lower()
    for i, b in enumerate(brands):
        bn = (b.get("name") or "").lower()
        if bn and bn in low:
            return i
    return None

MAX_PAGES = 4  # safety bound; live/upcoming events are few, so this is rarely hit

def list_events(org_id, token):
    """Upcoming / on-sale events for the org (status=live, soonest first), expanded with
    venue + ticket classes. We deliberately skip the (potentially huge) past-event history
    so the sync stays fast — the dashboard cares about upcoming events."""
    out, cont, pages = [], None, 0
    while pages < MAX_PAGES:
        params = {"expand": "venue,ticket_classes", "status": "live", "order_by": "start_asc", "page_size": 50}
        if cont:
            params["continuation"] = cont
        data = eb_get(f"organizations/{org_id}/events/", token, params)
        out.extend(data.get("events", []))
        pg = data.get("pagination") or {}
        cont = pg.get("continuation")
        pages += 1
        if not pg.get("has_more_items") or not cont:
            break
    return out

def summarise(ev):
    sold, gross = 0, 0.0
    for tc in (ev.get("ticket_classes") or []):
        q = int(tc.get("quantity_sold") or 0)
        sold += q
        cost = (tc.get("cost") or {}).get("value")  # minor units (cents)
        if cost:
            gross += q * (cost / 100.0)
    cap = ev.get("capacity")
    if not cap:
        cap = sum(int(tc.get("quantity_total") or 0) for tc in (ev.get("ticket_classes") or [])) or None
    venue = ((ev.get("venue") or {}).get("name")) or (((ev.get("venue") or {}).get("address") or {}).get("city")) or ""
    return sold, round(gross, 2), cap, venue

def main():
    if not URL or not KEY:
        print("Missing Supabase env"); sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    token = config.get("eventbriteToken") or os.environ.get("EVENTBRITE_TOKEN")
    if not token:
        print("No eventbriteToken in stores.config.json (or EVENTBRITE_TOKEN env) — skipping"); return
    brands = config.get("brands", [])

    org_ids = get_org_ids(token, config.get("eventbriteOrgId"))
    if not org_ids:
        print("Could not resolve an Eventbrite organisation for this token"); return
    print(f"Organisations: {org_ids}")

    events = []
    for oid in org_ids:
        evs = list_events(oid, token)
        print(f"  org {oid}: {len(evs)} events")
        events.extend(evs)
    rows = []
    for ev in events:
        sold, gross, cap, venue = summarise(ev)
        rows.append({
            "event_id": ev["id"],
            "name": (ev.get("name") or {}).get("text") or "",
            "start_at": (ev.get("start") or {}).get("utc"),
            "end_at": (ev.get("end") or {}).get("utc"),
            "venue": venue, "status": ev.get("status"), "url": ev.get("url"),
            "capacity": cap, "tickets_sold": sold, "gross_revenue": gross,
            "currency": ev.get("currency"), "brand_id": brand_for((ev.get("name") or {}).get("text"), brands),
        })
    if rows:
        st, b = sb("POST", "/rest/v1/eventbrite_events?on_conflict=event_id",
                   json.dumps(rows).encode(), extra={"Prefer": "resolution=merge-duplicates"})
        if st not in (200, 201, 204):
            print(f"Upsert failed ({st}): {b.decode()[:200]}"); return
    print(f"Synced {len(rows)} events.")

if __name__ == "__main__":
    main()
