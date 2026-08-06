-- Sales Hub: one intake for everything Sales asks Marketing for (artwork, swatches,
-- Tune-Up nominations, product/gifting requests) plus the guideline pages they're
-- checked against. RLS disabled — access is controlled at the API layer (getAccess()),
-- same as every other table in this dashboard.

create table if not exists marketing_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,       -- artwork | swatch | tune_up | product
  status text not null default 'new',  -- new | triaged | in_progress | review | delivered | on_hold | declined
  requester_email text not null,
  requester_name text,
  assignee_email text,
  brand text,
  retailer text,
  store text,
  state text,                       -- VIC/NSW/QLD/WA/SA/TAS/ACT/NT
  title text,
  end_use text,                     -- required at the form level; kills "just need an image"
  needed_by date,
  brief jsonb not null default '{}',  -- type-specific fields
  sla_due_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_requests_type_idx on marketing_requests (request_type);
create index if not exists marketing_requests_status_idx on marketing_requests (status);
create index if not exists marketing_requests_requester_idx on marketing_requests (requester_email);
alter table marketing_requests disable row level security;

create table if not exists request_files (
  id bigint generated always as identity primary key,
  request_id uuid not null references marketing_requests(id) on delete cascade,
  storage_path text not null,
  file_name text,
  kind text,             -- spec_sheet | photo | other
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists request_files_request_idx on request_files (request_id);
alter table request_files disable row level security;

create table if not exists request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references marketing_requests(id) on delete cascade,
  actor text,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists request_events_request_idx on request_events (request_id);
alter table request_events disable row level security;
