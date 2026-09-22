-- Cross-site discount code creator: whether the code is allowed to stack
-- with other order/product/shipping discounts in Shopify. Run once in Supabase.
alter table cross_site_codes add column if not exists combines_with boolean not null default false;
