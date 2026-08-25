-- Retailer Hub: new-account chasing. Customers (typed-in prospects), the
-- sendable document library (price lists / brand overviews / trading terms —
-- fact sheets reuse product_fact_sheets), tracked sends (every email or copied
-- link gets a token whose opens are logged at /hub/<token>, mirroring
-- snapshot_shares), and new-customer application form submissions (/apply/<token>).
-- RLS disabled — access is controlled at the API layer (getAccess()), same as
-- every other table in this dashboard. Safe to re-run.

create table if not exists sales_customers (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  state text,                    -- VIC/NSW/QLD/WA/SA/TAS/ACT/NT
  postcode text,
  abn text,
  website text,
  brands text[] not null default '{}',   -- brand names being pitched
  stage text not null default 'lead',    -- lead | contacted | meeting | terms_sent | first_order | active | lost
  source text,
  notes text,
  next_action text,
  next_action_date date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_customers_stage_idx on sales_customers (stage);
create index if not exists sales_customers_store_idx on sales_customers (store_name);
alter table sales_customers disable row level security;

create table if not exists sales_documents (
  id uuid primary key default gen_random_uuid(),
  category text not null,        -- price_list | brand_overview | terms
  brand_name text,               -- null for company-wide docs (terms)
  title text not null,
  version text not null default '1',
  html_url text,                 -- public URL in the 'sales-hub' storage bucket
  pdf_url text,
  status text not null default 'current',   -- current | archived
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists sales_documents_cat_idx on sales_documents (category, brand_name, status);
alter table sales_documents disable row level security;

create table if not exists sales_sends (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  customer_id uuid references sales_customers(id) on delete set null,
  recipient_email text,
  recipient_name text,
  doc_kind text not null,        -- price_list | brand_overview | terms | fact_sheet | form
  doc_id uuid,                   -- sales_documents.id or product_fact_sheets.id; null for form
  doc_title text,
  brand_name text,
  sent_via text not null default 'email',   -- email | link (copied)
  subject text,
  email_status text,             -- sent | failed | null (link-only)
  open_count int not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  last_ip text,
  last_ua text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists sales_sends_token_idx on sales_sends (token);
create index if not exists sales_sends_customer_idx on sales_sends (customer_id, created_at desc);
create index if not exists sales_sends_kind_idx on sales_sends (doc_kind, created_at desc);
alter table sales_sends disable row level security;

create table if not exists customer_form_submissions (
  id uuid primary key default gen_random_uuid(),
  send_id uuid references sales_sends(id) on delete set null,
  customer_id uuid references sales_customers(id) on delete set null,
  store_name text,
  contact_name text,
  email text,
  phone text,
  abn text,
  data jsonb not null default '{}',   -- full form payload
  status text not null default 'new', -- new | reviewed | approved
  created_at timestamptz not null default now()
);
create index if not exists customer_form_submissions_status_idx on customer_form_submissions (status, created_at desc);
alter table customer_form_submissions disable row level security;
