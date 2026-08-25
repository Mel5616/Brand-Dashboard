#!/usr/bin/env python3
"""
YouTube Organic Sync — subscriber/view snapshots + a top-videos gallery for
every brand with a youtubeChannelId configured. Uses the public YouTube Data
API v3 only (an API key — no OAuth, no per-channel authorisation), since
subscriber count, view count and video-level stats are all public data.

Setup (one-time):
  1. In Google Cloud Console (console.cloud.google.com), enable "YouTube Data
     API v3" on a project, then Credentials → Create Credentials → API key.
  2. In stores.config.json add at the top level:
       "youtubeApiKey": "YOUR_API_KEY"
  3. In stores.config.json add to each brand with a YouTube channel:
       "youtubeChannelId": "UCxxxxxxxxxxxxxxxxxxxxxx"
     (find it via the channel's "About" page → Share → Copy channel ID, or
     the channel URL if it's already in /channel/UC... form.)

Run: python3 scripts/sync_youtube.py
"""

import json, ssl, urllib.request, urllib.parse, urllib.error, os
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("Australia/Melbourne")
except Exception:
    _TZ = None

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')
API         = "https://www.googleapis.com/youtube/v3"
TOP_N       = 12

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

SUPABASE_URL      = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_SVC_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
SUPABASE_ANON_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

def sb_upsert(table, rows, on_conflict=None):
    if not rows or not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    if on_conflict:
        url += f'?on_conflict={on_conflict}'
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {SUPABASE_SVC_KEY}')
    req.add_header('apikey', SUPABASE_ANON_KEY)
    req.add_header('Prefer', 'resolution=merge-duplicates')
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  ✗ Supabase {table}: {e.code} {e.read().decode()[:300]}')

def sb_delete_where(table, col, val):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?{col}=eq.{val}", method="DELETE")
    req.add_header("Authorization", f"Bearer {SUPABASE_SVC_KEY}")
    req.add_header("apikey", SUPABASE_ANON_KEY)
    try:
        urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30)
    except urllib.error.HTTPError:
        pass

def _get(path, params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
        return json.loads(r.read().decode())

def fetch_channel(channel_id, api_key):
    data = _get("channels", {"part": "snippet,statistics,contentDetails", "id": channel_id, "key": api_key})
    items = data.get("items", [])
    if not items:
        raise ValueError(f"No channel found for id {channel_id}")
    c = items[0]
    stats = c.get("statistics", {})
    return {
        "title": c.get("snippet", {}).get("title"),
        "subscribers": int(stats.get("subscriberCount", 0) or 0),
        "total_views": int(stats.get("viewCount", 0) or 0),
        "video_count": int(stats.get("videoCount", 0) or 0),
        "uploads_playlist": c.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads"),
    }

def fetch_top_videos(uploads_playlist_id, api_key, top_n=TOP_N):
    if not uploads_playlist_id:
        return []
    video_ids = []
    page_token = None
    for _ in range(4):  # up to 200 recent uploads — plenty to rank by views
        params = {"part": "contentDetails", "playlistId": uploads_playlist_id, "maxResults": 50, "key": api_key}
        if page_token:
            params["pageToken"] = page_token
        data = _get("playlistItems", params)
        video_ids += [i["contentDetails"]["videoId"] for i in data.get("items", []) if i.get("contentDetails", {}).get("videoId")]
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    videos = []
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        data = _get("videos", {"part": "snippet,statistics", "id": ",".join(batch), "key": api_key})
        for v in data.get("items", []):
            snip, stats = v.get("snippet", {}), v.get("statistics", {})
            thumbs = snip.get("thumbnails", {})
            thumb = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
            videos.append({
                "video_id": v["id"], "title": (snip.get("title") or "")[:300],
                "thumbnail_url": thumb, "published_at": snip.get("publishedAt"),
                "view_count": int(stats.get("viewCount", 0) or 0),
                "like_count": int(stats.get("likeCount", 0) or 0),
                "comment_count": int(stats.get("commentCount", 0) or 0),
            })
    videos.sort(key=lambda v: v["view_count"], reverse=True)
    return videos[:top_n]

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    api_key = config.get("youtubeApiKey")
    if not api_key:
        print("No youtubeApiKey in stores.config.json — skipping YouTube sync.")
        return
    brands = [b for b in config.get("brands", []) if b.get("youtubeChannelId")]
    if not brands:
        print("No brand has a youtubeChannelId configured — skipping YouTube sync.")
        return

    now = datetime.now(_TZ) if _TZ else datetime.now()
    month_key = now.strftime("%Y-%m")
    synced, errors = 0, []
    for brand in brands:
        name, bid, channel_id = brand["name"], brand["id"], brand["youtubeChannelId"]
        print(f"  ⟳  YouTube: {name} ({channel_id})")
        try:
            ch = fetch_channel(channel_id, api_key)
            sb_upsert("youtube_organic", [{
                "brand_id": bid, "month_key": month_key, "subscribers": ch["subscribers"],
                "total_views": ch["total_views"], "video_count": ch["video_count"],
                "channel_title": ch["title"], "synced_at": now.isoformat(),
            }], on_conflict="brand_id,month_key")

            videos = fetch_top_videos(ch["uploads_playlist"], api_key)
            if videos:
                sb_delete_where("youtube_videos", "brand_id", bid)
                sb_upsert("youtube_videos", [{"brand_id": bid, **v} for v in videos])
            print(f"       {ch['subscribers']:,} subscribers, {ch['total_views']:,} views, {len(videos)} top videos synced")
            synced += 1
        except Exception as e:
            body = ""
            try:
                if hasattr(e, "read"):
                    body = e.read().decode()[:300]
            except Exception:
                pass
            print(f"       ✗ {name}: {e} {body}")
            errors.append(f"{name}: {e}")
    print(f"  YouTube: {synced} brand(s) synced")
    try:
        from sync_status_util import record
        record('YouTube', not errors, '; '.join(errors))
    except Exception:
        pass

if __name__ == "__main__":
    main()
