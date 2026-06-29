-- Password auth user management + full per-user activity tracking.
-- Run once in the Supabase SQL editor.

-- profiles already backs role / allowed_tabs for member accounts. Make sure it
-- exists and carry a display name + a disabled flag for the admin Users screen.
create table if not exists profiles (
  id uuid primary key,
  role text,
  allowed_tabs text[] default '{}'
);
alter table profiles add column if not exists name text;
alter table profiles add column if not exists disabled boolean not null default false;
alter table profiles add column if not exists created_at timestamptz not null default now();

-- Every meaningful thing a user does: logins, tab/page views, and every change.
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  user_email text,
  action text not null,            -- login | logout | view | create | update | delete | request
  target text,                     -- tab id, table/route, or record reference
  detail jsonb,                    -- method, query, label, anything extra
  path text,
  method text,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_created_idx on activity_log (created_at desc);
create index if not exists activity_log_user_idx on activity_log (user_email, created_at desc);
create index if not exists activity_log_action_idx on activity_log (action, created_at desc);
