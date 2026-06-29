-- Monthly marketing budget + actuals per brand × channel, sourced from the
-- planning Google Sheet (Brand, Date, Type, Channel, Value). Type=Budget → kind
-- 'budget', Type=Expenses → kind 'actual'. Run once in Supabase.
create table if not exists marketing_monthly (
  brand_id int not null,
  month_key text not null,          -- YYYY-MM
  channel text not null,
  kind text not null,               -- budget | actual
  value numeric default 0,
  source text not null default 'sheet',
  primary key (brand_id, month_key, channel, kind)
);
create index if not exists marketing_monthly_idx on marketing_monthly (brand_id, month_key);
