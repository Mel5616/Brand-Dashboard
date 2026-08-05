-- Monthly camera-unit sell-through (Shopify productType = 'Baby Monitor'), D2C only.
alter table brand_monthly add column if not exists camera_units integer;
