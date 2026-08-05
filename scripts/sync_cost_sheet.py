#!/usr/bin/env python3
"""Sync the live SharePoint cost sheet (one worksheet per brand) into
cost_sheet_items / cost_sheet_meta via Microsoft Graph. Wholesale-replaces
each brand's rows every run so removed/renamed products don't linger.
"""
from __future__ import annotations
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH = os.path.join(BASE_DIR, ".env.local")
CTX = ssl.create_default_context()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph_auth import get_token, graph_get, resolve_share  # noqa: E402

# Column order in every brand worksheet, starting at the "Brand" header row.
COLS = [
    "brand", "product_name", "style_code", "fob_usd", "fob_aud", "freight_inbound", "duty",
    "landed_cost_aud", "retail_incl_gst", "retail_excl_gst", "wholesale_excl_gst", "bunting_excl_gst",
    "margin_independents_pct", "margin_bunting_pct", "retail_margin_pct", "bunting_margin_pct",
    "direct_margin_pct", "nz_wholesale_excl_gst", "nz_margin_ck_pct", "nz_margin_pct",
]
NUMERIC_COLS = COLS[3:]  # everything after style_code


def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")


def sb(method, path, data=None, extra=None):
    req = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("apikey", ANON or KEY)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        return r.status, r.read()


def num(v):
    return v if isinstance(v, (int, float)) else None


def parse_sheet(values: list[list]):
    """Returns (meta, rows) for one brand worksheet's raw usedRange values."""
    header_idx = next((i for i, r in enumerate(values) if len(r) > 1 and str(r[0]).strip() == "Brand" and str(r[1]).strip() == "Product Name"), None)
    if header_idx is None:
        return None, []
    # Exchange rate / freight sit in the row right after the "EXCHANGE RATE" label.
    exch_idx = next((i for i, r in enumerate(values) if r and str(r[0]).strip().upper() == "EXCHANGE RATE"), None)
    exchange_rate = freight_rate = None
    if exch_idx is not None and exch_idx + 1 < len(values):
        rate_row = values[exch_idx + 1]
        exchange_rate = num(rate_row[0]) if len(rate_row) > 0 else None
        freight_rate = num(rate_row[1]) if len(rate_row) > 1 else None
    updated_label = None
    for r in values[:6]:
        if r and str(r[0]).strip().upper().startswith("UPDATED"):
            updated_label = str(r[0]).strip()
            break

    rows = []
    category = None
    for r in values[header_idx + 1:]:
        r = list(r) + [""] * (20 - len(r))  # pad
        name0, name1 = str(r[0]).strip(), str(r[1]).strip()
        if not name0 and not name1:
            continue
        fob = num(r[3])
        if fob is not None:
            row = {"category": category}
            for i, col in enumerate(COLS):
                v = r[i] if i < len(r) else None
                row[col] = (num(v) if col in NUMERIC_COLS else (str(v).strip() or None)) if v != "" else None
            rows.append(row)
        elif name1:
            category = name1
        # else: brand-name section marker row — ignore
    return {"exchange_rate": exchange_rate, "freight_rate": freight_rate, "updated_label": updated_label}, rows


def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    g = config.get("graph") or {}
    share_url = g.get("costSheetUrl")
    if not share_url:
        print("No graph.costSheetUrl configured — nothing to sync."); return
    token = get_token(config)
    if not token:
        print("✗ Could not get a Graph token (check graph.tenantId/clientId/clientSecret)"); sys.exit(1)

    item = resolve_share(token, share_url)
    if "id" not in item:
        print(f"✗ Could not resolve the cost sheet file: {item}"); sys.exit(1)
    drive_id, item_id = item["parentReference"]["driveId"], item["id"]
    print(f"Cost sheet: {item.get('name')} (last modified {item.get('lastModifiedDateTime')})")

    ws = graph_get(token, f"/drives/{drive_id}/items/{item_id}/workbook/worksheets")
    sheets = [w["name"] for w in ws.get("value", [])]
    print(f"{len(sheets)} worksheets: {', '.join(sheets)}\n")

    errors = []
    for name in sheets:
        enc = urllib.parse.quote(name)
        try:
            d = graph_get(token, f"/drives/{drive_id}/items/{item_id}/workbook/worksheets/{enc}/usedRange")
        except Exception as e:
            print(f"  ✗ {name}: {e}"); errors.append(f"{name}: {e}"); continue
        meta, rows = parse_sheet(d.get("values", []))
        if meta is None:
            print(f"  {name}: no cost-sheet header found, skipped")
            continue
        # Some rows have a blank brand cell (merged-cell display in the sheet) —
        # the worksheet name itself is the reliable brand identifier.
        brand = name
        for row in rows:
            row["brand"] = brand  # normalise (some rows repeat the sheet's own name variously)
        sb("DELETE", f"/rest/v1/cost_sheet_items?brand=eq.{urllib.parse.quote(brand)}")
        if rows:
            sb("POST", "/rest/v1/cost_sheet_items", json.dumps(rows).encode())
        sb("POST", "/rest/v1/cost_sheet_meta?on_conflict=brand", json.dumps([{
            "brand": brand, "exchange_rate": meta["exchange_rate"], "freight_rate": meta["freight_rate"],
            "updated_label": meta["updated_label"], "synced_at": datetime.now(timezone.utc).isoformat(),
        }]).encode(), {"Prefer": "resolution=merge-duplicates"})
        print(f"  {brand}: {len(rows)} products")

    from sync_status_util import record
    record("Cost sheet", not errors, "; ".join(errors)[:400])
    print("\nDone.")


if __name__ == "__main__":
    main()
