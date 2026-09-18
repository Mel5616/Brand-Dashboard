-- Recurring (year-less) promotion windows shown as background bands on the
-- Timeline — "Prams peak Aug-Nov" repeats every year, unlike a one-off
-- campaign or launch date.
create table if not exists product_seasonality (
  id bigint generated always as identity primary key,
  brand_id int not null,
  product text not null,
  start_month int not null check (start_month between 1 and 12),
  end_month int not null check (end_month between 1 and 12),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists product_seasonality_brand_idx on product_seasonality (brand_id);
alter table product_seasonality disable row level security;
