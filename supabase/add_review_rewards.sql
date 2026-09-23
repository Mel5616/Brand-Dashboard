-- Review rewards: every published product review (Klaviyo Reviews, any
-- brand) earns one $5 code that works on any Coolkidz brand store, single
-- use. Issued by /api/review-rewards/issue (called by scripts/review_rewards.py
-- hourly from GitHub Actions), tracked on the Discount Codes tab.
create table if not exists review_rewards (
  id                   uuid primary key default gen_random_uuid(),
  source_brand_id      int  not null,                    -- brand the review was left for
  source_brand_name    text not null,
  review_id            text not null unique,             -- Klaviyo review id, the idempotency key
  customer_email       text not null,
  customer_name        text,
  rating               int,
  product_url          text,
  code                 text not null unique,
  value                numeric not null default 5,
  expires_at           timestamptz not null,
  codes                jsonb not null default '{}'::jsonb, -- {brand_id: discount gid} one per store
  email_sent           boolean not null default false,
  status               text not null default 'issued',   -- issued | redeemed | expired | failed
  error                text,
  redeemed_brand_id    int,
  redeemed_brand_name  text,
  redeemed_at          timestamptz,
  redeemed_order_name  text,
  redeemed_order_total numeric,
  issued_at            timestamptz not null default now()
);
create index if not exists review_rewards_status_idx on review_rewards (status, expires_at);
alter table review_rewards disable row level security;
