-- Unlocked by the new Shopify scopes: abandoned checkouts, live stock levels,
-- discount-code usage, and cross-site code creation records.

-- Abandoned checkouts per brand per month (read_checkouts)
create table if not exists abandoned_checkouts (
  brand_id int not null,
  month_key text not null,
  checkouts int not null default 0,
  value numeric not null default 0,      -- ex-GST value left behind
  updated_at timestamptz not null default now(),
  primary key (brand_id, month_key)
);
alter table abandoned_checkouts disable row level security;

-- Live stock snapshot: ACTIVE products that are out of stock or low (read_inventory)
create table if not exists product_stock (
  brand_id int not null,
  product_id text not null,
  title text not null,
  status text,                            -- active | draft
  total_qty int not null default 0,
  variants_out int not null default 0,    -- variants at zero
  variants_total int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brand_id, product_id)
);
alter table product_stock disable row level security;

-- Discount codes with native redemption counts (read_discounts)
create table if not exists shop_discount_codes (
  brand_id int not null,
  code text not null,
  usage_count int not null default 0,
  value_type text,                        -- percentage | fixed_amount
  value numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (brand_id, code)
);
alter table shop_discount_codes disable row level security;

-- Cross-site codes created from the dashboard (write_discounts)
create table if not exists cross_site_codes (
  id bigint generated always as identity primary key,
  code text not null,
  percent numeric not null,
  starts_at date,
  ends_at date,
  results jsonb not null default '[]'::jsonb,   -- [{brand, ok, error?}]
  created_by text,
  created_at timestamptz not null default now()
);
alter table cross_site_codes disable row level security;
