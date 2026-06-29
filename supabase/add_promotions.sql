-- Promotional calendar — sale periods per brand, sourced from the Monthly Promo
-- Tracker (SharePoint xlsx). Pricing is entered manually in the dashboard and is
-- preserved across syncs. Run once in the Supabase SQL editor.

create table if not exists promotions (
  id bigint generated always as identity primary key,
  brand_id int,
  brand text not null,
  period_start date not null,
  period_end date not null,
  channel text,                       -- retailer / where the sale runs (from the sheet)
  price text,                         -- manual, freeform e.g. "20% off" or "$199"
  note text,                          -- manual
  source text not null default 'sheet', -- sheet | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, period_start, channel)
);
create index if not exists promotions_brand_idx on promotions (brand, period_start);
create index if not exists promotions_start_idx on promotions (period_start);
