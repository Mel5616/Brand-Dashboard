-- Wholesale + RRP pricing for new products. These are shared across the colour
-- line (same for every colour), like the copy fields. Run once in Supabase.
alter table new_products add column if not exists wholesale_price numeric;
alter table new_products add column if not exists rrp numeric;
