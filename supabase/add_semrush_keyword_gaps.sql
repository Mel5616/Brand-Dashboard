-- Keyword gap: terms a top competitor ranks for that this brand doesn't rank
-- for at all (AU). Computed by scripts/sync_semrush.py — see the "Keyword
-- gap" section of that script for how it's built. Run once in Supabase.
create table if not exists semrush_keyword_gaps (
  brand_id            int not null,
  month_key           text not null,
  phrase              text not null,
  search_volume       int default 0,
  cpc                 numeric default 0,
  competitor_count    int default 0,   -- how many of the tracked competitors rank for it
  best_competitor     text,            -- the strongest-ranking competitor for this phrase
  best_position       int,
  best_url            text,            -- their ranking page, for a quick look at what they built
  captured_at         timestamptz default now(),
  primary key (brand_id, month_key, phrase)
);
alter table semrush_keyword_gaps disable row level security;
create index if not exists semrush_keyword_gaps_vol_idx on semrush_keyword_gaps (brand_id, month_key, search_volume desc);
