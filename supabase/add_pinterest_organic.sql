-- Pinterest ORGANIC (non-paid) performance, synced from the v5 user_account
-- analytics endpoints on behalf of each brand's ad account.
-- pinterest_organic: monthly engagement rollup + latest profile snapshot.
-- pinterest_top_pins: the current top pins by impressions (trailing 30 days),
-- replaced wholesale on every sync.

create table if not exists pinterest_organic (
  brand_id int not null,
  month_key text not null,               -- "2026-07"
  impressions bigint not null default 0,
  engagement bigint not null default 0,
  pin_clicks bigint not null default 0,
  outbound_clicks bigint not null default 0,
  saves bigint not null default 0,
  followers int not null default 0,      -- profile snapshot (current month only)
  monthly_views bigint not null default 0,
  pin_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brand_id, month_key)
);
alter table pinterest_organic disable row level security;

create table if not exists pinterest_top_pins (
  brand_id int not null,
  pin_id text not null,
  rank int not null default 0,
  title text,
  link text,
  image_url text,
  impressions bigint not null default 0,
  engagement bigint not null default 0,
  pin_clicks bigint not null default 0,
  outbound_clicks bigint not null default 0,
  saves bigint not null default 0,
  period_start date,
  period_end date,
  updated_at timestamptz not null default now(),
  primary key (brand_id, pin_id)
);
alter table pinterest_top_pins disable row level security;
