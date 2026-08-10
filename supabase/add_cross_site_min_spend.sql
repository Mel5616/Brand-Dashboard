-- Cross-site discount code creator: optional minimum spend requirement. Run once in Supabase.
alter table cross_site_codes add column if not exists min_spend numeric;
