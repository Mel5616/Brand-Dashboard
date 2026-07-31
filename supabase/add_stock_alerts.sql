-- Back-in-stock alerts: one row per item removed from the Asana Stock Report
-- board (ticked complete in the dashboard or closed in Asana). Users with the
-- Stock Report tab get a pop-up on their dashboard; dismissals are per-browser.
create table if not exists stock_alerts (
  id bigint generated always as identity primary key,
  gid text not null unique,          -- the Asana task gid
  name text not null,                -- item name as it appeared on the report
  section text,                      -- board section (usually the brand)
  detected_at timestamptz not null default now()
);
alter table stock_alerts disable row level security;
