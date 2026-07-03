-- Tradeshow Deals: per-show, per-brand deal entry that feeds the deal sheet.
-- Shows reuse the existing `tradeshows` table (deals hang off a tradeshow).
-- Product master = influencer_products (referenced by style_code). Safe to re-run.

alter table tradeshows add column if not exists booth_url   text;
alter table tradeshows add column if not exists deals_token text;   -- public deal-sheet share link

create table if not exists show_deals (
  id               uuid primary key default gen_random_uuid(),
  show_id          text not null references tradeshows(id) on delete cascade,
  brand            text not null,
  scope            text not null default 'product',      -- whole_brand | range | product | bundle
  product_code     text,                                 -- influencer_products.style_code (null for whole_brand/range)
  product_name     text,                                 -- denormalised for display
  range_label      text,                                 -- e.g. "Bubba's range"
  mechanic         text not null default 'discount',     -- discount | gwp
  discount_type    text,                                 -- pct_off | amount_off | fixed_price
  discount_value   numeric(10,2),
  rrp              numeric(10,2),
  cost_price       numeric(10,2),                        -- permission-gated in the UI
  show_price       numeric(10,2),
  gift_code        text,
  gift_label       text,                                 -- non-catalogue gift
  gift_value       numeric(10,2),
  gift_cost        numeric(10,2),
  gift_qty         int default 1,
  gwp_trigger      text,                                 -- any_purchase | min_spend | specific_sku
  min_spend        numeric(10,2),
  stock_cap        int,
  auto_add         boolean default true,
  valid_from       date,
  valid_to         date,
  channel          text not null default 'd2c_booth',    -- d2c_booth | retail | both
  stackable        boolean default false,
  one_per_customer boolean default false,
  status           text not null default 'draft',        -- draft | active | expired
  approved_by      text,
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists show_deals_show_idx on show_deals(show_id);

-- Single-row settings (portfolio margin floor, as a percentage).
create table if not exists deal_settings (
  id           int primary key default 1,
  margin_floor numeric not null default 20
);
insert into deal_settings (id, margin_floor) values (1, 20) on conflict (id) do nothing;
