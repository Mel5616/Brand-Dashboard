-- Minimum spend requirement per discount code, pulled from Shopify's
-- price_rules.prerequisite_subtotal_range (already fetched by
-- scripts/sync_shopify_extras.py, just not stored until now).
alter table shop_discount_codes add column if not exists min_spend numeric;
