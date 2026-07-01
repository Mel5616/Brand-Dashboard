-- Channel-level sales (revenue) budget by brand & month. Distinct from marketing
-- budgets (spend) and the brand-level `targets` table. Powers the Sales Budget tab.
-- Run once in the Supabase SQL editor.
create table if not exists sales_budget (
  brand_id  int  not null,
  channel   text not null,
  month_key text not null,          -- 'YYYY-MM'
  target    numeric default 0,
  fy26_actual numeric default 0,     -- prior-year actual for the channel (annual, repeated per row)
  primary key (brand_id, channel, month_key)
);
alter table sales_budget disable row level security;
