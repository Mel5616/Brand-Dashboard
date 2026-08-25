-- Retailer Hub: opening order forms. Wholesale catalogue rows power the public
-- tokenised order page (/order/<token>); submitted orders land here and email
-- marketing@ + the sender. Products are seeded from each brand's trade price
-- list. RLS disabled — access controlled at the API layer. Safe to re-run.

create table if not exists order_form_products (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  category text,                 -- e.g. "Frida Baby — Nose Care"
  sku text,
  name text not null,
  short_desc text,
  wholesale numeric,             -- ex GST
  rrp numeric,                   -- inc GST
  pack_qty int not null default 1,
  barcode text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists order_form_products_brand_idx on order_form_products (brand_name, active, sort);
alter table order_form_products disable row level security;

create table if not exists opening_orders (
  id uuid primary key default gen_random_uuid(),
  send_id uuid references sales_sends(id) on delete set null,
  customer_id uuid references sales_customers(id) on delete set null,
  brand_name text,
  store_name text,
  contact_name text,
  email text,
  phone text,
  po_number text,
  notes text,
  lines jsonb not null default '[]',   -- [{sku,name,wholesale,qty,line_total}]
  total_ex_gst numeric,
  status text not null default 'new',  -- new | processed
  created_at timestamptz not null default now()
);
create index if not exists opening_orders_status_idx on opening_orders (status, created_at desc);
alter table opening_orders disable row level security;
