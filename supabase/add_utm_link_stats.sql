-- GA4 traffic against each UTM Tracking link, synced by scripts/sync_utm_stats.py.
-- Keyed lower-case (source/medium/campaign are case-sensitive in GA4 but
-- someone typing a link in the dashboard shouldn't have to match case exactly).
create table if not exists utm_link_stats (
  brand_id int not null,
  source text not null,
  medium text not null,
  campaign text not null default '',
  sessions int not null default 0,
  conversions numeric not null default 0,
  revenue numeric not null default 0,
  synced_at timestamptz not null default now(),
  primary key (brand_id, source, medium, campaign)
);
alter table utm_link_stats disable row level security;
