-- Per-brand "Retailer Kit" — brand overview, product showcase, price list,
-- order info and a scored staff-training quiz, shared as one tracked public
-- link (mirrors the deals_token / snapshot_shares open-tracking pattern).

create table if not exists retailer_kits (
  id uuid primary key default gen_random_uuid(),
  brand_id int not null,
  title text not null,
  tagline text,
  hero_image_url text,
  overview text,
  order_info text,
  status text not null default 'draft', -- 'draft' | 'published'
  share_token text unique,
  open_count int not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists retailer_kits_brand_idx on retailer_kits (brand_id);

create table if not exists retailer_kit_products (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references retailer_kits(id) on delete cascade,
  name text not null,
  image_url text,
  description text,
  sort_order int not null default 0
);
create index if not exists retailer_kit_products_kit_idx on retailer_kit_products (kit_id);

create table if not exists retailer_kit_price_rows (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references retailer_kits(id) on delete cascade,
  sku text,
  product_name text not null,
  rrp numeric,
  wholesale_price numeric,
  moq int,
  sort_order int not null default 0
);
create index if not exists retailer_kit_price_rows_kit_idx on retailer_kit_price_rows (kit_id);

create table if not exists retailer_kit_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references retailer_kits(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]', -- [{ "text": "...", "correct": true|false }, ...]
  sort_order int not null default 0
);
create index if not exists retailer_kit_quiz_questions_kit_idx on retailer_kit_quiz_questions (kit_id);

create table if not exists retailer_kit_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references retailer_kits(id) on delete cascade,
  respondent_name text not null,
  respondent_email text,
  respondent_company text,
  score int not null,
  total int not null,
  completed_at timestamptz not null default now()
);
create index if not exists retailer_kit_quiz_attempts_kit_idx on retailer_kit_quiz_attempts (kit_id);

alter table retailer_kits disable row level security;
alter table retailer_kit_products disable row level security;
alter table retailer_kit_price_rows disable row level security;
alter table retailer_kit_quiz_questions disable row level security;
alter table retailer_kit_quiz_attempts disable row level security;
