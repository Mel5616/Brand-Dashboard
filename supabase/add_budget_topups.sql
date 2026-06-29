-- Per-month budget top-ups: extra budget added to a specific brand × month ×
-- channel, ON TOP of the annual ÷ 12 figure. Run once in Supabase.
create table if not exists budget_topups (
  brand_id int not null,
  month_key text not null,
  channel text not null,
  amount numeric default 0,
  primary key (brand_id, month_key, channel)
);
