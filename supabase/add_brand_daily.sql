-- Per-brand daily Shopify sales (rolling last 30 days), for the Shopify Brand Sales Day view.
create table if not exists brand_daily (
  brand_id  int  not null,
  day       date not null,
  revenue   numeric not null default 0,
  orders    int     not null default 0,
  primary key (brand_id, day)
);
create index if not exists brand_daily_day_idx on brand_daily (day);
