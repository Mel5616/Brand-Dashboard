-- Auto-tracked influencer sales: Shopify orders matched by affiliate/discount code.
-- Synced by scripts/sync_influencer_sales.py — never edited by hand; manual
-- sales_value on influencer_entries stays untouched (this table sits beside it).
create table if not exists influencer_sales (
  brand_id   int  not null,
  code       text not null,
  month_key  text not null,
  orders     int  not null default 0,
  revenue    numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brand_id, code, month_key)
);
alter table influencer_sales disable row level security;

-- Exception alerts: daily threshold checks on the numbers (revenue drops,
-- spend spikes, ROAS collapse). Written by scripts/metric_alerts.py.
create table if not exists metric_alerts (
  id         bigint generated always as identity primary key,
  alert_key  text not null unique,   -- dedupe: kind|brand|window
  kind       text not null,          -- revenue_drop | spend_spike | roas_collapse
  severity   text not null default 'warn',
  brand_id   int,
  title      text not null,
  detail     text,
  value      numeric,
  created_at timestamptz not null default now()
);
alter table metric_alerts disable row level security;
