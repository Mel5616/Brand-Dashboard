-- D2C promo plan: one row per brand + product + promo window (deduped across
-- retailers) so the team can mirror each retailer promo on the D2C store with the
-- same dates. Status is set in the dashboard and preserved across syncs. FY26+ only.
-- Run once in Supabase.

create table if not exists d2c_promos (
  id bigint generated always as identity primary key,
  brand text not null,
  brand_id int,
  sku text,
  product text,
  period_start date not null,
  period_end date not null,
  tier int,
  rrp numeric,
  promo_price numeric,
  discount_rrp numeric,
  retailers text,                       -- which retailers run it (context)
  status text not null default 'todo',  -- todo | planned | live | done | skip
  note text,
  source text not null default 'sheet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, sku, period_start, period_end)
);
create index if not exists d2c_promos_start_idx on d2c_promos (period_start);
create index if not exists d2c_promos_brand_idx on d2c_promos (brand, period_start);
create index if not exists d2c_promos_status_idx on d2c_promos (status);
