"""Push the Coolkidz 2026 theme files to the UNPUBLISHED draft theme only."""
import base64, json, os, sys, urllib.request
sys.path.insert(0, "/Users/melaniekingsford/brand-dashboard/scripts")
from shopify_auth import store_token

THEME = "gid://shopify/OnlineStoreTheme/189044785441"
D = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open("/Users/melaniekingsford/brand-dashboard/stores.config.json"))
store = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia")
tok = store_token(store)

def gql(q, v=None):
    req = urllib.request.Request(f"https://{store['domain']}/admin/api/2025-07/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                                 headers={"X-Shopify-Access-Token": tok, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=180))

# Safety: never write to the live theme.
role = gql('query($id:ID!){theme(id:$id){role name}}', {"id": THEME})["data"]["theme"]
assert role["role"] != "MAIN" or "--allow-live" in sys.argv, "This theme is LIVE (published 27 Sep 2026): pass --allow-live to push to it"
print("pushing to", role["name"], role["role"])

def files_in(sub, exts):
    p = os.path.join(D, sub)
    return sorted(os.path.join(sub, f) for f in os.listdir(p) if f.endswith(exts)) if os.path.isdir(p) else []

order = (files_in("assets", (".jpg", ".png")) + files_in("assets", (".css", ".js")) + files_in("snippets", (".liquid",)) +
         files_in("layout", (".liquid",)) + files_in("sections", (".liquid",)) + ["config/settings_schema.json"] +
         files_in("sections", (".json",)) + files_in("templates", (".json",)))
only = [a for a in sys.argv[1:] if a != "--allow-live"]
if only: order = [f for f in order if any(o in f for o in only)]

M = """mutation($id:ID!,$f:[OnlineStoreThemeFilesUpsertFileInput!]!){themeFilesUpsert(themeId:$id,files:$f){upsertedThemeFiles{filename} userErrors{filename message}}}"""
batch, size, errors = [], 0, []
def flush():
    global batch, size
    if not batch: return
    r = gql(M, {"id": THEME, "f": batch})
    if r.get("errors"): errors.append(str(r["errors"])[:300])
    else:
        errs = r["data"]["themeFilesUpsert"]["userErrors"]
        errors.extend(f"{e['filename']}: {e['message']}" for e in errs)
        print(" ", len(r["data"]["themeFilesUpsert"]["upsertedThemeFiles"] or []), "written")
    batch, size = [], 0
last_dir = None
for f in order:
    d = f.split("/")[0]
    if last_dir and d != last_dir: flush()   # keep dependency order between folders
    last_dir = d
    raw = open(os.path.join(D, f), "rb").read()
    if f.endswith((".jpg", ".png")):
        body = {"type": "BASE64", "value": base64.b64encode(raw).decode()}
    else:
        body = {"type": "TEXT", "value": raw.decode()}
    batch.append({"filename": f, "body": body}); size += len(raw)
    if len(batch) >= 10 or size > 2_500_000: flush()
flush()
print("errors:" if errors else "no errors", *errors, sep="\n  ")
