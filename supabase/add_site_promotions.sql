-- Curated "what's actually live on each new site" list — built up manually
-- as each site relaunches, instead of surfacing every synced Shopify code
-- (mostly legacy/irrelevant). If shopify_code + brand_id are set, toggling
-- calls Shopify for real (discountCodeActivate/Deactivate); otherwise it's
-- just this table's own on/off flag, for mechanics with no single code
-- (e.g. an automatic "spend and save" tier, or a GWP with no code at all).
create table if not exists site_promotions (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  brand_id int,
  title text not null,          -- e.g. "Free foam", "Spend and save"
  mechanic text,                 -- short description of how it works
  shopify_code text,             -- optional — enables a real Shopify toggle
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
alter table site_promotions disable row level security;
