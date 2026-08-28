-- Real per-show, per-SKU landed cost, sourced from the ACTUAL dispatched
-- Cin7 sales order (SalesOrders[].lineItems[].unitCost) that shipped during
-- each show's window — not an approximated average. This replaces the Cost
-- Sheet's imperfect SKU-prefix matching as the tradeshow COGS source
-- (src/lib/tradeshowMargin.ts). Populated by scripts/sync_cin7_costs.py.
--
-- Cost is scoped PER SHOW (not a single global per-SKU cost) because Cin7
-- tracks FIFO-consumed batch cost, which genuinely varies over time as stock
-- batches turn over — the whole point of pulling this from Cin7 instead of a
-- static Cost Sheet number.
create table if not exists cin7_show_costs (
  tradeshow_id text not null,
  sku          text not null,
  unit_cost    numeric not null,  -- qty-weighted average unit cost across matched dispatched line items
  qty          int not null,      -- total qty matched, for confidence/weighting
  synced_at    timestamptz default now(),
  primary key (tradeshow_id, sku)
);
alter table cin7_show_costs disable row level security;
