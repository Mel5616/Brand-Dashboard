-- Brand Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor for your new project.

-- Brands
create table if not exists brands (
  id          int primary key,
  name        text not null,
  color       text,
  init        text,
  domain      text,
  live        boolean default false,
  synced_at   timestamptz
);

-- Monthly revenue/orders per brand (FY 2025-26 + prior year)
create table if not exists brand_monthly (
  brand_id    int references brands(id) on delete cascade,
  month_key   text,   -- e.g. '2025-07'
  revenue     numeric default 0,
  orders      int     default 0,
  prev_revenue numeric default 0,
  primary key (brand_id, month_key)
);

-- Rolling 13-week data per brand
create table if not exists brand_weekly (
  brand_id    int references brands(id) on delete cascade,
  week_start  date,
  revenue     numeric default 0,
  orders      int     default 0,
  primary key (brand_id, week_start)
);

-- Top 5 products per brand
create table if not exists brand_products (
  brand_id    int references brands(id) on delete cascade,
  rank        int,
  title       text,
  gross_sales numeric,
  primary key (brand_id, rank)
);

-- Brand KPI summary (latest month snapshot)
create table if not exists brand_summary (
  brand_id          int primary key references brands(id) on delete cascade,
  last_month_label  text,        -- e.g. 'May 26'
  last_month_rev    numeric,
  mom_growth        numeric,
  yoy_growth        numeric,
  last_month_orders int,
  aov               numeric,
  fy_revenue        numeric,
  currency          text default 'AUD',
  synced_at         timestamptz
);

-- Tradeshows config
create table if not exists tradeshows (
  id          text primary key,
  name        text not null,
  date_start  date,
  date_end    date,
  state       text,
  location    text
);

-- Tradeshow brand IDs (which brands participate)
create table if not exists tradeshow_brands (
  tradeshow_id  text references tradeshows(id) on delete cascade,
  brand_id      int  references brands(id) on delete cascade,
  primary key (tradeshow_id, brand_id)
);

-- Tradeshow synced sales per brand
create table if not exists tradeshow_sales (
  tradeshow_id  text references tradeshows(id) on delete cascade,
  brand_id      int  references brands(id) on delete cascade,
  revenue       numeric default 0,
  orders        int     default 0,
  synced_at     timestamptz,
  primary key (tradeshow_id, brand_id)
);

-- Meta Ads monthly data
create table if not exists meta_ads (
  brand_id    int references brands(id) on delete cascade,
  month_key   text,
  spend       numeric default 0,
  impressions int     default 0,
  clicks      int     default 0,
  roas        numeric default 0,
  cpm         numeric default 0,
  cpc         numeric default 0,
  primary key (brand_id, month_key)
);

-- Sync run log
create table if not exists sync_log (
  id          bigserial primary key,
  started_at  timestamptz default now(),
  finished_at timestamptz,
  brands_ok   int,
  brands_err  int,
  triggered_by text default 'cron'
);

-- Week labels lookup (populated by sync)
create table if not exists week_labels (
  week_start  date primary key,
  label       text
);

-- Enable public read access (no auth required to view dashboard)
alter table brands         enable row level security;
alter table brand_monthly  enable row level security;
alter table brand_weekly   enable row level security;
alter table brand_products enable row level security;
alter table brand_summary  enable row level security;
alter table tradeshows     enable row level security;
alter table tradeshow_brands enable row level security;
alter table tradeshow_sales enable row level security;
alter table meta_ads       enable row level security;
alter table sync_log       enable row level security;
alter table week_labels    enable row level security;

-- Allow anon reads (dashboard is public/internal, not auth-gated)
create policy "public read brands"          on brands          for select using (true);
create policy "public read brand_monthly"   on brand_monthly   for select using (true);
create policy "public read brand_weekly"    on brand_weekly    for select using (true);
create policy "public read brand_products"  on brand_products  for select using (true);
create policy "public read brand_summary"   on brand_summary   for select using (true);
create policy "public read tradeshows"      on tradeshows      for select using (true);
create policy "public read tradeshow_brands" on tradeshow_brands for select using (true);
create policy "public read tradeshow_sales" on tradeshow_sales  for select using (true);
create policy "public read meta_ads"        on meta_ads        for select using (true);
create policy "public read sync_log"        on sync_log        for select using (true);
create policy "public read week_labels"     on week_labels     for select using (true);
