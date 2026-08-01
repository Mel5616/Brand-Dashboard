-- Customer LTV / repeat-purchase cohorts (from Shopify order history).
-- One row per brand per first-order month: how many new customers, how many
-- came back, and what the cohort spent in its first 90/365 days.
create table if not exists ltv_cohorts (
  brand_id int not null,
  cohort_month text not null,        -- "2025-07" = month of first order
  customers int not null default 0,
  repeat_customers int not null default 0,
  orders_total int not null default 0,
  revenue_first numeric not null default 0,
  revenue_90d numeric not null default 0,
  revenue_365d numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brand_id, cohort_month)
);
alter table ltv_cohorts disable row level security;
