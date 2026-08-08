-- Command Centre (Director view, /command) — admin-only page. Run once in Supabase.
-- Phase 1+2 per command-page-build-brief.md: header strip, action queue (3
-- triggers), data freshness footer. Thresholds and snoozes are the only new
-- state — everything else is read from tables that already exist.

create table if not exists command_thresholds (
  id            bigint generated always as identity primary key,
  key           text not null unique,
  label         text not null,
  value_numeric numeric not null,
  unit          text default 'days',
  brand_id      int,                 -- nullable: per-brand override, unused in v1
  updated_at    timestamptz default now(),
  updated_by    text
);
alter table command_thresholds disable row level security;

insert into command_thresholds (key, label, value_numeric, unit) values
  ('campaign_risk_window_days', 'Campaign at-risk window before launch', 14, 'days')
on conflict (key) do nothing;

create table if not exists command_snoozes (
  id           bigint generated always as identity primary key,
  item_type    text not null,        -- 'design_request' | 'blog' | 'campaign'
  item_id      text not null,
  snoozed_by   text not null,
  reason       text not null,        -- required at the app layer too — no silent snoozes
  snoozed_at   timestamptz default now(),
  resurface_at date not null
);
alter table command_snoozes disable row level security;
create index if not exists command_snoozes_item_idx on command_snoozes (item_type, item_id);
