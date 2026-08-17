-- Shopify's price_rules API gives every discount code back flat, with no
-- field marking "this is a main promotional code" vs "this is one of a
-- thousand auto-generated per-affiliate/per-customer codes". Two real
-- signals let the dashboard tell them apart:
--   * usage_limit = 1 on the price rule -> single-use, i.e. an individual code
--   * codes_in_rule > 1 -> a bulk-generated batch (affiliate/loyalty apps
--     create one price rule with hundreds of unique codes under it); a real
--     "main" promo code is the sole code on its own rule.
-- Neither was captured before — needed for the new Discount Codes tab to
-- filter to "only the main ones" rather than guessing.
alter table shop_discount_codes add column if not exists usage_limit int;
alter table shop_discount_codes add column if not exists codes_in_rule int;
