-- Commission Factory (affiliate) data, per brand.
-- Config: each brand's own CF merchant API key as `commissionFactoryApiKey` in
-- stores.config.json — the account identifies the brand, so no per-item brand
-- mapping is needed.
--
-- IMPORTANT for anyone reading these numbers:
--   * sale_value is ATTRIBUTED revenue. Those orders are already counted in the
--     brand's Shopify revenue — never add sale_value to store revenue.
--   * The real affiliate COST is commission + override_fee (CF's platform fee on
--     top of the affiliate's commission). Counting commission alone understates it.
--   * CF's own "Test Transaction" rows are excluded by the sync.

-- Monthly rollup, kept per status so pending vs approved stays visible.
create table if not exists commission_factory (
  brand_id     int     not null,
  month_key    text    not null,   -- 'YYYY-MM' of DateCreated
  status       text    not null,   -- Approved / Pending / Void / …
  transactions int     default 0,
  sale_value   numeric default 0,  -- attributed revenue (NOT incremental)
  commission   numeric default 0,  -- paid to the affiliate
  override_fee numeric default 0,  -- CF platform fee
  primary key (brand_id, month_key, status)
);
alter table commission_factory disable row level security;

-- Raw transactions — powers the top-affiliate and coupon views.
create table if not exists commission_factory_transactions (
  id           bigint  primary key,   -- CF transaction Id
  brand_id     int     not null,
  date         date    not null,      -- DateCreated
  status       text,
  sale_value   numeric default 0,
  commission   numeric default 0,
  override_fee numeric default 0,
  affiliate    text,
  coupon       text,
  order_id     text,
  currency     text
);
alter table commission_factory_transactions disable row level security;

create index if not exists cf_txn_brand_date_idx on commission_factory_transactions (brand_id, date);
create index if not exists cf_month_idx          on commission_factory (month_key);
