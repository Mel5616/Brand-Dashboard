-- Reviews + Email upgrade (Sep 2026). Both tables are filled by
-- scripts/sync_klaviyo.py (GitHub Actions, every 3 hours).

-- Every Klaviyo flow per brand, whatever its status — the Flows tab's
-- "ready to go live" checklist lists the drafts from here.
create table if not exists klaviyo_flows (
  brand_id     int  not null,
  flow_id      text not null,
  name         text not null,
  status       text,            -- live | draft | manual | paused
  trigger_type text,
  synced_at    timestamptz not null default now(),
  primary key (brand_id, flow_id)
);
alter table klaviyo_flows disable row level security;

-- Weekly list growth by list (= signup source): checklist gate, popup,
-- giveaway, product registration, checkout… per brand, last 12 weeks.
create table if not exists klaviyo_list_growth (
  brand_id     int  not null,
  week_start   date not null,
  list_name    text not null,
  subscribes   int  not null default 0,
  unsubscribes int  not null default 0,
  synced_at    timestamptz not null default now(),
  primary key (brand_id, week_start, list_name)
);
alter table klaviyo_list_growth disable row level security;
