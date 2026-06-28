-- New Products (Operations tab). Imported from the WMS Excel (yellow columns only),
-- then enriched with website copy. Each row is one SKU/variant.
create extension if not exists "pgcrypto";

create table if not exists new_products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  sku               text unique,
  source_description text,
  barcode           text,
  weight            numeric,
  length            numeric,
  width             numeric,
  height            numeric,
  -- website copy (editable, AI-draftable)
  long_description  text,
  short_description text,
  whats_in_box      text,
  features          text,
  -- workflow
  brand_id          int,
  status            text not null default 'coming_soon' check (status in ('coming_soon','launching','launched','archived')),
  launch_date       date,
  share_token       uuid not null default gen_random_uuid(),
  attrs             jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists new_products_status_idx on new_products(status);
create index if not exists new_products_token_idx  on new_products(share_token);

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists new_products_touch on new_products;
create trigger new_products_touch before update on new_products
  for each row execute function touch_updated_at();
