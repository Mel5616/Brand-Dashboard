-- Network-level weekly trend views for the Baby Bunting brand + pram/model charts.
-- Run once after add_bb_sell_through.sql.
create or replace view bb_weekly_brand as
  select week_ending, brand,
         sum(wk_sales) wk_sales, sum(wk_units) wk_units, sum(cum_sales) cum_sales
  from bb_sell_through group by week_ending, brand;

create or replace view bb_weekly_model as
  select week_ending, model, bool_or(is_pram) is_pram,
         sum(wk_units) wk_units, sum(wk_sales) wk_sales,
         sum(cum_units) cum_units, sum(cum_sales) cum_sales, sum(soh_units) soh_units,
         case when sum(soh_units + cum_units) > 0
              then sum(cum_units) / nullif(sum(soh_units + cum_units), 0) end sell_thru
  from bb_sell_through group by week_ending, model;
