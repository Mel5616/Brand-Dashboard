-- SKU/colourway-level rollup for the "best-selling colours per model" breakdown
-- and per-colour weeks-of-stock-cover. ~170 SKUs per week, so a single week query
-- is tiny. Safe to re-run (create or replace).
create or replace view bb_agg_variant as
  select week_ending, model, supplier_code, description, bool_or(is_pram) is_pram,
         sum(wk_units) wk_units, sum(wk_sales) wk_sales,
         sum(cum_units) cum_units, sum(cum_sales) cum_sales,
         sum(soh_units) soh_units, sum(soh_value) soh_value
  from bb_sell_through
  group by week_ending, model, supplier_code, description;
