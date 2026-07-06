-- Pinterest Ads as a paid channel, mirroring google_ads / meta_ads.
-- Populated by scripts/sync_pinterest.py from the Pinterest Ads API (v5).
-- Config (in stores.config.json, same file as Meta):
--   top level:   "pinterestAccessToken": "<oauth access token>"
--   per brand:   "pinterestAdAccountId": "<ad account id>"

create table if not exists pinterest_ads (
  brand_id    int     not null,
  month_key   text    not null,     -- 'YYYY-MM'
  spend       numeric default 0,
  impressions bigint  default 0,
  clicks      bigint  default 0,
  purchases   numeric default 0,    -- total conversions
  revenue     numeric default 0,    -- checkout value
  roas        numeric default 0,
  primary key (brand_id, month_key)
);
alter table pinterest_ads disable row level security;

create table if not exists pinterest_ads_daily (
  brand_id    int     not null,
  date        date    not null,
  spend       numeric default 0,
  impressions bigint  default 0,
  clicks      bigint  default 0,
  purchases   numeric default 0,
  revenue     numeric default 0,
  primary key (brand_id, date)
);
alter table pinterest_ads_daily disable row level security;

create index if not exists pinterest_ads_daily_date_idx on pinterest_ads_daily (date);
