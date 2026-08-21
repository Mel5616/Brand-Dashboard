-- Clause 6 (Content Licence) usage rights are opt-in from Coolkidz's side,
-- not granted by default: paid amplification and trade/retail use already
-- had checkboxes that the clause text ignored (always granted regardless —
-- a real bug, now fixed at the template level), and "supply of original
-- files" had no checkbox at all (was unconditionally required). New
-- agreements default all three to off; existing signed agreements keep
-- whatever was actually true for them, unchanged.
alter table influencer_agreements add column if not exists usage_original_files boolean not null default false;
alter table influencer_agreements alter column usage_retail_partners set default false;
