-- Eventbrite events with ticket/attendee data, synced from the Eventbrite API.
-- Powers the Events tab. Run once in the Supabase SQL editor.
create table if not exists eventbrite_events (
  event_id      text not null,
  name          text,
  start_at      timestamptz,
  end_at        timestamptz,
  venue         text,
  status        text,
  url           text,
  capacity      int,
  tickets_sold  int default 0,
  gross_revenue numeric default 0,
  currency      text,
  brand_id      int,
  synced_at     timestamptz not null default now(),
  primary key (event_id)
);
alter table eventbrite_events disable row level security;
