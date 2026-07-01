-- Baby Bunting weekly sell-through, stored immutably at SKU × store grain.
-- Re-uploading a week upserts on (week_ending, store, code) so a corrected file
-- cleanly replaces the prior load. All roll-ups derive from this one table.
create table if not exists bb_sell_through (
  id            bigint generated always as identity primary key,
  week_ending   date        not null,
  store         text        not null,
  state         text        not null,
  code          text        not null,
  supplier_code text,
  description   text,
  brand         text        not null,
  model         text        not null,
  is_pram       boolean     not null default false,
  curr_retail   numeric,
  wk_units      numeric     not null default 0,
  wk_sales      numeric     not null default 0,   -- that week, ex-tax
  soh_units     numeric     not null default 0,
  soh_value     numeric     not null default 0,
  weeks_on_hand numeric,
  cum_units     numeric     not null default 0,   -- rolling year snapshot
  cum_sales     numeric     not null default 0,   -- rolling year, ex-tax
  cum_sellthru  numeric,
  gp_cum        numeric,
  loaded_at     timestamptz not null default now(),
  unique (week_ending, store, code)
);
create index if not exists bb_st_week  on bb_sell_through (week_ending);
create index if not exists bb_st_state on bb_sell_through (state, week_ending);
create index if not exists bb_st_brand on bb_sell_through (brand, week_ending);
create index if not exists bb_st_model on bb_sell_through (model, week_ending);
alter table bb_sell_through disable row level security;

-- Pre-aggregated views. The dashboard queries these (filtered by week_ending and
-- optionally state) so no request ever scans raw SKU rows client-side.

-- Per week × state — powers KPIs (sum across states = All AU), the state bars,
-- and the state trend line.
create or replace view bb_agg_state as
  select week_ending, state,
         sum(wk_sales) wk_sales, sum(wk_units) wk_units,
         sum(cum_sales) cum_sales, sum(cum_units) cum_units,
         sum(soh_value) soh_value, sum(soh_units) soh_units,
         count(distinct store) stores
  from bb_sell_through group by week_ending, state;

-- Per week × state × brand — brand mix + brand trend.
create or replace view bb_agg_brand as
  select week_ending, state, brand,
         sum(wk_sales) wk_sales, sum(wk_units) wk_units,
         sum(cum_sales) cum_sales, sum(cum_units) cum_units
  from bb_sell_through group by week_ending, state, brand;

-- Per week × state × model — the Sales by Product matrix (pram lines flagged).
create or replace view bb_agg_model as
  select week_ending, state, model, bool_or(is_pram) is_pram,
         sum(wk_units) wk_units, sum(wk_sales) wk_sales,
         sum(cum_units) cum_units, sum(cum_sales) cum_sales,
         sum(soh_units) soh_units,
         case when sum(soh_units + cum_units) > 0
              then sum(cum_units) / nullif(sum(soh_units + cum_units), 0) end sell_thru
  from bb_sell_through group by week_ending, state, model;

-- Per week × store — leaderboard.
create or replace view bb_agg_store as
  select week_ending, store, state,
         sum(wk_sales) wk_sales, sum(wk_units) wk_units,
         sum(cum_sales) cum_sales, sum(cum_units) cum_units,
         sum(soh_value) soh_value
  from bb_sell_through group by week_ending, store, state;

-- Whole-network per week — overall trend line.
create or replace view bb_weekly_totals as
  select week_ending,
         sum(wk_sales) wk_sales, sum(wk_units) wk_units,
         sum(cum_sales) cum_sales, sum(cum_units) cum_units,
         sum(soh_value) soh_value, sum(soh_units) soh_units,
         count(distinct store) stores
  from bb_sell_through group by week_ending;
