-- Design board extras: dashboard-owned task metadata + completion history.
-- Asana stays the source of truth for the tasks themselves; priority and notes
-- live here so the sync never clobbers them and nobody has to open Asana.

create table if not exists design_task_meta (
  task_gid   text primary key,
  priority   text,             -- 'high' | 'medium' | 'low' | null
  notes      text,
  updated_by text,
  updated_at timestamptz default now()
);
alter table design_task_meta disable row level security;

-- One row per finished task, written when a task is ticked on the dashboard
-- and when the Asana sync sees a task completed in Asana. Powers the
-- time-to-complete / throughput stats.
create table if not exists design_completions (
  task_gid        text primary key,
  name            text,
  project_label   text,
  due_on          date,
  created_at_asana timestamptz,
  completed_at    timestamptz default now(),
  source          text default 'dashboard'   -- 'dashboard' | 'asana'
);
alter table design_completions disable row level security;
