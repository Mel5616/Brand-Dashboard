-- Partnerships & Affiliates v2:
--  • multiple products per partnership (items jsonb array)
--  • contact details (name, email, address)
--  • sale vs free: 'gift' = expense (cost against budget), 'sale' = revenue (income)
-- Safe to re-run. Existing single-product rows keep working (items stays null;
-- the app falls back to the legacy product_name/qty/rrp columns for them).

alter table partnership_entries add column if not exists kind         text    not null default 'gift';  -- 'gift' | 'sale'
alter table partnership_entries add column if not exists revenue      numeric default 0;                 -- income (sales only)
alter table partnership_entries add column if not exists contact_name text;
alter table partnership_entries add column if not exists email        text;
alter table partnership_entries add column if not exists address      text;
alter table partnership_entries add column if not exists items        jsonb;   -- [{style_code, product_name, brand, qty, rrp, unit_cost, line_cost, sale_price}]
