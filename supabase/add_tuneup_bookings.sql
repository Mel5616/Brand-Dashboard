-- One row per customer booking for a tuneup_days event. Created as
-- 'pending_payment' the moment someone submits the public booking form
-- (before they've actually paid), then confirmed to 'booked' once
-- /api/tuneup/sync matches a real Shopify order against it via the
-- booking id carried in the order's line-item properties.
create table if not exists tuneup_bookings (
  id                 uuid primary key default gen_random_uuid(),
  tuneup_day_id      uuid not null references tuneup_days(id),
  name               text not null,
  email              text not null,
  phone              text,
  amount             numeric not null default 20,
  shopify_order_id   text,
  shopify_order_number text,
  status             text not null default 'pending_payment',   -- pending_payment | booked | checked_in | refunded | no_show | cancelled
  checked_in_at      timestamptz,
  refunded_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists tuneup_bookings_day_idx on tuneup_bookings (tuneup_day_id, status);
create index if not exists tuneup_bookings_order_idx on tuneup_bookings (shopify_order_id);
alter table tuneup_bookings disable row level security;
