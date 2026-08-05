-- Monthly units sold per tracked SKU (D2C only) — e.g. Nanit's camera models + sound machine.
create table if not exists brand_product_units (
  brand_id int not null,
  sku text not null,
  label text not null,
  month_key text not null,
  units int not null default 0,
  primary key (brand_id, sku, month_key)
);
alter table brand_product_units disable row level security;
