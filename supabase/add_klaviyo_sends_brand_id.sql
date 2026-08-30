-- Lets /api/klaviyo/sends re-resolve the correct brand's Klaviyo account (via
-- klaviyoKeyForBrand) for schedule/cancel/delete on an existing campaign —
-- campaign ids are scoped to the Klaviyo account that created them, so the
-- key used to create a draft must be the same one used to act on it later.
alter table klaviyo_sends add column if not exists brand_id int;
