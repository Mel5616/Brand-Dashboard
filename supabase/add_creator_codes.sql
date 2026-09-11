-- Creator / influencer discount codes tracked straight from Shopify.
-- One row per code. Sales are read LIVE from each store's Admin API by
-- /api/creator-codes (orders whose discount code matches), so there is no
-- order table to sync: register the code here and the dashboard does the rest.
--
-- sale value is ATTRIBUTED revenue (already in Shopify revenue) - never additive.
-- The real cost is the discount given + the commission owed.
create table if not exists creator_codes (
  id             uuid primary key default gen_random_uuid(),
  brand_id       int  not null,
  code           text not null,               -- exactly as typed at checkout
  creator_name   text not null,
  handle         text,                        -- e.g. @mini.jetsetter
  platform       text default 'instagram',
  followers      int,
  commission_pct numeric default 0,           -- 5 = 5% of net sales
  offer          text,                        -- what the customer gets, e.g. "$30 off over $100"
  program        text,                        -- e.g. "UpPromote (global)", "direct"
  started_on     date default current_date,
  active         boolean default true,
  notes          text,
  created_by     text,
  created_at     timestamptz default now(),
  unique (brand_id, code)
);
alter table creator_codes disable row level security;

-- Commission payouts recorded against a creator for a month.
create table if not exists creator_payouts (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creator_codes(id) on delete cascade,
  month_key   text not null,                  -- 'YYYY-MM' the payout covers
  amount      numeric not null default 0,
  paid_on     date default current_date,
  reference   text,
  created_by  text,
  created_at  timestamptz default now(),
  unique (creator_id, month_key)
);
alter table creator_payouts disable row level security;

-- Seed: the two MiaMily creator codes created 11 Sep 2026 (brand_id 7 = MiaMily).
insert into creator_codes (brand_id, code, creator_name, handle, platform, followers, commission_pct, offer, program, started_on, notes)
values
  (7, 'WWOLGA30', 'Olga Valentin', '@mini.jetsetter', 'instagram', 299000, 0, '$30 off orders over $100', 'MiaMily global affiliate program', '2026-09-11', 'Same code as the global store. No commission agreed on the AU side yet.'),
  (7, 'WWJESS30', 'Jess Darrington', '@whereisbriggs', 'instagram', null, 5, '$30 off orders over $100', 'UpPromote (global)', '2026-09-11', '5% commission on net sales, paid by Coolkidz for AU orders.')
on conflict (brand_id, code) do nothing;
