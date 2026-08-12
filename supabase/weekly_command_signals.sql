-- Weekly Command, stage 2: exception signals, diffed nightly from
-- brand_context_packs (today's pack vs the previous one). Upserted on
-- (brand_id, type, signal_key) so a persisting condition (e.g. a channel
-- still down >20%) updates in place instead of piling up a fresh row every
-- night — the queue should show "this is still true", not "this happened
-- again 14 times".
create table if not exists brand_signals (
  id                uuid primary key default gen_random_uuid(),
  brand_id          int not null,
  tier              text,
  type              text not null check (type in ('sales','stock','promo','channel','delivery')),
  signal_key        text not null,
  headline          text not null,
  detail            text,
  suggested_action  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (brand_id, type, signal_key)
);
alter table brand_signals disable row level security;
create index if not exists brand_signals_tier_idx on brand_signals (tier, updated_at desc);
