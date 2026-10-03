-- Per-code redemption performance, rolled up per month from real Shopify
-- orders (sync_code_performance.py). Revenue and discount are ex-GST.
-- est_cost / qty_costed come from the cost sheet by SKU-prefix match, so they
-- are ESTIMATES with a coverage figure, not exact COGS.
create table if not exists discount_code_performance (
  brand_id int not null,
  code text not null,
  month_key text not null,
  orders int not null default 0,
  net_revenue numeric not null default 0,
  discount_given numeric not null default 0,
  new_customers int not null default 0,
  est_cost numeric not null default 0,
  qty_total int not null default 0,
  qty_costed int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brand_id, code, month_key)
);
create index if not exists discount_code_performance_month_idx on discount_code_performance (month_key);
alter table discount_code_performance disable row level security;
