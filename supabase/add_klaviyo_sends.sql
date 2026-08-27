-- Tracks stock-report (and future) HTML sends pushed to Klaviyo from the
-- dashboard, so the Send panel can show history + pull stats back by
-- campaign_id without re-querying Klaviyo's list on every load.
create table if not exists klaviyo_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null unique,      -- Klaviyo campaign id
  subject text not null,
  list_id text not null,
  list_name text,
  html text not null,
  scheduled_at timestamptz,              -- null = sent immediately
  status text not null default 'draft',  -- draft | scheduled | sent | cancelled
  created_by text,
  created_at timestamptz not null default now()
);
