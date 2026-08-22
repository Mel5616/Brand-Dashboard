-- A product/brand photo per competitor, shown at the top of its card in the
-- Activations report.
alter table brand_competitors add column if not exists image_url text;
