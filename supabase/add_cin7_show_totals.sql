-- Direct per-show COGS total from Cin7's matched dispatched orders — summed
-- straight from every matched order's line items, NOT re-derived via a join
-- against tradeshow_products.sku. That join loses ~11% of coverage on
-- bundled/demo/no-SKU product lines (Mesa Capsule, ex-demo floor stock,
-- "Custom sale") that Cin7 has real per-unit costs for at the order-line
-- level even though our Shopify-side product aggregation can't cleanly
-- assign them one SKU. Verified against a real Cin7-native COGS export
-- (28 Aug 2026): this direct total landed within ~1% of Cin7's own report,
-- vs. ~15% low via the SKU-join. Populated by scripts/sync_cin7_costs.py.
create table if not exists cin7_show_totals (
  tradeshow_id     text primary key,
  total_cogs       numeric not null,
  matched_orders   int not null,
  total_orders     int not null,
  synced_at        timestamptz default now()
);
alter table cin7_show_totals disable row level security;
