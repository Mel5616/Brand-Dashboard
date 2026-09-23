-- Staff time off (Operations > Staff), synced from Connecteam's "Get User
-- Unavailabilities" API — approved time-off and manual unavailability
-- entries, per person, so days off sit in one central calendar instead of
-- only living inside Connecteam. Read-only mirror; edits happen in Connecteam.
create table if not exists staff_time_off (
  id bigint generated always as identity primary key,
  connecteam_user_id text not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  type text not null default 'timeOff',  -- 'timeOff' | 'unavailability'
  policy_name text,
  note text,
  synced_at timestamptz not null default now(),
  unique (connecteam_user_id, start_date, end_date, type)
);
create index if not exists staff_time_off_dates_idx on staff_time_off (start_date, end_date);
alter table staff_time_off disable row level security;
