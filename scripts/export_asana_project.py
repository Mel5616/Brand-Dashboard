"""One-off Asana project export (read-only). Fetches every task from a given
Asana project (name, notes, sections, custom fields) and stores the raw JSON
in the sales-hub Storage bucket at imports/asana-<gid>.json, where it can be
picked up for transformation (e.g. importing the prospect list into the
Retailer Hub Customers CRM). Runs on GitHub Actions where ASANA_TOKEN lives.

Usage: python scripts/export_asana_project.py <project_gid>
Env:   ASANA_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import json, os, sys, urllib.request

TOKEN = os.environ["ASANA_TOKEN"]
SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GID = sys.argv[1]

def asana(path, params=""):
    req = urllib.request.Request(
        f"https://app.asana.com/api/1.0/{path}{params}",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    return json.load(urllib.request.urlopen(req))

proj = asana(f"projects/{GID}")["data"]
tasks, offset = [], None
fields = "name,notes,completed,permalink_url,modified_at,memberships.section.name,memberships.project.gid,custom_fields.name,custom_fields.display_value"
for _ in range(40):  # 100/page
    params = f"?limit=100&opt_fields={fields}" + (f"&offset={offset}" if offset else "")
    page = asana(f"projects/{GID}/tasks", params)
    tasks.extend(page["data"])
    offset = (page.get("next_page") or {}).get("offset")
    if not offset:
        break

payload = json.dumps({"project": proj["name"], "gid": GID, "tasks": tasks}).encode()
req = urllib.request.Request(
    f"{SB_URL}/storage/v1/object/sales-hub/imports/asana-{GID}.json",
    data=payload, method="POST",
    headers={
        "Authorization": f"Bearer {SB_KEY}", "apikey": SB_KEY,
        "Content-Type": "application/json", "x-upsert": "true",
    },
)
urllib.request.urlopen(req)
print(f"Exported {len(tasks)} tasks from '{proj['name']}' -> sales-hub/imports/asana-{GID}.json")
