-- Door attendance per tradeshow, per day (e.g. Saturday / Sunday visitor counts
-- collected after each expo). One row per show-day so any run length works.
create table if not exists tradeshow_attendance (
  tradeshow_id text references tradeshows(id) on delete cascade,
  day          date not null,
  attendance   int  default 0,
  primary key (tradeshow_id, day)
);
alter table tradeshow_attendance disable row level security;
