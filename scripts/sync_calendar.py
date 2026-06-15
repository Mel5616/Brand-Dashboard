#!/usr/bin/env python3
"""
Sync marketing campaign events from a public Apple Calendar (iCal feed) → Supabase.

Setup:
  1. In Apple Calendar, right-click your marketing calendar → Share Calendar
     → tick "Public Calendar" → copy the webcal:// URL.

  2. In stores.config.json, add at the top level:
       "marketingCalendarUrl": "webcal://p123-caldav.icloud.com/published/2/XXXXXXXX"
     (the script auto-converts webcal:// to https://)

  3. Run SQL in Supabase (first time only):
       CREATE TABLE IF NOT EXISTS calendar_events (
         uid         TEXT PRIMARY KEY,
         title       TEXT NOT NULL,
         description TEXT DEFAULT '',
         location    TEXT DEFAULT '',
         start_date  DATE NOT NULL,
         end_date    DATE,
         all_day     BOOLEAN DEFAULT TRUE,
         brand_id    INT,
         updated_at  TIMESTAMPTZ DEFAULT now()
       );
       ALTER TABLE calendar_events DISABLE ROW LEVEL SECURITY;

  4. python3 scripts/sync_calendar.py

Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import sys, os, json, re, ssl, urllib.request
from datetime import datetime, date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env.local"))
    load_dotenv()
except ImportError:
    pass

CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

# Map brand-name keywords (lowercase) → brand_id. Longest match wins.
BRAND_MAP = {
    "matchstick monkey": 10,
    "gaia baby":         3,
    "uppababy":          5,
    "wonderfold":        4,
    "coolkidz":          9,
    "miamily":           7,
    "mamave":            11,
    "smartrike":         12,
    "nanit":             0,
    "magic":             1,
    "hannie":            2,
    "frida":             8,
    "zazu":              6,
}


def fetch_ics(url):
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def unfold(raw):
    """RFC 5545 line unfolding: continuation lines start with space or tab."""
    out = []
    for line in raw.splitlines():
        if line[:1] in (" ", "\t") and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


def unescape(val):
    return (val.replace("\\n", "\n").replace("\\,", ",")
               .replace("\\;", ";").replace("\\\\", "\\")).strip()


def parse_dt(value):
    """Return (date_obj, all_day_bool). Handles DATE and DATE-TIME forms."""
    v = value.strip()
    # All-day: YYYYMMDD
    if re.fullmatch(r"\d{8}", v):
        return date(int(v[0:4]), int(v[4:6]), int(v[6:8])), True
    # Date-time: YYYYMMDDTHHMMSS(Z)
    m = re.match(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})", v)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return date(y, mo, d), False
    return None, True


def match_brand(text):
    low = text.lower()
    # longest keyword first so "gaia baby" wins over a stray "baby"
    for kw in sorted(BRAND_MAP, key=len, reverse=True):
        if kw in low:
            return BRAND_MAP[kw]
    return None


def parse_events(lines):
    events = []
    cur = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            cur = {}
            continue
        if line == "END:VEVENT":
            if cur is not None:
                events.append(cur)
            cur = None
            continue
        if cur is None or ":" not in line:
            continue

        name_part, _, value = line.partition(":")
        key = name_part.split(";")[0].upper()

        if key == "UID":
            cur["uid"] = value.strip()
        elif key == "SUMMARY":
            cur["title"] = unescape(value)
        elif key == "DESCRIPTION":
            cur["description"] = unescape(value)
        elif key == "LOCATION":
            cur["location"] = unescape(value)
        elif key == "DTSTART":
            d, all_day = parse_dt(value)
            cur["start_date"], cur["all_day"] = d, all_day
        elif key == "DTEND":
            d, _ = parse_dt(value)
            cur["end_date"] = d
    return events


def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    url = config.get("marketingCalendarUrl")
    if not url:
        print("No marketingCalendarUrl in stores.config.json.")
        print("In Apple Calendar: right-click calendar → Share → Public Calendar,")
        print("copy the webcal:// URL, then add:")
        print('  "marketingCalendarUrl": "webcal://..."')
        sys.exit(1)

    sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db = create_client(sb_url, sb_key)

    print(f"Fetching calendar feed...")
    raw = fetch_ics(url)
    events = parse_events(unfold(raw))
    print(f"  Found {len(events)} events")

    upserted = skipped = 0
    for ev in events:
        if not ev.get("uid") or not ev.get("title") or not ev.get("start_date"):
            skipped += 1
            continue

        brand_id = match_brand(ev["title"] + " " + ev.get("description", ""))

        db.table("calendar_events").upsert({
            "uid":         ev["uid"],
            "title":       ev["title"],
            "description": ev.get("description", ""),
            "location":    ev.get("location", ""),
            "start_date":  ev["start_date"].isoformat(),
            "end_date":    ev["end_date"].isoformat() if ev.get("end_date") else None,
            "all_day":     ev.get("all_day", True),
            "brand_id":    brand_id,
            "updated_at":  datetime.utcnow().isoformat(),
        }, on_conflict="uid").execute()

        tag = f"[brand {brand_id}]" if brand_id is not None else "[all]"
        print(f"  ✓ {ev['start_date']}  {ev['title'][:50]}  {tag}")
        upserted += 1

    print(f"\nDone — {upserted} events synced, {skipped} skipped.")


if __name__ == "__main__":
    main()
