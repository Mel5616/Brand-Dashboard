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


def _norm(h) -> str:
    return " ".join(str(h or "").split()).lower()


def _field_for(norm_header: str):
    """Map one sheet's own header text to our canonical column name. Sheets
    drift from each other (e.g. SmarTrike inserts two extra 'FOB Proposed'
    columns, shifting everything after) — matching by header text, not
    position, is what keeps every brand's columns correctly aligned."""
    h = norm_header
    if h == "brand": return "brand"
    if h == "product name": return "product_name"
    if h == "style code": return "style_code"
    if h == "fob $us": return "fob_usd"
    if h == "fob cost $aud": return "fob_aud"
    if h == "freight inbound": return "freight_inbound"
    if h == "duty": return "duty"
    if "landed cost" in h: return "landed_cost_aud"
    if "retail aud" in h and "incl gst" in h: return "retail_incl_gst"
    if "retail aud" in h and ("exc gst" in h or "excl gst" in h): return "retail_excl_gst"
    if "wholesale aud" in h and "nz" not in h: return "wholesale_excl_gst"
    if "bunting aud" in h: return "bunting_excl_gst"
    if h.startswith("ck margin independents"): return "margin_independents_pct"
    if h.startswith("ck margin") and "nz" in h: return "nz_margin_ck_pct"
    if h.startswith("ck margin") and "bunting" in h: return "margin_bunting_pct"
    if h.startswith("retail margin"): return "retail_margin_pct"
    if "bunting margin" in h: return "bunting_margin_pct"
    if "coolkidz margin direct" in h: return "direct_margin_pct"
    if h.startswith("nz margin"): return "nz_margin_pct"
    if "nz wholesale aud" in h: return "nz_wholesale_excl_gst"
    return None


def parse_sheet(values: list[list], sheet_name: str | None = None):
    """Returns (meta, rows) for one brand worksheet's raw usedRange values."""
    header_idx = next((i for i, r in enumerate(values) if len(r) > 1 and str(r[0]).strip() == "Brand" and str(r[1]).strip() == "Product Name"), None)
    if header_idx is None:
        return None, []
    # Column index for each canonical field, read from THIS sheet's own header
    # row — never assumed to match any other sheet's layout.
    col_idx: dict[str, int] = {}
    for i, h in enumerate(values[header_idx]):
        field = _field_for(_norm(h))
        if field and field not in col_idx:
            col_idx[field] = i
    # SmarTrike's RRP is the shelf/GST-inclusive price, not the ex-GST figure
    # every other brand uses — swap which column feeds "retail_excl_gst" (the
    # one the UI shows as "RRP ex GST") so it displays SmarTrike's Incl GST
    # column instead. Only SmarTrike; every other brand keeps ex-GST as RRP.
    if sheet_name == "SmarTrike" and "retail_incl_gst" in col_idx and "retail_excl_gst" in col_idx:
        col_idx["retail_incl_gst"], col_idx["retail_excl_gst"] = col_idx["retail_excl_gst"], col_idx["retail_incl_gst"]
    fob_usd_i, fob_aud_i = col_idx.get("fob_usd"), col_idx.get("fob_aud")

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

    def get(r, field):
        i = col_idx.get(field)
        if i is None or i >= len(r):
            return None
        v = r[i]
        return (num(v) if field in NUMERIC_COLS else (str(v).strip() or None)) if v != "" else None

    rows = []
    category = None
    for r in values[header_idx + 1:]:
        name0 = str(r[0]).strip() if len(r) > 0 else ""
        name1 = str(r[1]).strip() if len(r) > 1 else ""
        if not name0 and not name1:
            continue
        # Australian-sourced brands (e.g. Mamave) have no FOB $US — priced
        # directly in AUD — so a real product row is either column having a value.
        fob_usd_v = num(r[fob_usd_i]) if fob_usd_i is not None and fob_usd_i < len(r) else None
        fob_aud_v = num(r[fob_aud_i]) if fob_aud_i is not None and fob_aud_i < len(r) else None
        if fob_usd_v is not None or fob_aud_v is not None:
            row = {"category": category, **{col: get(r, col) for col in COLS}}
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
    SKIP_SHEETS = {"New Testing Products", "Baby Bunting Cost Sheet", "4Moms"}  # 4Moms is an old, discontinued brand
    sheets = [w["name"] for w in ws.get("value", []) if w["name"] not in SKIP_SHEETS]
    print(f"{len(sheets)} worksheets: {', '.join(sheets)}\n")

    errors = []
    for name in sheets:
        enc = urllib.parse.quote(name)
        try:
            d = graph_get(token, f"/drives/{drive_id}/items/{item_id}/workbook/worksheets/{enc}/usedRange")
        except Exception as e:
            print(f"  ✗ {name}: {e}"); errors.append(f"{name}: {e}"); continue
        meta, rows = parse_sheet(d.get("values", []), name)
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
