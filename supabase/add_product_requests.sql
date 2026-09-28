-- Product/sample requests — staff asking for free stock (samples, replacements,
-- photoshoot product, etc) with zero central visibility. Same public
-- submit + admin approval pattern as giveaways/website_requests.
create extension if not exists "pgcrypto";

create table if not exists product_requests (
  id              uuid primary key default gen_random_uuid(),
  brand_id        int not null,
  reason          text not null,             -- why it's needed (photoshoot, replacement, team sample, etc)
  products        text not null,              -- what's needed: item / variant / qty, free text
  ship_to_name    text,
  ship_to_address text,
  status          text not null default 'proposed' check (status in ('proposed','approved','fulfilled','rejected')),
  admin_note      text,
  approved_by     text,
  approved_at     timestamptz,
  fulfilled_at    timestamptz,
  requester_name  text not null,
  requester_email text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists product_requests_status_idx on product_requests(status);
create index if not exists product_requests_brand_idx  on product_requests(brand_id);
alter table product_requests disable row level security;

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists product_requests_touch on product_requests;
create trigger product_requests_touch before update on product_requests
  for each row execute function touch_updated_at();
