-- Weekly D2C Shopify report, generated every Sunday 7pm (AEST) by
-- scripts/weekly_d2c_report.py from brand_daily. One row per business week
-- (Sunday-start), full report payload as JSON.
create table if not exists d2c_weekly_reports (
  week_start date primary key,
  payload    jsonb not null,
  created_at timestamptz default now()
);
alter table d2c_weekly_reports disable row level security;
