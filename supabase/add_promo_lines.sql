-- Tiered promo pricing + products, from the Promo Details sheet. Marketing-facing
-- fields only (RRP / current / promo price / discount); wholesale cost, GM, SOA
-- and forecast columns are intentionally NOT imported. Run once in Supabase.

-- Tier on the calendar (1 = blue / deeper, 2 = green / lighter), read from shading.
alter table promotions add column if not exists tier int;

create table if not exists promo_lines (
  id bigint generated always as identity primary key,
  customer text,            -- retailer
  brand text,
  brand_id int,
  sku text,
  promo_name text,
  product text,
  category text,
  month text,
  tier int,                 -- 1 or 2
  start_date date,
  end_date date,
  days int,
  rrp numeric,              -- RRP inc GST
  current_price numeric,    -- current retailer selling price
  promo_price numeric,      -- promo price assumption inc GST
  discount_rrp numeric,     -- fraction off RRP (e.g. 0.25 = 25%)
  source text not null default 'sheet',
  created_at timestamptz not null default now()
);
create index if not exists promo_lines_brand_idx on promo_lines (brand, start_date);
create index if not exists promo_lines_customer_idx on promo_lines (customer);
create index if not exists promo_lines_tier_idx on promo_lines (tier);
