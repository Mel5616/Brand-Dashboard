-- Staff working the expo per show-day (entered alongside door attendance).
alter table tradeshow_attendance add column if not exists staff int default 0;
