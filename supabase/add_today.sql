-- "Today" home tab: the one queue of everything that needs attention across
-- the dashboard. Items are built live (src/lib/today.ts); these two tables
-- only remember what's been dismissed and which urgent alerts were emailed.
create table if not exists today_dismissals (
  key          text primary key,        -- item key, includes a version so a changed item comes back
  dismissed_by text,
  dismissed_at timestamptz not null default now(),
  until        timestamptz not null
);
alter table today_dismissals disable row level security;

create table if not exists today_alerts_sent (
  key     text primary key,
  sent_at timestamptz not null default now()
);
alter table today_alerts_sent disable row level security;
