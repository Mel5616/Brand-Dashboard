-- Line-item detail from Commission Factory's transaction Items[] array —
-- Sku, product name, category, quantity, per-item sale value/commission.
-- Currently discarded by the sync (only transaction-level totals are kept),
-- so there's no way to see which products actually drove CF-attributed
-- sales. One row per item per transaction; a multi-item cart produces
-- multiple rows sharing the same transaction_id.
create table if not exists commission_factory_items (
  id              bigserial primary key,
  transaction_id  bigint  not null,   -- CF transaction Id (commission_factory_transactions.id) — not unique alone, a cart can have multiple items
  brand_id        int     not null,
  date            date    not null,
  status          text,
  sku             text,
  product_name    text,
  category        text,
  quantity        int     default 1,
  sale_value      numeric default 0,
  commission      numeric default 0,
  unique (transaction_id, sku)
);
alter table commission_factory_items disable row level security;
create index if not exists cf_items_brand_date_idx on commission_factory_items (brand_id, date);
create index if not exists cf_items_sku_idx on commission_factory_items (sku);
