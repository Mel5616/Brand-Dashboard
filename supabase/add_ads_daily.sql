-- Day-level Google Ads and Meta Ads data, so the dashboard can show a custom
-- (daily) date range instead of only whole months. The monthly tables
-- (google_ads / meta_ads) are unchanged; these are populated in parallel by the
-- sync (Google: segments.date, Meta: time_increment=1).

create table if not exists google_ads_daily (
  brand_id    int     not null,
  date        date    not null,
  spend       numeric default 0,
  impressions bigint  default 0,
  clicks      bigint  default 0,
  revenue     numeric default 0,   -- Google reported conversion value
  primary key (brand_id, date)
);
alter table google_ads_daily disable row level security;

create table if not exists meta_ads_daily (
  brand_id    int     not null,
  date        date    not null,
  spend       numeric default 0,
  impressions bigint  default 0,
  clicks      bigint  default 0,
  purchases   numeric default 0,
  revenue     numeric default 0,
  reach       bigint  default 0,
  primary key (brand_id, date)
);
alter table meta_ads_daily disable row level security;

create index if not exists google_ads_daily_date_idx on google_ads_daily (date);
create index if not exists meta_ads_daily_date_idx   on meta_ads_daily (date);
