-- Per-person job description + trackable KPIs for the Team hub.
alter table team_members add column if not exists job_description text default '';

create table if not exists team_kpis (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references team_members(id) on delete cascade,
  label      text not null,            -- e.g. "Blended ROAS", "Posts / month"
  target     text default '',          -- freeform so any KPI fits: "3.0", "20/mo", "$40k"
  current    text default '',          -- latest actual
  cadence    text default 'monthly',   -- weekly | monthly | quarterly
  status     text default 'amber',     -- green | amber | red (manager-set)
  sort       int default 0,
  updated_at timestamptz default now()
);
alter table team_kpis disable row level security;
create index if not exists team_kpis_member_idx on team_kpis (member_id);
