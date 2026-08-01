-- Event memory: dated notes ("what happened here") pinned to the revenue
-- timeline — promo launches, expos, price changes, stockouts, PR moments.
-- Drawn as flags on the monthly charts and listed on the Business Overview.
create table if not exists chart_annotations (
  id bigint generated always as identity primary key,
  day date not null,
  label text not null,               -- "Kona launch", "BigW promo starts"
  kind text not null default 'other',-- promo | expo | price | stock | pr | other
  brand text,                        -- null = whole portfolio
  created_by text,
  created_at timestamptz not null default now()
);
alter table chart_annotations disable row level security;
