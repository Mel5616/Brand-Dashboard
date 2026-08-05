-- Live cost sheet, synced from the SharePoint "CK Australia - Cost Sheet"
-- workbook via Microsoft Graph (one worksheet per brand). Wholesale-replaced
-- per brand on every sync so deleted/renamed products don't linger.
create table if not exists cost_sheet_items (
  id bigint generated always as identity primary key,
  brand text not null,
  category text,
  product_name text not null,
  style_code text,
  fob_usd numeric,
  fob_aud numeric,
  freight_inbound numeric,
  duty numeric,
  landed_cost_aud numeric,
  retail_incl_gst numeric,
  retail_excl_gst numeric,
  wholesale_excl_gst numeric,
  bunting_excl_gst numeric,
  margin_independents_pct numeric,
  margin_bunting_pct numeric,
  retail_margin_pct numeric,
  bunting_margin_pct numeric,
  direct_margin_pct numeric,
  nz_wholesale_excl_gst numeric,
  nz_margin_ck_pct numeric,
  nz_margin_pct numeric
);
create index if not exists cost_sheet_items_brand_idx on cost_sheet_items(brand);
alter table cost_sheet_items disable row level security;

create table if not exists cost_sheet_meta (
  brand text primary key,
  exchange_rate numeric,
  freight_rate numeric,
  updated_label text,
  synced_at timestamptz not null default now()
);
alter table cost_sheet_meta disable row level security;
