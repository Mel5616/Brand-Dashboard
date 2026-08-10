-- Cross-site discount code creator: support fixed-dollar-amount codes (e.g.
-- "$40 off") alongside the existing percentage codes. Run once in Supabase.
alter table cross_site_codes alter column percent drop not null;
alter table cross_site_codes add column if not exists discount_type text not null default 'percentage'; -- 'percentage' | 'fixed_amount'
alter table cross_site_codes add column if not exists amount numeric; -- dollar amount when discount_type = 'fixed_amount'
