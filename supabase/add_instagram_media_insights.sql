-- Per-post Instagram insights: reach, saves, shares and reel plays.
-- Run once in the Supabase SQL editor, then run:
--   python3 scripts/sync_instagram_media.py
-- (the sync refreshes these every run, since reach/saves grow after posting).

alter table instagram_media add column if not exists reach  int default 0;
alter table instagram_media add column if not exists saved  int default 0;
alter table instagram_media add column if not exists shares int default 0;
alter table instagram_media add column if not exists plays  int default 0;
