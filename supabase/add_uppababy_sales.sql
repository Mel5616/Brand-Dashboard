-- UPPAbaby calendar-year sell-through by retail channel, uploaded monthly from the
-- "CK - UPPAbaby Sales Report" spreadsheet. One row per channel/year/month.
-- Run once in the Supabase SQL editor.
create table if not exists uppababy_sales (
  channel  text not null,
  year     int  not null,
  month    int  not null,            -- 1..12
  value    numeric not null default 0,
  forecast boolean not null default false,
  primary key (channel, year, month)
);
alter table uppababy_sales disable row level security;
