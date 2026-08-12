-- Weekly Command, stage 1: brand context packs. One JSON snapshot per brand
-- per night, built from data already in Supabase (channel_sales, promotions,
-- calendar_events, budget_topups/marketing_actuals, brand_product_units,
-- brand_profiles). Kept in Postgres — not Drive markdown — so stage 2's
-- week-on-week diff is a plain query, not a file diff.
--
-- Fields with no reliable source yet (per-SKU stock levels, qualitative
-- retail-partner status) are intentionally left out of `pack` rather than
-- populated with guesses. Add them once a real source exists.
create table if not exists brand_context_packs (
  brand_id      int not null,
  generated_at  date not null,
  pack          jsonb not null,
  created_at    timestamptz not null default now(),
  primary key (brand_id, generated_at)
);
alter table brand_context_packs disable row level security;
create index if not exists brand_context_packs_brand_idx on brand_context_packs (brand_id, generated_at desc);
