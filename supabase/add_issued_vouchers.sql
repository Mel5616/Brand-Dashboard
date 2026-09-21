-- $20 vouchers issued to UPPAbaby customers who spend $500 or more.
--
-- One row per UPPAbaby order. The code is a real one-use discount code
-- created on the brand store the customer picked in the cart (Frida, Mamave
-- or Matchstick Monkey): $20 off, $60 minimum spend, 90 days. Written here
-- the moment it is created, marked redeemed by the Vouchers card on the
-- Discount Codes tab, which looks the codes up against the brand stores'
-- orders when opened.

create table if not exists issued_vouchers (
  id                   uuid primary key default gen_random_uuid(),

  -- where it was earned
  source_brand_id      int  not null default 5,          -- UPPAbaby
  source_order_id      bigint not null unique,           -- Shopify order id, the idempotency key
  source_order_name    text,                             -- UB#33707
  order_subtotal       numeric,                          -- what qualified it
  customer_email       text,
  customer_name        text,

  -- what was issued
  brand_id             int  not null,                    -- 8 Frida, 11 Mamave, 10 Matchstick Monkey
  brand_name           text not null,
  code                 text not null unique,
  value                numeric not null default 20,
  min_spend            numeric not null default 60,
  expires_at           timestamptz not null,
  discount_gid         text,                             -- gid://shopify/DiscountCodeNode/...
  email_sent           boolean not null default false,

  -- what happened to it
  status               text not null default 'issued',   -- issued | redeemed | expired | failed
  error                text,
  redeemed_at          timestamptz,
  redeemed_order_name  text,
  redeemed_order_total numeric,

  issued_at            timestamptz not null default now()
);

create index if not exists issued_vouchers_status_idx on issued_vouchers (status, expires_at);
create index if not exists issued_vouchers_brand_idx  on issued_vouchers (brand_id, issued_at desc);

alter table issued_vouchers enable row level security;
-- Written and read by the dashboard with the service role only.
