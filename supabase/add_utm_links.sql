-- UTM Tracking (Plan > UTM Tracking): a shared, in-dashboard replacement for
-- the "UTM - ALL BRANDS.xlsx" spreadsheet. Anyone with the tab can add a
-- link; the dashboard builds the tracked final URL and a downloadable QR
-- code from it.
create table if not exists utm_links (
  id uuid primary key default gen_random_uuid(),
  brand text,
  partner text not null,        -- "Partner / Activity" — who or what this link is for
  source text not null,
  medium text not null,
  campaign text,
  landing_page text not null,
  final_url text not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists utm_links_brand_idx on utm_links (brand);
alter table utm_links disable row level security;
