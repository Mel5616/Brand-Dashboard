"""Best-effort per-source sync status recorder → the sync_status table.

Each sync script calls record("<Source>", ok, message) at the end of its run so
the dashboard can show freshness and the alert step can email on failures. Never
raises — status recording must not break a sync.
"""
import os, json, ssl, urllib.request
from datetime import datetime, timezone


def record(source, ok, message=""):
    url  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    anon = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "") or key
    if not url or not key:
        return
    row = [{
        "source":  source,
        "ok":      bool(ok),
        "message": (str(message) or "")[:400],
        "ran_at":  datetime.now(timezone.utc).isoformat(),
    }]
    try:
        req = urllib.request.Request(
            f"{url}/rest/v1/sync_status?on_conflict=source",
            data=json.dumps(row).encode(), method="POST",
        )
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {key}")
        req.add_header("apikey", anon)
        req.add_header("Prefer", "resolution=merge-duplicates")
        urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=15)
    except Exception:
        pass
