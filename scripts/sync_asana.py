#!/usr/bin/env python3
"""
Asana tasks sync (read-only) — pulls every task from ONE Asana project into
Supabase for the Tasks tab. Asana stays the source of truth; the dashboard only
reads.

Setup:
  1. Table — run supabase/add_asana_tasks.sql once.
  2. Personal access token: Asana → Settings → Apps → "Manage Developer Apps" →
     Personal access tokens → "Create new token". Add the GitHub secret
     ASANA_TOKEN (or put "asanaToken" in stores.config.json / ASANA_TOKEN in
     .env.local).
  3. Project id — open the project in Asana; the URL is
     https://app.asana.com/0/<PROJECT_GID>/list . Put it in stores.config.json:
       "asanaProjectId": "1234567890123456"
     (or ASANA_PROJECT_ID in the environment).
  4. python3 -u scripts/sync_asana.py
"""

import os, sys, json, ssl, urllib.request, urllib.parse, urllib.error

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
API         = "https://app.asana.com/api/1.0"
CTX         = ssl.create_default_context()
MAX_PAGES   = 20  # 100 tasks/page — plenty for a single project board

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

def asana_get(path, token, params=None):
    url = f"{API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    with urllib.request.urlopen(r, context=CTX, timeout=30) as resp:
        return json.loads(resp.read().decode())

def brand_for(name, brands):
    low = (name or "").lower()
    for i, b in enumerate(brands):
        bn = (b.get("name") or "").lower()
        if bn and bn in low:
            return i
    return None

OPT_FIELDS = ("name,notes,completed,completed_at,due_on,permalink_url,modified_at,"
              "assignee.name,memberships.section.name,memberships.project.gid,"
              "custom_fields.name,custom_fields.display_value,custom_fields.enum_value.name")

def custom_field(task, field_name):
    for cf in (task.get("custom_fields") or []):
        if (cf.get("name") or "").strip().lower() == field_name.lower():
            return ((cf.get("enum_value") or {}).get("name")) or cf.get("display_value") or None
    return None

def list_tasks(project_gid, token):
    tasks, offset, pages = [], None, 0
    while pages < MAX_PAGES:
        params = {"opt_fields": OPT_FIELDS, "limit": 100}
        if offset:
            params["offset"] = offset
        data = asana_get(f"projects/{project_gid}/tasks", token, params)
        batch = data.get("data", [])
        tasks.extend(batch)
        print(f"  page {pages + 1}: {len(batch)} tasks (total {len(tasks)})", flush=True)
        nxt = (data.get("next_page") or {}).get("offset")
        pages += 1
        if not nxt:
            break
        offset = nxt
    return tasks

def section_for(task, project_gid):
    for m in (task.get("memberships") or []):
        if ((m.get("project") or {}).get("gid")) == project_gid:
            return ((m.get("section") or {}).get("name")) or None
    # fall back to the first membership's section if the project didn't match
    for m in (task.get("memberships") or []):
        s = (m.get("section") or {}).get("name")
        if s:
            return s
    return None

# Named secrets map to a labelled tab in the dashboard. Add more here as needed.
NAMED_PROJECTS = [
    ("ASANA_PROJECT_ID",        "Blogs"),
    ("ASANA_DESIGN_PROJECT_ID", "Design Requirements"),
]

def resolve_projects(config):
    # Canonical form: ASANA_PROJECTS / config.asanaProjects = [{"gid":..,"label":..}, ...]
    raw = os.environ.get("ASANA_PROJECTS") or config.get("asanaProjects")
    out = []
    if raw:
        items = json.loads(raw) if isinstance(raw, str) else raw
        for it in items:
            if it.get("gid"):
                out.append((str(it["gid"]), it.get("label") or "Tasks"))
    # Fallback / additive: individually named secrets.
    seen = {g for g, _ in out}
    for env_key, label in NAMED_PROJECTS:
        gid = os.environ.get(env_key) or config.get(env_key)
        if gid and str(gid) not in seen:
            out.append((str(gid), label)); seen.add(str(gid))
    return out

def main():
    if not URL or not KEY:
        print("Missing Supabase env"); sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    token = config.get("asanaToken") or os.environ.get("ASANA_TOKEN")
    if not token:
        print("No asanaToken (or ASANA_TOKEN env) — skipping"); return
    brands = config.get("brands", [])
    projects = resolve_projects(config)
    if not projects:
        print("No Asana projects configured (ASANA_PROJECT_ID etc.) — skipping"); return

    all_rows = []
    for project, label in projects:
        try:
            tasks = list_tasks(project, token)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code in (401, 403):
                print(f"Asana rejected the token for {label} ({e.code}) — check access to project {project}.")
            else:
                print(f"Asana error {e.code} for {label}: {body[:200]}")
            continue
        for t in tasks:
            all_rows.append({
                "gid": t["gid"],
                "name": t.get("name") or "",
                "notes": (t.get("notes") or "")[:2000],
                "assignee": ((t.get("assignee") or {}).get("name")),
                "due_on": t.get("due_on"),
                "completed": bool(t.get("completed")),
                "completed_at": t.get("completed_at"),
                "section": section_for(t, project),
                "status": custom_field(t, "Status"),
                "priority": custom_field(t, "Priority"),
                "project_gid": project,
                "project_label": label,
                "permalink_url": t.get("permalink_url"),
                "modified_at": t.get("modified_at"),
                "brand_id": brand_for(t.get("name"), brands),
            })
        print(f"  {label}: {len(tasks)} tasks", flush=True)

    if not all_rows:
        print("No tasks found in any configured project"); return
    st, b = sb("POST", "/rest/v1/asana_tasks?on_conflict=gid",
               json.dumps(all_rows).encode(), extra={"Prefer": "resolution=merge-duplicates"})
    if st not in (200, 201, 204):
        print(f"Supabase upsert failed ({st}): {b.decode(errors='replace')[:300]}"); sys.exit(1)
    print(f"Synced {len(all_rows)} Asana tasks across {len(projects)} project(s)", flush=True)

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Asana", True)
    except Exception as e:
        record("Asana", False, str(e)); raise
