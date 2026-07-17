-- Tradeshow report breakdown: per-brand product sales, hourly series and the
-- QR-funnel summary for each show. Populated by scripts/sync_tradeshow_breakdown.py
-- (recent shows only). Existing tradeshow_sales figures are untouched.

-- One row per product per bucket per show. bucket = brand name, or 'QR' for
-- QR-funnel (Shopify headless channel) orders, kept separate by convention.
-- Revenue is ex-GST and uses DISCOUNTED line prices so buckets reconcile with
-- the by-brand totals (the show price actually paid, not RRP).
create table if not exists tradeshow_products (
  tradeshow_id text not null,
  bucket       text not null,
  product      text not null,
  revenue      numeric default 0,
  units        int default 0,
  synced_at    timestamptz default now(),
  primary key (tradeshow_id, bucket, product)
);
alter table tradeshow_products disable row level security;

-- Sales by hour (show-local time), all legs combined: own-store POS +
-- Coolkidz booth till + QR channel. Ex-GST.
create table if not exists tradeshow_hourly (
  tradeshow_id text not null,
  day          date not null,
  hour         int  not null,      -- 0-23, show-local
  slot         text,               -- display label, e.g. "Sat 12PM"
  revenue      numeric default 0,
  orders       int default 0,
  synced_at    timestamptz default now(),
  primary key (tradeshow_id, day, hour)
);
alter table tradeshow_hourly disable row level security;

-- QR funnel order summary per show (Shopify paid orders on the QR channel,
-- ex-GST — the standard agreed 17 Jul 2026). Scans/checkouts come live from
-- the booth app's own Supabase, not stored here.
create table if not exists tradeshow_qr (
  tradeshow_id text primary key,
  revenue      numeric default 0,
  orders       int default 0,
  synced_at    timestamptz default now()
);
alter table tradeshow_qr disable row level security;
