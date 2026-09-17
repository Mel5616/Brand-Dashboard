-- smarTrike Australia product registration (smartrike.com.au/pages/register-your-product),
-- sharing the Gaia Baby warranty tables in the dedicated warranty Supabase project.
-- Run add_warranty_registrations.sql first, then this.

alter table warranty_registrations add column if not exists brand         text not null default 'gaia';   -- gaia | smartrike
alter table warranty_registrations add column if not exists child_dob     date;
alter table warranty_registrations add column if not exists guides_opt_in boolean not null default false;
alter table warranty_registrations add column if not exists receipt_path  text;                           -- storage path in the warranty-receipts bucket
alter table warranty_registrations add column if not exists receipt_name  text;
create index if not exists warranty_registrations_brand_idx on warranty_registrations (brand, created_at desc);

-- Private bucket for receipts. The API also creates it on first use if missing.
insert into storage.buckets (id, name, public, file_size_limit)
values ('warranty-receipts', 'warranty-receipts', false, 12582912)
on conflict (id) do nothing;
