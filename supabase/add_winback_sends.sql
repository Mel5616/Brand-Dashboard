-- Abandoned checkout win-back sends (UPPAbaby first; brand_id keeps it open).
--
-- One row per email sent from the Win-back card on the Shopify tab. Each send
-- carries a one-use code created on the store at send time (a free accessory
-- with a Vista or Cruz in the bag). Conversions are swept against orders that
-- used the code, so recovered revenue is real, not inferred.

create table if not exists winback_sends (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            int  not null default 5,
  checkout_id         text not null,                -- gid://shopify/AbandonedCheckout/...
  checkout_created_at timestamptz,
  customer_email      text not null,
  customer_name       text,
  cart_value          numeric,                      -- what was left at checkout
  cart_summary        text,                         -- "Cruz V3 Owen, Bassinet Liam"
  campaign            text not null,                -- e.g. sep-2026-free-accessory
  code                text not null unique,
  discount_gid        text,
  expires_at          timestamptz,
  email_sent          boolean not null default false,
  status              text not null default 'sent', -- sent | recovered | expired | failed
  error               text,
  recovered_at        timestamptz,
  recovered_order     text,
  recovered_value     numeric,
  sent_at             timestamptz not null default now()
);

create unique index if not exists winback_sends_checkout_campaign on winback_sends (checkout_id, campaign);
create index if not exists winback_sends_status on winback_sends (status, sent_at desc);

alter table winback_sends enable row level security;
-- Service role only.
