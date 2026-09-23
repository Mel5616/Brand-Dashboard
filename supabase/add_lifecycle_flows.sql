-- Lifecycle flow coverage tracker (Email Marketing > Lifecycle Flows). Not
-- an automation engine — the flows themselves already run in Klaviyo, this
-- just gives a single portfolio-wide view of which brand has which flow
-- live, so a gap doesn't go unnoticed across 12 brands. One row per
-- brand+flow combination, upserted from the grid.
create table if not exists lifecycle_flows (
  id bigint generated always as identity primary key,
  brand_id int not null,
  flow_key text not null,          -- welcome | browse_abandon | cart_abandon | post_purchase | replenishment | winback | birthday | review_request | back_in_stock
  status text not null default 'not_built',  -- not_built | planned | live | paused
  klaviyo_url text,
  note text,
  last_reviewed date,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, flow_key)
);
alter table lifecycle_flows disable row level security;
