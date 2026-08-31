-- Replaces Eventbrite for UPPAbaby Tune-Up Days: customers book + pay the
-- $20 refundable fee through Shopify, sales teams check people in via a
-- shared-key link (no dashboard login), and Mel bulk-refunds everyone
-- checked in once the day wraps up.
create table if not exists tuneup_days (
  id            uuid primary key default gen_random_uuid(),
  state         text not null,
  location      text,
  event_date    date not null,
  capacity      int,
  booking_fee   numeric not null default 20,
  status        text not null default 'scheduled',   -- scheduled | completed | cancelled
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists tuneup_days_date_idx on tuneup_days (event_date desc);
alter table tuneup_days disable row level security;
