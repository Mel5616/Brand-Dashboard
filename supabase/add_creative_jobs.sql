-- Creative production hub: shoots and design jobs move through a pipeline with a
-- shot-list/deliverables checklist, due dates, turnaround and an asset link.
create table if not exists creative_jobs (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  type           text default 'Design',      -- Shoot | Design | Video | Other
  brand          text default '',
  owner_id       uuid references team_members(id) on delete set null,
  status         text default 'requested',   -- requested | in_progress | review | delivered
  priority       text default 'normal',      -- low | normal | high
  requested_date date default current_date,
  due_date       date,
  delivered_date date,                        -- set when status → delivered (for turnaround)
  asset_url      text default '',             -- delivered assets (Drive/Dropbox link)
  notes          text default '',
  checklist      jsonb default '[]'::jsonb,   -- shot list / deliverables: [{text, done}]
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table creative_jobs disable row level security;
create index if not exists creative_jobs_status_idx on creative_jobs (status);
create index if not exists creative_jobs_due_idx    on creative_jobs (due_date);
