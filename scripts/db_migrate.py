#!/usr/bin/env python3
"""Apply a SQL file to the brand-dashboard Supabase project without pasting it
into the SQL editor. Uses the Supabase Management API, so it needs a personal
access token (Supabase → Account → Access Tokens), saved once at
~/.config/brand-dashboard/supabase_access_token (mode 600). The project ref
comes from NEXT_PUBLIC_SUPABASE_URL in .env.local.

  python3 scripts/db_migrate.py supabase/add_today.sql [more.sql ...]
"""
import json, os, re, sys, urllib.request

TOKEN_PATH = os.path.expanduser("~/.config/brand-dashboard/supabase_access_token")
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def env(name):
    if os.environ.get(name):
        return os.environ[name]
    try:
        for line in open(os.path.join(BASE_DIR, ".env.local")):
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return None

def main():
    files = sys.argv[1:]
    if not files:
        sys.exit(__doc__)
    try:
        token = open(TOKEN_PATH).read().strip()
    except FileNotFoundError:
        sys.exit(f"No Supabase access token at {TOKEN_PATH}.\nCreate one at https://supabase.com/dashboard/account/tokens and save it there (chmod 600).")
    url = env("NEXT_PUBLIC_SUPABASE_URL") or ""
    m = re.match(r"https://([a-z0-9]+)\.supabase\.co", url)
    if not m:
        sys.exit("NEXT_PUBLIC_SUPABASE_URL missing or not a supabase.co URL")
    ref = m.group(1)
    for f in files:
        sql = open(f).read()
        req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query", data=json.dumps({"query": sql}).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
        try:
            urllib.request.urlopen(req, timeout=120).read()
            print(f"✓ {f}")
        except urllib.error.HTTPError as e:
            sys.exit(f"✗ {f}: HTTP {e.code} {e.read()[:400].decode()}")

if __name__ == "__main__":
    main()
