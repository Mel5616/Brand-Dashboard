-- Per-source sync health, so the dashboard can show which feeds are fresh /
-- stale / failed and alert on breakages. Written by each sync script (via
-- scripts/sync_status_util.py) at the end of its run.

create table if not exists sync_status (
  source   text not null primary key,   -- e.g. 'Pinterest Ads', 'Klaviyo'
  ok       boolean default true,
  message  text default '',             -- error text when ok = false
  ran_at   timestamptz not null
);
alter table sync_status disable row level security;
