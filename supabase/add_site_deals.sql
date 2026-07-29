-- Deals running on our OWN Shopify websites (sales, bundles, GWPs) — logged
-- manually on the Promotions tab and shown in the promo windows timeline
-- alongside retailer promo windows.
create table if not exists site_deals (
  id bigint generated always as identity primary key,
  brand text not null,
  title text not null,           -- e.g. "15% off sitewide", "Winter Glow Sale"
  period_start date not null,
  period_end date not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table site_deals disable row level security;
