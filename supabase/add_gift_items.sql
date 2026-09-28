-- Structured product entry for Giveaways/Product Requests, mirroring the
-- Influencer Agreements "Products gifted" picker (same catalogue table,
-- influencer_products) instead of free-text description. items/products
-- stays as a derived human-readable summary, so Timeline notes and emails
-- built from it keep working unchanged.
alter table giveaways add column if not exists gift_items jsonb not null default '[]';
alter table product_requests add column if not exists gift_items jsonb not null default '[]';
