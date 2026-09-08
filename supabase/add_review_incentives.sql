-- Reviews & incentive links: one config per QR/link source (e.g. "Frida —
-- Packaging insert", "Frida — Market stall"), each with its own reward and
-- destination, so Mel can tell which channel actually drives reviews.
create table if not exists review_incentives (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,          -- public /review/<slug> path
  brand text not null,
  brand_id int not null,
  label text not null,                -- e.g. "Packaging insert"
  review_url text not null,           -- where "Leave your review" sends them (PDP or Klaviyo write-review page)
  discount_type text not null default 'percentage',   -- percentage | fixed_amount
  discount_value numeric not null,
  min_spend numeric,
  expiry_days int not null default 30,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
alter table review_incentives disable row level security;

-- One row per reward code actually issued, so redemptions are trackable per
-- source the same way winback_sends tracks win-back codes.
create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  incentive_id uuid references review_incentives(id) on delete set null,
  brand text not null,
  brand_id int not null,
  email text not null,
  discount_code text,
  price_rule_id text,
  status text not null default 'issued',   -- issued | redeemed | expired
  redeemed_at timestamptz,
  order_id text,
  order_value numeric,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table review_requests disable row level security;
