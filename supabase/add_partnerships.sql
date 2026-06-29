-- Partnerships & Affiliates: free product given to companies/affiliates, tracked
-- against a per-brand×month budget. Cost is derived from the shared
-- influencer_products catalogue (× qty). Run once in Supabase.

create table if not exists partnership_entries (
  id bigint generated always as identity primary key,
  month_key text not null,
  company text,
  brand text,
  style_code text,
  product_name text,
  qty int default 1,
  rrp numeric,
  gifting_cost numeric,        -- unit cost × qty
  cash_fee numeric default 0,
  total_cost numeric,          -- gifting_cost + cash_fee
  affiliate_code text,
  status text,
  content_url text,
  created_at timestamptz default now()
);

create table if not exists partnership_budgets (
  brand text not null,
  month_key text not null,
  budget numeric default 0,
  primary key (brand, month_key)
);
